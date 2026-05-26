/**
 * music-utils.js — Shared music/MIDI utility functions.
 * Used by renderers, audio engine, and app orchestrator.
 * Consolidates helpers that were previously duplicated across modules.
 */

// ─── Note Names ──────────────────────────────────────────────────────────────

/** Standard chromatic note names */
export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// ─── Note Helpers ────────────────────────────────────────────────────────────

/**
 * Check if a MIDI note number corresponds to a black key.
 * @param {number} midi - MIDI note number (0-127)
 * @returns {boolean}
 */
export function isBlackKey(midi) {
    const n = midi % 12;
    return n === 1 || n === 3 || n === 6 || n === 8 || n === 10;
}

/**
 * Convert MIDI note number to full note name with octave (e.g., 60 → "C4").
 * @param {number} midi - MIDI note number
 * @returns {string} Note name with octave
 */
export function midiToNoteName(midi) {
    const octave = Math.floor(midi / 12) - 1;
    return `${NOTE_NAMES[midi % 12]}${octave}`;
}

/**
 * Get just the note name without octave (e.g., 60 → "C").
 * @param {number} midi - MIDI note number
 * @returns {string} Note name
 */
export function getNoteName(midi) {
    return NOTE_NAMES[midi % 12];
}

/**
 * Get display label for a note (currently same as getNoteName).
 * @param {number} midi - MIDI note number
 * @returns {string} Display label
 */
export function getNoteLabel(midi) {
    return getNoteName(midi);
}

/**
 * Get the octave of a MIDI note.
 * @param {number} midi - MIDI note number
 * @returns {number} Octave number
 */
export function getNoteOctave(midi) {
    return Math.floor(midi / 12) - 1;
}

/**
 * Check if a track is a left-hand track based on name or MIDI channel.
 * @param {string} trackName - Track name
 * @param {number} trackChannel - MIDI channel number
 * @returns {boolean}
 */
export function isLeftHandTrack(trackName, trackChannel) {
    return /left/i.test(trackName) || trackChannel === 1;
}

// ─── Color Helpers ───────────────────────────────────────────────────────────

/**
 * Lighten a hex color by a percentage.
 * @param {string} color - Hex color (e.g., '#3b82f6')
 * @param {number} percent - Percentage to lighten (0-100)
 * @returns {string} Lightened hex color
 */
export function lightenColor(color, percent) {
    const num = parseInt(color.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = Math.min(255, (num >> 16) + amt);
    const G = Math.min(255, (num >> 8 & 0x00FF) + amt);
    const B = Math.min(255, (num & 0x0000FF) + amt);
    return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
}

/**
 * Darken a hex color by a percentage.
 * @param {string} color - Hex color (e.g., '#3b82f6')
 * @param {number} percent - Percentage to darken (0-100)
 * @returns {string} Darkened hex color
 */
export function darkenColor(color, percent) {
    const num = parseInt(color.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = Math.max(0, (num >> 16) - amt);
    const G = Math.max(0, (num >> 8 & 0x00FF) - amt);
    const B = Math.max(0, (num & 0x0000FF) - amt);
    return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
}

// ─── Time Helpers ────────────────────────────────────────────────────────────

/**
 * Format seconds into MM:SS display string.
 * @param {number} seconds - Time in seconds
 * @returns {string} Formatted time (e.g., "02:35")
 */
export function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// ─── Note Layout ─────────────────────────────────────────────────────────────

/**
 * NoteLayout — Computes pixel positions for MIDI notes on screen.
 * Shared by all renderers so they always align pixel-perfectly.
 *
 * @example
 *   const layout = new NoteLayout(36, 83); // C2..B5
 *   const x = layout.getNoteX(60, canvasWidth); // X position for middle C
 */
export class NoteLayout {
    /**
     * @param {number} viewMinMidi - Lowest visible MIDI note (default: 36 = C2)
     * @param {number} viewMaxMidi - Highest visible MIDI note (default: 83 = B5)
     */
    constructor(viewMinMidi = 36, viewMaxMidi = 83) {
        this.viewMinMidi = viewMinMidi;
        this.viewMaxMidi = viewMaxMidi;
    }

    /**
     * Count the number of white keys in the visible range.
     * @returns {number}
     */
    getVisibleWhiteKeyCount() {
        let count = 0;
        for (let midi = this.viewMinMidi; midi <= this.viewMaxMidi; midi++) {
            if (!isBlackKey(midi)) count++;
        }
        return count;
    }

    /**
     * Check if a MIDI note falls within the visible range.
     * @param {number} midiNote - MIDI note number
     * @returns {boolean}
     */
    isMidiInViewRange(midiNote) {
        return midiNote >= this.viewMinMidi && midiNote <= this.viewMaxMidi;
    }

    /**
     * Get the X pixel position of a note on screen.
     * Black keys are offset to center between adjacent white keys.
     * @param {number} midiNote - MIDI note number
     * @param {number} canvasWidth - Current canvas width in CSS pixels
     * @returns {number} X position in pixels
     */
    getNoteX(midiNote, canvasWidth) {
        const whiteKeyWidth = canvasWidth / this.getVisibleWhiteKeyCount();

        let whiteKeysBefore = 0;
        for (let i = this.viewMinMidi; i < midiNote; i++) {
            if (!isBlackKey(i)) whiteKeysBefore++;
        }

        const baseX = whiteKeysBefore * whiteKeyWidth;

        if (isBlackKey(midiNote)) {
            const blackKeyWidth = whiteKeyWidth * 0.6;
            return baseX - (blackKeyWidth / 2);
        }

        return baseX;
    }

    /**
     * Get the pixel width of a note.
     * @param {number} midiNote - MIDI note number
     * @param {number} canvasWidth - Current canvas width in CSS pixels
     * @returns {number} Width in pixels
     */
    getNoteWidth(midiNote, canvasWidth) {
        const whiteKeyWidth = canvasWidth / this.getVisibleWhiteKeyCount();
        return isBlackKey(midiNote) ? whiteKeyWidth * 0.6 : whiteKeyWidth;
    }
}

// ─── Active Notes Computation ────────────────────────────────────────────────

/**
 * Compute which MIDI notes are currently playing at a given time.
 * Used by the piano renderer when the falling notes renderer is hidden
 * (so we don't iterate MIDI tracks twice when falling notes ARE visible).
 *
 * @param {number} currentTime - Current playback time in seconds
 * @param {object|null} midiData - Parsed MIDI data
 * @param {NoteLayout} layout - Note layout for view range filtering
 * @returns {Map<number, {trackName: string, trackChannel: number}>}
 */
export function getActiveNotes(currentTime, midiData, layout) {
    const activeNotes = new Map();
    if (!midiData) return activeNotes;

    midiData.tracks.forEach(track => {
        track.notes.forEach(note => {
            if (currentTime >= note.time && currentTime < note.time + note.duration) {
                if (layout.isMidiInViewRange(note.midi)) {
                    const existing = activeNotes.get(note.midi);
                    const currentIsLeft = isLeftHandTrack(note.trackName || '', note.trackChannel);
                    const existingIsLeft = existing
                        ? isLeftHandTrack(existing.trackName || '', existing.trackChannel)
                        : false;

                    if (!existing || currentIsLeft || !existingIsLeft) {
                        activeNotes.set(note.midi, {
                            trackName: note.trackName,
                            trackChannel: note.trackChannel
                        });
                    }
                }
            }
        });
    });

    return activeNotes;
}
