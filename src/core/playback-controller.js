/**
 * playback-controller.js — Shared playback state.
 * Provides a single source of truth for the current player state.
 * All renderers and the game loop read from this object.
 * AudioEngine handles the actual Tone.js transport.
 */
export default class PlaybackController {
    constructor(audioEngine) {
        this.audioEngine = audioEngine;
        this.midiData = null;
    }

    /** Current playback time in seconds */
    get currentTime() { return this.audioEngine.currentTime; }

    /** Total duration in seconds (including pre-roll) */
    get duration() { return this.audioEngine.duration; }

    /** Whether audio is currently playing */
    get isPlaying() { return this.audioEngine.isPlaying; }

    /** Store parsed MIDI data for renderers to access */
    setMidiData(data) { this.midiData = data; }

    play() { this.audioEngine.play(); }
    pause() { this.audioEngine.pause(); }
    stop() { this.audioEngine.stop(); }
    setTime(seconds) { this.audioEngine.setTime(seconds); }
    setPlaybackRate(rate) { this.audioEngine.setPlaybackRate(rate); }
}
