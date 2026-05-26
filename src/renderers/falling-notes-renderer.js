/**
 * falling-notes-renderer.js — Renders the falling notes (piano roll) visualization.
 * Can be hidden when other visual modes (sheet, jianpu) are active.
 *
 * PURE VIEW: Only draws based on current playback state.
 * Does not play audio, manage transport, or parse MIDI.
 *
 * render() returns { activeNotes } so the piano renderer knows which keys
 * are currently playing for keyboard highlighting.
 */
import {
    isBlackKey,
    getNoteName,
    getNoteLabel,
    isLeftHandTrack,
    lightenColor,
    darkenColor
} from '../utils/music-utils.js';

export default class FallingNotesRenderer {
    /**
     * @param {import('../utils/music-utils.js').NoteLayout} noteLayout - Shared layout for pixel alignment
     */
    constructor(noteLayout) {
        this.noteLayout = noteLayout;
        this.canvas = null;
        this.ctx = null;
        this.width = 0;
        this.height = 0;
        this.visible = true;

        // Constant visual fall speed in pixels per second.
        // timeWindow is computed dynamically from height so notes always
        // travel the full canvas height at this speed, regardless of screen size.
        this.PIXELS_PER_SECOND = 200;

        // Watermark image
        this.watermark = new Image();
        this.watermarkLoaded = false;
        this.watermark.onload = () => { this.watermarkLoaded = true; };
        this.watermark.src = './public/assets/images/watermark.png';
    }

    /**
     * Initialize the falling notes renderer with a canvas element.
     * @param {HTMLCanvasElement} canvasEl - The piano roll canvas
     */
    init(canvasEl) {
        this.canvas = canvasEl;
        this.ctx = this.canvas.getContext('2d');
        this.resize();
    }

    /**
     * Resize the canvas to match its container.
     */
    resize() {
        const dpr = window.devicePixelRatio || 1;
        const container = this.canvas.parentElement;
        this.width = container.clientWidth;
        this.height = container.clientHeight;
        this.canvas.width = Math.floor(this.width * dpr);
        this.canvas.height = Math.floor(this.height * dpr);
        this.canvas.style.width = `${this.width}px`;
        this.canvas.style.height = `${this.height}px`;
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    /**
     * Clear the canvas.
     */
    reset() {
        this.ctx.clearRect(0, 0, this.width, this.height);
    }

    /** Show this renderer's canvas */
    show() {
        this.visible = true;
        if (this.canvas && this.canvas.parentElement) {
            this.canvas.parentElement.style.display = '';
        }
    }

    /** Hide this renderer's canvas */
    hide() {
        this.visible = false;
        if (this.canvas && this.canvas.parentElement) {
            this.canvas.parentElement.style.display = 'none';
        }
    }

    /**
     * Render falling notes for the current playback state.
     *
     * @param {number} currentTime - Current playback time in seconds
     * @param {object|null} midiData - Parsed MIDI data
     * @param {Set<number>} activeUserNotes - Notes pressed by user
     * @param {Array} userNotes - User note history for visualization
     * @param {Set<number>} expectedNotes - Expected notes in learn mode
     * @param {string} interactiveMode - Current mode ('off' | 'realtime' | 'learn')
     * @returns {{ activeNotes: Map<number, {trackName: string, trackChannel: number}> }}
     */
    render(currentTime, midiData, activeUserNotes = new Set(), userNotes = [], expectedNotes = new Set(), interactiveMode = 'off') {
        if (!this.visible) return { activeNotes: new Map() };

        const ctx = this.ctx;
        const layout = this.noteLayout;

        // Clear canvas
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, this.width, this.height);

        // Draw watermark on piano roll background so notes can pass over it
        if (this.watermarkLoaded) {
            this.drawWatermark();
        }

        // Draw octave grid lines
        this.drawOctaveGrid();

        const activeNotes = new Map();

        if (midiData) {
            // Dynamic timeWindow: always derived from canvas height so that
            // the visual fall speed (px/s) stays constant across all screen sizes.
            const pixelsPerSecond = this.PIXELS_PER_SECOND;
            const timeWindow = this.height / pixelsPerSecond; // seconds visible on screen

            midiData.tracks.forEach(track => {
                track.notes.forEach(note => {
                    // Check if THIS specific note is currently playing (touching piano roll)
                    const isThisNotePlaying = currentTime >= note.time && currentTime < note.time + note.duration;

                    // Track active note metadata for keyboard rendering
                    if (isThisNotePlaying && layout.isMidiInViewRange(note.midi)) {
                        const existing = activeNotes.get(note.midi);
                        const currentIsLeft = isLeftHandTrack(note.trackName || '', note.trackChannel);
                        const existingIsLeft = existing ? isLeftHandTrack(existing.trackName || '', existing.trackChannel) : false;
                        if (!existing || currentIsLeft || !existingIsLeft) {
                            activeNotes.set(note.midi, {
                                trackName: note.trackName,
                                trackChannel: note.trackChannel
                            });
                        }
                    }

                    // Check if note is visible
                    if (layout.isMidiInViewRange(note.midi) && note.time + note.duration > currentTime && note.time < currentTime + timeWindow) {
                        const x = layout.getNoteX(note.midi, this.width);
                        const w = layout.getNoteWidth(note.midi, this.width);

                        // Y calculation
                        const yBottom = this.height - (note.time - currentTime) * pixelsPerSecond;
                        const yTop = yBottom - (note.duration * pixelsPerSecond);

                        // Clip to screen
                        const renderY = Math.max(0, yTop);
                        const renderH = Math.min(this.height, yBottom) - renderY;

                        if (renderH > 0) {
                            // Highlight expected notes in learn mode
                            const isExpected = expectedNotes.has(note.midi) && interactiveMode === 'learn';
                            // Only highlight THIS note if IT is playing, not all notes with same midi
                            this.drawNote(x, renderY, w, renderH, note, isThisNotePlaying, isExpected);
                        }
                    }
                });
            });
        }

        // Draw hit zone in learn-to-play mode
        if (interactiveMode === 'learn') {
            this.drawHitZone();
        }

        return { activeNotes };
    }

