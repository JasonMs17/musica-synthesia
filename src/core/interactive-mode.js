/**
 * interactive-mode.js — Manages interactive and learn-to-play modes.
 * Handles note validation, user input tracking, and playback progression.
 * Works with MIDI input or mouse/touch keyboard interaction.
 */
export default class InteractiveModeManager {
    constructor() {
        this.mode = 'off'; // 'off' | 'realtime' | 'learn'
        this.userPressedNotes = new Map(); // note -> { velocity, timestamp }
        this.userNoteHistory = []; // For visualization
        this.expectedNotes = new Set(); // Notes that should be played now
        this.currentExpectedNoteObjects = []; // Full note objects for the expected notes
        this.currentValidationTime = 0;
        this.timingTolerance = 0.1; // seconds - stricter timing for note-by-note validation
        this.noteTimeThreshold = 0.05; // seconds - notes within this time are considered simultaneous (chord)
        this.hitZoneStart = 0; // Time when notes enter hit zone
        this.waitingForInput = false;
        this.correctNotesPlayed = new Set();
    }

    /**
     * Set the current mode
     * @param {string} mode - 'off' | 'realtime' | 'learn'
     */
    setMode(mode) {
        if (['off', 'realtime', 'learn'].includes(mode)) {
            this.mode = mode;
            this.reset();
            console.log(`Interactive Mode: ${mode}`);
        }
    }

    /**
     * Get current mode
     * @returns {string} Current mode
     */
    getMode() {
        return this.mode;
    }

    /**
     * Handle note press from MIDI input
     * @param {number} note - MIDI note number
     * @param {number} velocity - Velocity (0-1)
     */
    handleNoteOn(note, velocity) {
        const timestamp = performance.now();

        this.userPressedNotes.set(note, {
            velocity: velocity,
            timestamp: timestamp,
            startTime: timestamp
        });

        // Add to history for visualization
        this.userNoteHistory.push({
            note: note,
            velocity: velocity,
            timestamp: timestamp,
            isCorrect: null, // Will be determined
            released: false
        });

        // In learn mode, validate the note
        if (this.mode === 'learn') {
            this.validateCurrentNotes();
        }
    }

    /**
     * Handle note release from MIDI input
     * @param {number} note - MIDI note number
     */
    handleNoteOff(note) {
        if (this.userPressedNotes.has(note)) {
            const noteData = this.userPressedNotes.get(note);
            const duration = (performance.now() - noteData.startTime) / 1000;

            // Mark as released in history
            const historyEntry = this.userNoteHistory.find(
                entry => entry.note === note && !entry.released
            );
            if (historyEntry) {
                historyEntry.released = true;
                historyEntry.duration = duration;
            }

            this.userPressedNotes.delete(note);
        }
    }

    /**
     * Get expected notes at a given time from MIDI data
     * @param {number} currentTime - Current playback time in seconds
     * @param {object} midiData - MIDI data object
     * @returns {Array} Array of expected note objects
     */
    getExpectedNotes(currentTime, midiData) {
        if (!midiData || this.mode !== 'learn') return [];

        const expectedNotes = [];
        const lookAheadTime = 0.1; // Look ahead slightly

        midiData.tracks.forEach(track => {
            track.notes.forEach(note => {
                // Only include notes that are at or very close to current time
                const noteTime = note.time;
                const timeDiff = noteTime - currentTime;

                // Note must be within tolerance and not yet played
                const isInHitZone = timeDiff >= -this.timingTolerance && timeDiff <= this.timingTolerance;

                if (isInHitZone && !this.correctNotesPlayed.has(`${note.time}-${note.midi}`)) {
                    expectedNotes.push({
                        midi: note.midi,
                        time: note.time,
                        duration: note.duration,
                        velocity: note.velocity,
                        name: note.name
                    });
                }
            });
        });

        // Sort by time to get the earliest notes first
        expectedNotes.sort((a, b) => a.time - b.time);

        // Only return notes that are part of the current "moment"
        // If there are notes, return only those within noteTimeThreshold of the earliest note
        if (expectedNotes.length > 0) {
            const earliestTime = expectedNotes[0].time;
            return expectedNotes.filter(note =>
                Math.abs(note.time - earliestTime) <= this.noteTimeThreshold
            );
        }

        return expectedNotes;
    }

    /**
     * Update expected notes for current time
     * @param {number} currentTime - Current time in seconds
     * @param {object} midiData - MIDI data
     */
    updateExpectedNotes(currentTime, midiData) {
        if (this.mode !== 'learn') return;

        this.currentValidationTime = currentTime;
        const expected = this.getExpectedNotes(currentTime, midiData);
        this.currentExpectedNoteObjects = expected;

        this.expectedNotes.clear();
        expected.forEach(note => {
            this.expectedNotes.add(note.midi);
        });

        // Update waiting status
        this.waitingForInput = this.expectedNotes.size > 0;
    }

