export default class Visualizer {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.keyboardCanvas = null;
        this.keyboardCtx = null;
        this.width = 0;
        this.height = 0;
        this.mouseDownNotes = new Set(); // Track which notes are currently held by mouse
        this.onNoteCallback = null; // Callback for note-on events
        this.offNoteCallback = null; // Callback for note-off events
        this.audioEngine = null; // Reference to audio engine for sound playback

        // Zoom view range to octaves 2..5
        this.viewMinMidi = 36; // C2
        this.viewMaxMidi = 83; // B5
    }

    init(audioEngine) {
        this.canvas = document.getElementById('piano-roll-canvas');
        this.ctx = this.canvas.getContext('2d');

        this.keyboardCanvas = document.getElementById('keyboard-canvas');
        this.keyboardCtx = this.keyboardCanvas.getContext('2d');

        // Store audio engine reference
        this.audioEngine = audioEngine;

        this.resize();
        window.addEventListener('resize', () => this.resize());

        // Setup mouse/touch events for keyboard interaction
        this.setupKeyboardInput();

        // Render empty state
        this.render(0, null);

        console.log("Visualizer Initialized");
    }

    resize() {
        const dpr = window.devicePixelRatio || 1;

        // Piano Roll
        const container = document.getElementById('visualizer-container');
        this.width = container.clientWidth;
        this.height = container.clientHeight;
        this.canvas.width = Math.floor(this.width * dpr);
        this.canvas.height = Math.floor(this.height * dpr);
        this.canvas.style.width = `${this.width}px`;
        this.canvas.style.height = `${this.height}px`;
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        // Keyboard
        const kbContainer = document.getElementById('keyboard-container');
        const kbWidth = kbContainer.clientWidth;
        const kbHeight = kbContainer.clientHeight;
        this.keyboardCanvas.width = Math.floor(kbWidth * dpr);
        this.keyboardCanvas.height = Math.floor(kbHeight * dpr);
        this.keyboardCanvas.style.width = `${kbWidth}px`;
        this.keyboardCanvas.style.height = `${kbHeight}px`;
        this.keyboardCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

        // Re-render if initialized
        if (this.ctx) {
            this.render(0, null);
        }
    }

    reset() {
        this.ctx.clearRect(0, 0, this.width, this.height);
        this.keyboardCtx.clearRect(0, 0, this.keyboardCanvas.width, this.keyboardCanvas.height);
    }

    render(currentTime, midiData, activeUserNotes = new Set(), userNotes = [], expectedNotes = new Set(), interactiveMode = 'off') {
        // Clear canvas
        this.ctx.fillStyle = '#000000';
        this.ctx.fillRect(0, 0, this.width, this.height);

        // Draw octave grid lines
        this.drawOctaveGrid();

        const activeNotes = new Map();

        if (midiData) {
            const timeWindow = 4; // Seconds of music visible on screen
            const pixelsPerSecond = this.height / timeWindow;

            midiData.tracks.forEach(track => {
                track.notes.forEach(note => {
                    // Check if THIS specific note is currently playing (touching piano roll)
                    const isThisNotePlaying = currentTime >= note.time && currentTime < note.time + note.duration;

                    // Track active note metadata for keyboard rendering
                    if (isThisNotePlaying && this.isMidiInViewRange(note.midi)) {
                        const existing = activeNotes.get(note.midi);
                        const currentIsLeft = this.isLeftHandTrack(note.trackName || '', note.trackChannel);
                        const existingIsLeft = existing ? this.isLeftHandTrack(existing.trackName || '', existing.trackChannel) : false;
                        if (!existing || currentIsLeft || !existingIsLeft) {
                            activeNotes.set(note.midi, {
                                trackName: note.trackName,
                                trackChannel: note.trackChannel
                            });
                        }
                    }

                    // Check if note is visible
                    if (this.isMidiInViewRange(note.midi) && note.time + note.duration > currentTime && note.time < currentTime + timeWindow) {
                        const x = this.getNoteX(note.midi);
                        const w = this.getNoteWidth(note.midi);

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

        // Render user-played notes in interactive modes
        // if (interactiveMode !== 'off' && userNotes.length > 0) {
        //     this.renderUserNotes(userNotes, expectedNotes);
        // }

        this.renderKeyboard(activeNotes, activeUserNotes, expectedNotes, interactiveMode);
    }

    drawOctaveGrid() {
        // Draw subtle grid lines for octaves (C notes)
        const minNote = this.viewMinMidi;
        const maxNote = this.viewMaxMidi;

        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        this.ctx.lineWidth = 1;

        for (let midi = minNote; midi <= maxNote; midi++) {
            const noteName = this.getNoteName(midi);
            if (noteName === 'C') {
                const x = this.getNoteX(midi);
                this.ctx.beginPath();
                this.ctx.moveTo(x, 0);
                this.ctx.lineTo(x, this.height);
                this.ctx.stroke();
            }
        }
    }

    drawNote(x, y, w, h, note, isActive, isExpected = false) {
        const ctx = this.ctx;
        const isBlack = this.isBlackKey(note.midi);
        const trackName = note.trackName || '';
        const trackChannel = note.trackChannel;

        // Determine colors based on track, key type and state
        let baseColor, glowColor;

        if (isExpected) {
            // Expected notes in learn mode - highlighted in gold
            baseColor = '#fbbf24';
            glowColor = '#fcd34d';
        } else if (this.isLeftHandTrack(trackName, trackChannel)) {
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
        gradient.addColorStop(1, this.lightenColor(baseColor, 20));

        ctx.fillStyle = gradient;
        ctx.fillRect(x + 1, y, w - 2, h);

        // Reset shadow
        ctx.shadowBlur = 0;

        // Draw subtle border for depth
        ctx.strokeStyle = this.darkenColor(baseColor, 20);
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 1, y, w - 2, h);

        // Add highlight at top for 3D effect
        if (h > 4) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
            ctx.fillRect(x + 2, y + 1, w - 4, 2);
        }

        // Draw note label for falling chord/piano roll notes
        const noteLabel = note.name ? note.name.replace(/\d+$/, '') : this.getNoteLabel(note.midi);
        const noteBottom = y + h;

        // Hide label when the falling note reaches the bottom of the piano roll / virtual keyboard area
        if (w > 24 && h > 20 && noteBottom < this.height - 6) {
            ctx.font = '14px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
            ctx.strokeText(noteLabel, x + w / 2, y + h - 4);
            ctx.fillStyle = '#ffffff';
            ctx.fillText(noteLabel, x + w / 2, y + h - 4);
        }
    }

    drawHitZone() {
        // Draw horizontal line showing where notes should be played
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

    renderUserNotes(userNotes, expectedNotes) {
        // Render notes played by the user in real-time
        userNotes.forEach(noteData => {
            const x = this.getNoteX(noteData.note);
            const w = this.getNoteWidth(noteData.note);

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

    lightenColor(color, percent) {
        const num = parseInt(color.replace('#', ''), 16);
        const amt = Math.round(2.55 * percent);
        const R = Math.min(255, (num >> 16) + amt);
        const G = Math.min(255, (num >> 8 & 0x00FF) + amt);
        const B = Math.min(255, (num & 0x0000FF) + amt);
        return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
    }

    darkenColor(color, percent) {
        const num = parseInt(color.replace('#', ''), 16);
        const amt = Math.round(2.55 * percent);
        const R = Math.max(0, (num >> 16) - amt);
        const G = Math.max(0, (num >> 8 & 0x00FF) - amt);
        const B = Math.max(0, (num & 0x0000FF) - amt);
        return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
    }

    getNoteName(midi) {
        const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        return names[midi % 12];
    }

    getNoteLabel(midi) {
        return this.getNoteName(midi);
    }

    getNoteX(midiNote) {
        // Synthesia-style: position notes based on white key index, with black keys offset
        const minNote = this.viewMinMidi;
        const whiteKeyWidth = this.width / this.getVisibleWhiteKeyCount();

        // Count white keys before this note within the visible range
        let whiteKeysBefore = 0;
        for (let i = minNote; i < midiNote; i++) {
            if (!this.isBlackKey(i)) {
                whiteKeysBefore++;
            }
        }

        const baseX = whiteKeysBefore * whiteKeyWidth;

        // If it's a black key, offset it to be centered between white keys
        if (this.isBlackKey(midiNote)) {
            const blackKeyWidth = whiteKeyWidth * 0.6;
            return baseX - (blackKeyWidth / 2);
        }

        return baseX;
    }

    getNoteWidth(midiNote) {
        const whiteKeyWidth = this.width / this.getVisibleWhiteKeyCount();
        const blackKeyWidth = whiteKeyWidth * 0.6;

        return this.isBlackKey(midiNote) ? blackKeyWidth : whiteKeyWidth;
    }

    getVisibleWhiteKeyCount() {
        let count = 0;
        for (let midi = this.viewMinMidi; midi <= this.viewMaxMidi; midi++) {
            if (!this.isBlackKey(midi)) {
                count++;
            }
        }
        return count;
    }

    isMidiInViewRange(midiNote) {
        return midiNote >= this.viewMinMidi && midiNote <= this.viewMaxMidi;
    }

    isLeftHandTrack(trackName, trackChannel) {
        return /left/i.test(trackName) || trackChannel === 1;
    }

    getNoteWidth(midiNote) {
        const whiteKeyWidth = this.width / this.getVisibleWhiteKeyCount();
        const blackKeyWidth = whiteKeyWidth * 0.6;

        return this.isBlackKey(midiNote) ? blackKeyWidth : whiteKeyWidth;
    }

    renderKeyboard(activeNotes = new Map(), activeUserNotes = new Set(), expectedNotes = new Set(), interactiveMode = 'off') {
        const kbRect = this.keyboardCanvas.getBoundingClientRect();
        const w = kbRect.width;
        const h = kbRect.height;
        const ctx = this.keyboardCtx;

        ctx.clearRect(0, 0, w, h);

        const minNote = this.viewMinMidi;
        const maxNote = this.viewMaxMidi;
        const blackKeyHeight = h * 0.6;
        const whiteKeyWidth = w / this.getVisibleWhiteKeyCount();

        // First pass: Draw all white keys
        let whiteKeyIndex = 0;
        for (let midi = minNote; midi <= maxNote; midi++) {
            if (!this.isBlackKey(midi)) {
                const x = whiteKeyIndex * whiteKeyWidth;

                // Determine color based on state
                let fillColor = '#ffffff';

                // Priority 1: Mouse clicked notes (always show, regardless of mode)
                if (this.mouseDownNotes.has(midi)) {
                    // If in learn mode and this is an expected note, show green, otherwise red
                    fillColor = (expectedNotes.has(midi) && interactiveMode === 'learn') ? '#10b981' : '#ef4444';
                }
                // Priority 2: User notes from MIDI input (only in interactive mode)
                else if (activeUserNotes.has(midi) && interactiveMode !== 'off') {
                    fillColor = expectedNotes.has(midi) ? '#10b981' : '#ef4444'; // Green if correct, red if wrong
                }
                // Priority 3: MIDI file note is playing
                else if (activeNotes.has(midi)) {
                    const trackData = activeNotes.get(midi);
                    if (trackData && this.isLeftHandTrack(trackData.trackName || '', trackData.trackChannel)) {
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
                ctx.fillText(this.getNoteLabel(midi), x + whiteKeyWidth / 2, h - 6);

                whiteKeyIndex++;
            }
        }

        // Second pass: Draw black keys on top
        whiteKeyIndex = 0;
        for (let midi = minNote; midi <= maxNote; midi++) {
            if (!this.isBlackKey(midi)) {
                whiteKeyIndex++;
            } else {
                const x = (whiteKeyIndex * whiteKeyWidth) - (whiteKeyWidth * 0.3);
                const blackKeyWidth = whiteKeyWidth * 0.6;

                // Determine color based on state
                let fillColor = '#000000';

                // Priority 1: Mouse clicked notes (always show, regardless of mode)
                if (this.mouseDownNotes.has(midi)) {
                    fillColor = (expectedNotes.has(midi) && interactiveMode === 'learn') ? '#059669' : '#dc2626';
                }
                // Priority 2: User notes from MIDI input (only in interactive mode)
                else if (activeUserNotes.has(midi) && interactiveMode !== 'off') {
                    fillColor = expectedNotes.has(midi) ? '#059669' : '#dc2626'; // Dark green/red
                }
                // Priority 3: MIDI file note is playing
                else if (activeNotes.has(midi)) {
                    const trackData = activeNotes.get(midi);
                    if (trackData && this.isLeftHandTrack(trackData.trackName || '', trackData.trackChannel)) {
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
                ctx.fillText(this.getNoteLabel(midi), x + blackKeyWidth / 2, blackKeyHeight - 4);
            }
        }
    }

    /**
     * Setup mouse/touch event handlers for keyboard interaction
     */
    setupKeyboardInput() {
        const canvas = this.keyboardCanvas;

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
     * Handle pointer down (mouse or touch)
     */
    handlePointerDown(e) {
        const note = this.getNoteFromPosition(e.clientX, e.clientY);
        if (note !== null && !this.mouseDownNotes.has(note)) {
            this.mouseDownNotes.add(note);

            // Play audio
            if (this.audioEngine) {
                this.audioEngine.playNote(note, 0.8);
            }

            // Trigger callback for interactive mode
            if (this.onNoteCallback) {
                this.onNoteCallback(note, 0.8); // Velocity 0.8
            }
        }
    }

    /**
     * Handle pointer move (for dragging across keys)
     */
    handlePointerMove(e) {
        if (e.buttons === 1 || e.type === 'touchmove') { // Left mouse button or touch
            const note = this.getNoteFromPosition(e.clientX, e.clientY);
            if (note !== null && !this.mouseDownNotes.has(note)) {
                this.mouseDownNotes.add(note);

                // Play audio
                if (this.audioEngine) {
                    this.audioEngine.playNote(note, 0.8);
                }

                // Trigger callback
                if (this.onNoteCallback) {
                    this.onNoteCallback(note, 0.8);
                }
            }
        }
    }

    /**
     * Handle pointer up
     */
    handlePointerUp(e) {
        // Release all held notes
        this.mouseDownNotes.forEach(note => {
            // Stop audio
            if (this.audioEngine) {
                this.audioEngine.stopNote(note);
            }

            // Trigger callback
            if (this.offNoteCallback) {
                this.offNoteCallback(note);
            }
        });
        this.mouseDownNotes.clear();
    }

    /**
     * Get MIDI note from canvas position
     */
    getNoteFromPosition(clientX, clientY) {
        const rect = this.keyboardCanvas.getBoundingClientRect();
        const x = clientX - rect.left;
        const y = clientY - rect.top;

        const minNote = this.viewMinMidi;
        const maxNote = this.viewMaxMidi;
        const kbRect = this.keyboardCanvas.getBoundingClientRect();
        const whiteKeyWidth = kbRect.width / this.getVisibleWhiteKeyCount();
        const blackKeyHeight = kbRect.height * 0.6;

        // First check black keys (they're on top)
        if (y < blackKeyHeight) {
            let whiteKeyIndex = 0;
            for (let midi = minNote; midi <= maxNote; midi++) {
                if (!this.isBlackKey(midi)) {
                    whiteKeyIndex++;
                } else {
                    const keyX = (whiteKeyIndex * whiteKeyWidth) - (whiteKeyWidth * 0.3);
                    const blackKeyWidth = whiteKeyWidth * 0.6;

                    if (x >= keyX && x < keyX + blackKeyWidth) {
                        return midi;
                    }
                }
            }
        }

        // Then check white keys
        let whiteKeyIndex = 0;
        for (let midi = minNote; midi <= maxNote; midi++) {
            if (!this.isBlackKey(midi)) {
                const keyX = whiteKeyIndex * whiteKeyWidth;

                if (x >= keyX && x < keyX + whiteKeyWidth) {
                    return midi;
                }

                whiteKeyIndex++;
            }
        }

        return null;
    }

    /**
     * Set callbacks for note events
     */
    setNoteCallbacks(onNote, offNote) {
        this.onNoteCallback = onNote;
        this.offNoteCallback = offNote;
    }

    isBlackKey(midi) {
        const n = midi % 12;
        return n === 1 || n === 3 || n === 6 || n === 8 || n === 10;
    }
}