    // ─── Drawing Helpers ─────────────────────────────────────────────────────

    /**
     * Draw the watermark image centered on the canvas.
     */
    drawWatermark() {
        const maxWidth = Math.min(this.width * 0.6, 280);
        const aspectRatio = this.watermark.width / this.watermark.height;
        const w = maxWidth;
        const h = maxWidth / aspectRatio;
        const x = (this.width - w) / 2;
        const y = (this.height - h) / 2 - 120;

        this.ctx.save();
        this.ctx.globalAlpha = 0.15;
        this.ctx.drawImage(this.watermark, x, y, w, h);
        this.ctx.restore();
    }

    /**
     * Draw subtle vertical grid lines at each octave boundary (C notes).
     */
    drawOctaveGrid() {
        const layout = this.noteLayout;
        const minNote = layout.viewMinMidi;
        const maxNote = layout.viewMaxMidi;

        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        this.ctx.lineWidth = 1;

        for (let midi = minNote; midi <= maxNote; midi++) {
            if (getNoteName(midi) === 'C') {
                const x = layout.getNoteX(midi, this.width);
                this.ctx.beginPath();
                this.ctx.moveTo(x, 0);
                this.ctx.lineTo(x, this.height);
                this.ctx.stroke();
            }
        }
    }

    /**
     * Draw a single falling note with gradient, glow, borders, and label.
     *
     * @param {number} x - X position
     * @param {number} y - Y position (top of visible portion)
     * @param {number} w - Width
     * @param {number} h - Height (visible portion)
     * @param {object} note - MIDI note object
     * @param {boolean} isActive - Whether this specific note is currently playing
     * @param {boolean} isExpected - Whether this is an expected note in learn mode
     */
    drawNote(x, y, w, h, note, isActive, isExpected = false) {
        const ctx = this.ctx;
        const isBlack = isBlackKey(note.midi);
        const trackName = note.trackName || '';
        const trackChannel = note.trackChannel;

        // Determine colors based on track, key type and state
        let baseColor, glowColor;

        if (isExpected) {
            // Expected notes in learn mode - highlighted in gold
            baseColor = '#fbbf24';
            glowColor = '#fcd34d';
        } else if (isLeftHandTrack(trackName, trackChannel)) {
            // Left-hand tracks use a red theme
            baseColor = isActive ? '#ef4444' : '#fca5a5';
            glowColor = '#f87171';
        } else if (isBlack) {
            // Black keys - purple/blue tones
            baseColor = isActive ? '#8b5cf6' : '#6366f1';
            glowColor = '#a78bfa';
        } else {
            // White keys / right-hand default - blue/cyan tones
            baseColor = isActive ? '#3b82f6' : '#60a5fa';
            glowColor = '#93c5fd';
        }

        // Draw glow effect for active or expected notes
        if (isActive || isExpected) {
            ctx.shadowBlur = 15;
            ctx.shadowColor = glowColor;
        }

        // Draw main note body with gradient
        const gradient = ctx.createLinearGradient(x, y, x + w, y);
        gradient.addColorStop(0, baseColor);
        gradient.addColorStop(1, lightenColor(baseColor, 20));

        ctx.fillStyle = gradient;
        ctx.fillRect(x + 1, y, w - 2, h);

        // Draw stronger outline for note clarity
        ctx.shadowBlur = 0;
        ctx.strokeStyle = darkenColor(baseColor, 35);
        ctx.lineWidth = 4;
        ctx.strokeRect(x + 1, y, w - 2, h);

        // Extra contrasting border
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

        // Add highlight at top for 3D effect
        if (h > 4) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
            ctx.fillRect(x + 2, y + 1, w - 4, 2);
        }

