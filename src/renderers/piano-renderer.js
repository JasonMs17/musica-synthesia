/**
 * piano-renderer.js — Renders the virtual piano keyboard.
 * Always visible regardless of which visual mode is active.
 * Handles mouse/touch interaction for manual note playing.
 *
 * PURE VIEW: Does not play audio or manage transport.
 * Audio playback on key press is handled via callbacks set by the orchestrator.
 */
import { isBlackKey, getNoteLabel, isLeftHandTrack } from '../utils/music-utils.js';

export default class PianoRenderer {
    /**
     * @param {import('../utils/music-utils.js').NoteLayout} noteLayout - Shared layout for pixel alignment
     */
    constructor(noteLayout) {
        this.noteLayout = noteLayout;
        this.canvas = null;
        this.ctx = null;
        this.mouseDownNotes = new Set(); // Track which notes are currently held by mouse
        this.onNoteCallback = null;  // Called on note press (note, velocity)
        this.offNoteCallback = null; // Called on note release (note)
    }

    /**
     * Initialize the piano renderer with a canvas element.
     * @param {HTMLCanvasElement} canvasEl - The keyboard canvas
     */
    init(canvasEl) {
        this.canvas = canvasEl;
        this.ctx = this.canvas.getContext('2d');
        this.setupKeyboardInput();
        this.resize();
    }

