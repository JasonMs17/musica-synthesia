/**
 * audio-engine.js — Core audio playback engine.
 * Wraps Tone.js for MIDI playback using Salamander piano samples.
 * Handles loading, scheduling, play/pause/stop, and single-note playback.
 * Does NOT handle rendering or UI — that's the renderers' job.
 */
import { parseMidi } from './midi-parser.js';
import { midiToNoteName } from '../utils/music-utils.js';

export default class AudioEngine {
    constructor() {
        this.midiData = null;
        this.isPlaying = false;
        this.synths = [];
        this.scheduledEvents = [];

        // Create a single shared sampler to reuse for all playback and manual clicks.
        // This downloads Salamander samples once when the app starts, preventing
        // high network requests and thread blocks that cause lag/buffering during play.
        this.sampler = new Tone.Sampler({
            urls: {
                A0: "A0.mp3",
                C1: "C1.mp3",
                "D#1": "Ds1.mp3",
                "F#1": "Fs1.mp3",
                A1: "A1.mp3",
                C2: "C2.mp3",
                "D#2": "Ds2.mp3",
                "F#2": "Fs2.mp3",
                A2: "A2.mp3",
                C3: "C3.mp3",
                "D#3": "Ds3.mp3",
                "F#3": "Fs3.mp3",
                A3: "A3.mp3",
                C4: "C4.mp3",
                "D#4": "Ds4.mp3",
                "F#4": "Fs4.mp3",
                A4: "A4.mp3",
                C5: "C5.mp3",
                "D#5": "Ds5.mp3",
                "F#5": "Fs5.mp3",
                A5: "A5.mp3",
                C6: "C6.mp3",
                "D#6": "Ds6.mp3",
                "F#6": "Fs6.mp3",
                A6: "A6.mp3",
                C7: "C7.mp3",
                "D#7": "Ds7.mp3",
                "F#7": "Fs7.mp3",
                A7: "A7.mp3",
                C8: "C8.mp3"
            },
            release: 1,
            baseUrl: "https://tonejs.github.io/audio/salamander/",
            volume: -8
        }).toDestination();

        // Keep a reference in synths for backward compatibility
        this.synths = [this.sampler];

        // Pre-roll delay in seconds (gives time for notes to fall from the top before playing sound)
        this.preRoll = 3.0;
    }

    async init() {
        // Tone.js requires a user interaction to start the audio context.
        console.log("Audio Engine Initialized (Shared Sampler Warm)");
    }

    async loadMidi(arrayBuffer) {
        // Stop any current playback
        this.stop();
        this.cleanup();

        // Parse MIDI using the dedicated parser
        this.midiData = parseMidi(arrayBuffer);

        console.log("MIDI Parsed:", this.midiData);

        this.midiData.tracks.forEach((track, index) => {
            if (track.notes.length > 0) {
                const trackName = track.name || `Track ${index}`;
                const trackChannel = track.channel;

                // Schedule notes using our pre-loaded shared sampler
                track.notes.forEach(note => {
                    note.trackName = trackName;
                    note.trackChannel = trackChannel;
                    note.trackIndex = index;

                    // Apply pre-roll visual delay offset
                    note.time = note.time + this.preRoll;

                    const eventId = Tone.Transport.schedule(time => {
                        this.sampler.triggerAttackRelease(note.name, note.duration, time, note.velocity);
                    }, note.time);
                    this.scheduledEvents.push(eventId);
                });
            }
        });

        console.log(`Loaded tracks and scheduled events with ${this.preRoll}s pre-roll.`);
    }

    play() {
        if (!this.midiData) return;

        if (Tone.context.state !== 'running') {
            Tone.start();
        }

        // Warn if samples aren't fully ready but let Tone.js play whatever is cached
        if (!this.sampler.loaded) {
            console.warn("Piano samples are still loading in the background...");
        }

        Tone.Transport.start();
        this.isPlaying = true;
    }

    pause() {
        Tone.Transport.pause();
        this.isPlaying = false;
    }

    stop() {
        Tone.Transport.stop();
        this.isPlaying = false;

        // Release all active voices to stop hanging notes
        if (this.sampler) {
            this.sampler.releaseAll();
        }
    }

    cleanup() {
        // Clear scheduled events
        this.scheduledEvents.forEach(id => Tone.Transport.clear(id));
        this.scheduledEvents = [];

        // DO NOT dispose the shared sampler, just clear notes
        if (this.sampler) {
            this.sampler.releaseAll();
        }

        Tone.Transport.cancel(); // Clear all transport events
    }

    get currentTime() {
        return Tone.Transport.seconds;
    }

    get duration() {
        return this.midiData ? this.midiData.duration + this.preRoll : 0;
    }

    setTime(seconds) {
        Tone.Transport.seconds = seconds;
    }

    setPlaybackRate(rate) {
        if (Tone.context.state !== 'running') {
            Tone.start();
        }
        Tone.Transport.playbackRate = rate;
        console.log(`Playback rate set to: ${rate}x`);

        if (this.isPlaying) {
            Tone.Transport.seconds = Tone.Transport.seconds;
        }
    }

    /**
     * Play a single note immediately (for manual keyboard clicking).
     * @param {number} midiNote - MIDI note number (0-127)
     * @param {number} velocity - Velocity (0-1)
     */
    playNote(midiNote, velocity = 0.8) {
        if (Tone.context.state !== 'running') {
            Tone.start();
        }

        const noteName = midiToNoteName(midiNote);
        this.sampler.triggerAttack(noteName, undefined, velocity);
    }

    /**
     * Stop a single note (for keyboard release).
     * @param {number} midiNote - MIDI note number
     */
    stopNote(midiNote) {
        if (this.sampler) {
            const noteName = midiToNoteName(midiNote);
            this.sampler.triggerRelease(noteName);
        }
    }
}
