/**
 * midi-parser.js — Parses raw MIDI binary data into a structured object.
 * Wraps @tonejs/midi (loaded via CDN as the global `Midi`).
 * Decouples parsing from playback so the same parsed data can feed any renderer.
 */

/**
 * Parse a MIDI ArrayBuffer into a Midi object.
 * @param {ArrayBuffer} arrayBuffer - Raw MIDI file data
 * @returns {object} Parsed MIDI data (@tonejs/midi format)
 * @throws {Error} If the Midi library is not loaded
 */
export function parseMidi(arrayBuffer) {
    if (typeof Midi === 'undefined') {
        console.error('@tonejs/midi library not loaded.');
        throw new Error('Midi library not found');
    }
    return new Midi(arrayBuffer);
}