    /**
     * Resize the keyboard canvas to match its container.
     */
    resize() {
        const dpr = window.devicePixelRatio || 1;
        const container = this.canvas.parentElement;
        const w = container.clientWidth;
        const h = container.clientHeight;
        this.canvas.width = Math.floor(w * dpr);
        this.canvas.height = Math.floor(h * dpr);
        this.canvas.style.width = `${w}px`;
        this.canvas.style.height = `${h}px`;
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    /**
     * Clear the keyboard canvas.
     */
    reset() {
        const rect = this.canvas.getBoundingClientRect();
        this.ctx.clearRect(0, 0, rect.width, rect.height);
    }

    /**
     * Render the piano keyboard with active note highlighting.
     *
     * @param {Map<number, {trackName: string, trackChannel: number}>} activeNotes - Currently playing MIDI notes
     * @param {Set<number>} activeUserNotes - Notes pressed by the user (MIDI input)
     * @param {Set<number>} expectedNotes - Notes expected in learn mode
     * @param {string} interactiveMode - Current mode ('off' | 'realtime' | 'learn')
     */
    render(activeNotes = new Map(), activeUserNotes = new Set(), expectedNotes = new Set(), interactiveMode = 'off') {
        const rect = this.canvas.getBoundingClientRect();
        const w = rect.width;
        const h = rect.height;
        const ctx = this.ctx;

        ctx.clearRect(0, 0, w, h);

        const layout = this.noteLayout;
        const minNote = layout.viewMinMidi;
        const maxNote = layout.viewMaxMidi;
        const blackKeyHeight = h * 0.6;
        const whiteKeyWidth = w / layout.getVisibleWhiteKeyCount();

        // ── First pass: Draw all white keys ──────────────────────────────────

        let whiteKeyIndex = 0;
        for (let midi = minNote; midi <= maxNote; midi++) {
            if (!isBlackKey(midi)) {
                const x = whiteKeyIndex * whiteKeyWidth;

                // Determine color based on priority state
                let fillColor = '#ffffff';

                // Priority 1: Mouse clicked notes (always show)
                if (this.mouseDownNotes.has(midi)) {
                    fillColor = (expectedNotes.has(midi) && interactiveMode === 'learn') ? '#10b981' : '#ef4444';
                }
                // Priority 2: User notes from MIDI input (only in interactive mode)
                else if (activeUserNotes.has(midi) && interactiveMode !== 'off') {
                    fillColor = expectedNotes.has(midi) ? '#10b981' : '#ef4444';
                }
                // Priority 3: MIDI file note is playing
                else if (activeNotes.has(midi)) {
                    const trackData = activeNotes.get(midi);
                    if (trackData && isLeftHandTrack(trackData.trackName || '', trackData.trackChannel)) {
                        fillColor = '#ef4444';
                    } else {
                        fillColor = '#93c5fd';
                    }
                }
                // Priority 4: Expected note in learn mode
                else if (expectedNotes.has(midi) && interactiveMode === 'learn') {
                    fillColor = '#fef3c7'; // Light amber
                }

                ctx.fillStyle = fillColor;
                ctx.fillRect(x, 0, whiteKeyWidth, h);

                // Border
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = 1;
                ctx.strokeRect(x, 0, whiteKeyWidth, h);

                // White key label
                ctx.fillStyle = '#111';
                ctx.font = '14px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'bottom';
                ctx.fillText(getNoteLabel(midi), x + whiteKeyWidth / 2, h - 6);

                whiteKeyIndex++;
            }
        }

        // ── Second pass: Draw black keys on top ──────────────────────────────

        whiteKeyIndex = 0;
        for (let midi = minNote; midi <= maxNote; midi++) {
            if (!isBlackKey(midi)) {
                whiteKeyIndex++;
            } else {
                const x = (whiteKeyIndex * whiteKeyWidth) - (whiteKeyWidth * 0.3);
                const blackKeyWidth = whiteKeyWidth * 0.6;

                // Determine color based on priority state
                let fillColor = '#000000';

                // Priority 1: Mouse clicked notes
                if (this.mouseDownNotes.has(midi)) {
                    fillColor = (expectedNotes.has(midi) && interactiveMode === 'learn') ? '#059669' : '#dc2626';
                }
                // Priority 2: User notes from MIDI input
                else if (activeUserNotes.has(midi) && interactiveMode !== 'off') {
                    fillColor = expectedNotes.has(midi) ? '#059669' : '#dc2626';
                }
                // Priority 3: MIDI file note is playing
                else if (activeNotes.has(midi)) {
                    const trackData = activeNotes.get(midi);
                    if (trackData && isLeftHandTrack(trackData.trackName || '', trackData.trackChannel)) {
                        fillColor = '#ef4444';
                    } else {
                        fillColor = '#3b82f6';
                    }
                }
                // Priority 4: Expected note in learn mode
                else if (expectedNotes.has(midi) && interactiveMode === 'learn') {
                    fillColor = '#fbbf24'; // Amber
                }

                ctx.fillStyle = fillColor;
                ctx.fillRect(x, 0, blackKeyWidth, blackKeyHeight);

                // Border
                ctx.strokeStyle = '#111';
                ctx.lineWidth = 1;
                ctx.strokeRect(x, 0, blackKeyWidth, blackKeyHeight);

                // Black key label
                ctx.fillStyle = '#ffffff';
                ctx.font = '12px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'bottom';
                ctx.fillText(getNoteLabel(midi), x + blackKeyWidth / 2, blackKeyHeight - 4);
            }
        }
    }

    // ─── Mouse/Touch Input ───────────────────────────────────────────────────

    /**
     * Set callbacks for note events from keyboard interaction.
     * The orchestrator (app.js) routes these to audio engine + interactive mode.
     *
     * @param {Function} onNote - Called with (midiNote, velocity) on key press
     * @param {Function} offNote - Called with (midiNote) on key release
     */
    setNoteCallbacks(onNote, offNote) {
        this.onNoteCallback = onNote;
        this.offNoteCallback = offNote;
    }

    /**
     * Setup mouse/touch event handlers for keyboard interaction.
     */
    setupKeyboardInput() {
        const canvas = this.canvas;

        // Mouse events
        canvas.addEventListener('mousedown', (e) => this.handlePointerDown(e));
        canvas.addEventListener('mousemove', (e) => this.handlePointerMove(e));
        canvas.addEventListener('mouseup', (e) => this.handlePointerUp(e));
        canvas.addEventListener('mouseleave', (e) => this.handlePointerUp(e));

        // Touch events
        canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.handlePointerDown(e.touches[0]);
        });
        canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            this.handlePointerMove(e.touches[0]);
        });
        canvas.addEventListener('touchend', (e) => {
            e.preventDefault();
            this.handlePointerUp(e);
        });

        canvas.style.cursor = 'pointer';
        canvas.style.touchAction = 'none'; // Prevent default touch behaviors
    }

    /**
     * Handle pointer down (mouse or touch).
     */
    handlePointerDown(e) {
        const note = this.getNoteFromPosition(e.clientX, e.clientY);
        if (note !== null && !this.mouseDownNotes.has(note)) {
            this.mouseDownNotes.add(note);

            // Trigger callback (orchestrator handles audio + interactive mode)
            if (this.onNoteCallback) {
                this.onNoteCallback(note, 0.8);
            }
        }
    }

    /**
     * Handle pointer move (for dragging across keys).
     */
    handlePointerMove(e) {
        if (e.buttons === 1 || e.type === 'touchmove') {
            const note = this.getNoteFromPosition(e.clientX, e.clientY);
            if (note !== null && !this.mouseDownNotes.has(note)) {
                this.mouseDownNotes.add(note);

                if (this.onNoteCallback) {
                    this.onNoteCallback(note, 0.8);
                }
            }
        }
    }

    /**
     * Handle pointer up — release all held notes.
     */
    handlePointerUp(e) {
        this.mouseDownNotes.forEach(note => {
            if (this.offNoteCallback) {
                this.offNoteCallback(note);
            }
        });
        this.mouseDownNotes.clear();
    }

    /**
     * Get MIDI note from a canvas position (hit testing).
     * Checks black keys first (they're visually on top), then white keys.
     *
     * @param {number} clientX - Mouse/touch X position
     * @param {number} clientY - Mouse/touch Y position
     * @returns {number|null} MIDI note number, or null if no key hit
     */
    getNoteFromPosition(clientX, clientY) {
        const rect = this.canvas.getBoundingClientRect();
        const x = clientX - rect.left;
        const y = clientY - rect.top;

        const layout = this.noteLayout;
        const minNote = layout.viewMinMidi;
        const maxNote = layout.viewMaxMidi;
        const whiteKeyWidth = rect.width / layout.getVisibleWhiteKeyCount();
        const blackKeyHeight = rect.height * 0.6;

        // First check black keys (they're on top)
        if (y < blackKeyHeight) {
            let whiteKeyIndex = 0;
            for (let midi = minNote; midi <= maxNote; midi++) {
                if (!isBlackKey(midi)) {
                    whiteKeyIndex++;
                } else {
                    const keyX = (whiteKeyIndex * whiteKeyWidth) - (whiteKeyWidth * 0.3);
                    const bkw = whiteKeyWidth * 0.6;

                    if (x >= keyX && x < keyX + bkw) {
                        return midi;
                    }
                }
            }
        }

        // Then check white keys
        let whiteKeyIndex = 0;
        for (let midi = minNote; midi <= maxNote; midi++) {
            if (!isBlackKey(midi)) {
                const keyX = whiteKeyIndex * whiteKeyWidth;

                if (x >= keyX && x < keyX + whiteKeyWidth) {
                    return midi;
                }

                whiteKeyIndex++;
            }
        }

        return null;
    }
}