        // Draw note label for falling chord/piano roll notes
        const noteLabel = note.name ? note.name.replace(/\d+$/, '') : getNoteLabel(note.midi);
        const noteBottom = y + h;

        // Hide label when the falling note reaches the bottom of the piano roll / virtual keyboard area
        if (w > 24 && h > 20 && noteBottom < this.height - 6) {
            ctx.font = '18px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.lineWidth = 1;
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
            ctx.strokeText(noteLabel, x + w / 2, y + h - 4);
            ctx.fillStyle = isBlackKey(note.midi) ? '#ffffff' : '#3a3737';
            ctx.fillText(noteLabel, x + w / 2, y + h - 4);
        }
    }

    /**
     * Draw the hit zone line in learn-to-play mode (dashed amber line).
     */
    drawHitZone() {
        const hitZoneY = this.height * 0.85; // 85% down the screen

        this.ctx.strokeStyle = 'rgba(251, 191, 36, 0.6)'; // Amber
        this.ctx.lineWidth = 3;
        this.ctx.setLineDash([10, 5]);
        this.ctx.beginPath();
        this.ctx.moveTo(0, hitZoneY);
        this.ctx.lineTo(this.width, hitZoneY);
        this.ctx.stroke();
        this.ctx.setLineDash([]); // Reset dash

        // Add glow effect
        this.ctx.strokeStyle = 'rgba(251, 191, 36, 0.3)';
        this.ctx.lineWidth = 8;
        this.ctx.beginPath();
        this.ctx.moveTo(0, hitZoneY);
        this.ctx.lineTo(this.width, hitZoneY);
        this.ctx.stroke();
    }

    /**
     * Render user-played notes as colored blocks near the bottom.
     * @param {Array} userNotes - User note history
     * @param {Set<number>} expectedNotes - Expected notes for validation coloring
     */
    renderUserNotes(userNotes, expectedNotes) {
        userNotes.forEach(noteData => {
            const layout = this.noteLayout;
            const x = layout.getNoteX(noteData.note, this.width);
            const w = layout.getNoteWidth(noteData.note, this.width);

            // Position at bottom of screen
            const h = 30; // Fixed height for user notes
            const y = this.height - h - 10;

            // Determine color based on correctness
            let color;
            if (noteData.isCorrect === true) {
                color = '#10b981'; // Green - correct
            } else if (noteData.isCorrect === false) {
                color = '#ef4444'; // Red - incorrect
            } else {
                color = '#60a5fa'; // Blue - neutral (realtime mode)
            }

            // Apply opacity for fading effect
            const alpha = noteData.opacity || 1.0;
            this.ctx.globalAlpha = alpha;

            // Draw user note with glow
            this.ctx.shadowBlur = 20;
            this.ctx.shadowColor = color;
            this.ctx.fillStyle = color;
            this.ctx.fillRect(x + 1, y, w - 2, h);

            // Reset
            this.ctx.shadowBlur = 0;
            this.ctx.globalAlpha = 1.0;
        });
    }
}