    /**
     * Validate currently pressed notes against expected notes
     * @returns {object} Validation result {allCorrect, correctNotes, incorrectNotes}
     */
    validateCurrentNotes() {
        if (this.mode !== 'learn') return null;

        const pressedNotes = new Set(this.userPressedNotes.keys());
        const correctNotes = new Set();
        const incorrectNotes = new Set();

        // Check which pressed notes are correct
        pressedNotes.forEach(note => {
            if (this.expectedNotes.has(note)) {
                correctNotes.add(note);
            } else {
                incorrectNotes.add(note);
            }
        });

        // Update history with validation results
        this.userNoteHistory.forEach(entry => {
            if (entry.isCorrect === null && pressedNotes.has(entry.note)) {
                entry.isCorrect = this.expectedNotes.has(entry.note);
            }
        });

        // Check if all expected notes are pressed
        const allExpectedPressed = Array.from(this.expectedNotes).every(
            note => pressedNotes.has(note)
        );

        return {
            allCorrect: allExpectedPressed && incorrectNotes.size === 0,
            correctNotes: Array.from(correctNotes),
            incorrectNotes: Array.from(incorrectNotes),
            allExpectedPressed: allExpectedPressed,
            hasIncorrect: incorrectNotes.size > 0
        };
    }

    /**
     * Check if playback should advance (all correct notes played)
     * @returns {boolean} Can advance
     */
    canAdvancePlayback() {
        if (this.mode !== 'learn') return true;
        if (this.expectedNotes.size === 0) return true;

        const validation = this.validateCurrentNotes();
        return validation && validation.allCorrect;
    }

    /**
     * Check if playback should pause because a note deadline is reached
     * @param {number} currentTime
     * @returns {boolean}
     */
    shouldPause(currentTime) {
        if (this.mode !== 'learn') return false;

        // Pause if we have expected notes and we've reached or passed their time
        if (this.currentExpectedNoteObjects.length > 0) {
            const earliestNote = this.currentExpectedNoteObjects[0];
            // Pause if we've reached the note time (with small buffer)
            return currentTime >= earliestNote.time - 0.01;
        }

        return false;
    }

    /**
     * Mark current notes as correctly played and allow progression
     * @param {number} currentTime - Current time
     */
    confirmNotesPlayed(currentTime) {
        // Only confirm notes that are both expected AND currently pressed
        const pressedNotes = new Set(this.userPressedNotes.keys());

        this.currentExpectedNoteObjects.forEach(note => {
            // Only mark as played if the user actually pressed this note
            if (pressedNotes.has(note.midi)) {
                this.correctNotesPlayed.add(`${note.time}-${note.midi}`);
            }
        });

        // Only clear waiting if ALL expected notes were pressed
        const allPressed = this.currentExpectedNoteObjects.every(note =>
            pressedNotes.has(note.midi)
        );

        if (allPressed) {
            this.waitingForInput = false;
        }
    }

    /**
     * Get user notes for rendering (with validation status)
     * @returns {Array} Array of note objects for visualization
     */
    getUserNotesForRendering() {
        const currentTime = performance.now();
        const fadeTime = 500; // ms - how long to show notes after release

        return this.userNoteHistory
            .filter(entry => {
                // Show if currently pressed or recently released
                if (!entry.released) return true;
                const timeSinceRelease = currentTime - (entry.timestamp + (entry.duration || 0) * 1000);
                return timeSinceRelease < fadeTime;
            })
            .map(entry => ({
                note: entry.note,
                velocity: entry.velocity,
                isCorrect: entry.isCorrect,
                released: entry.released,
                timestamp: entry.timestamp,
                duration: entry.duration || 0,
                opacity: entry.released ?
                    Math.max(0, 1 - (currentTime - (entry.timestamp + (entry.duration || 0) * 1000)) / fadeTime) :
                    1.0
            }));
    }

    /**
     * Get currently pressed notes
     * @returns {Set} Set of MIDI note numbers
     */
    getCurrentlyPressedNotes() {
        return new Set(this.userPressedNotes.keys());
    }

    /**
     * Check if waiting for user input
     * @returns {boolean} Is waiting
     */
    isWaitingForInput() {
        return this.waitingForInput;
    }

    /**
     * Get expected notes set
     * @returns {Set} Set of expected MIDI note numbers
     */
    getExpectedNotesSet() {
        return new Set(this.expectedNotes);
    }

    /**
     * Reset state
     */
    reset() {
        this.userPressedNotes.clear();
        this.userNoteHistory = [];
        this.expectedNotes.clear();
        this.correctNotesPlayed.clear();
        this.waitingForInput = false;
        this.currentValidationTime = 0;
    }

    /**
     * Clear old history entries to prevent memory buildup
     */
    cleanupHistory() {
        const currentTime = performance.now();
        const maxAge = 5000; // Keep last 5 seconds

        this.userNoteHistory = this.userNoteHistory.filter(entry => {
            return currentTime - entry.timestamp < maxAge;
        });
    }
}
