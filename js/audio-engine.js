export default class AudioEngine {
    constructor() {
        this.midiData = null;
        this.isPlaying = false;
        this.synths = [];
        this.scheduledEvents = [];
    }

    async init() {
        // Tone.js requires a user interaction to start the audio context.
        // We'll handle this in the first play call or explicit start.
        console.log("Audio Engine Initialized");
    }

    async loadMidi(arrayBuffer) {
        // Stop any current playback
        this.stop();
        this.cleanup();

        // Parse MIDI
        // The @tonejs/midi script exposes a global 'Midi' class, not Tone.Midi
        if (typeof Midi === 'undefined') {
            console.error("@tonejs/midi library not loaded.");
            throw new Error("Midi library not found");
        }
        this.midiData = new Midi(arrayBuffer);

        console.log("MIDI Parsed:", this.midiData);

        // Setup Synths
        // We'll create a PolySynth for each track that has notes
        // In a full app, we'd try to match instruments (General MIDI)

        this.midiData.tracks.forEach((track, index) => {
            if (track.notes.length > 0) {
                // Use Tone.Sampler with real piano samples for realistic sound
                // Using a subset of notes - Tone.js will pitch-shift for missing notes
                const sampler = new Tone.Sampler({
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

                this.synths.push(sampler);

                const trackName = track.name || `Track ${index}`;
                const trackChannel = track.channel;

                // Schedule notes
                track.notes.forEach(note => {
                    note.trackName = trackName;
                    note.trackChannel = trackChannel;
                    note.trackIndex = index;

                    const eventId = Tone.Transport.schedule(time => {
                        sampler.triggerAttackRelease(note.name, note.duration, time, note.velocity);
                    }, note.time);
                    this.scheduledEvents.push(eventId);
                });
            }
        });

        console.log(`Loaded ${this.synths.length} tracks.`);
    }

    play() {
        if (!this.midiData) return;

        if (Tone.context.state !== 'running') {
            Tone.start();
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
        // Tone.Transport.seconds = 0; // Reset time? Usually stop does this but let's be sure if we want rewind
        this.isPlaying = false;

        // Release all notes to stop hanging sounds
        this.synths.forEach(synth => synth.releaseAll());
    }

    cleanup() {
        // Clear scheduled events
        this.scheduledEvents.forEach(id => Tone.Transport.clear(id));
        this.scheduledEvents = [];

        // Dispose synths
        this.synths.forEach(synth => synth.dispose());
        this.synths = [];

        Tone.Transport.cancel(); // Clear all transport events
    }

    get currentTime() {
        return Tone.Transport.seconds;
    }

    get duration() {
        return this.midiData ? this.midiData.duration : 0;
    }

    setTime(seconds) {
        Tone.Transport.seconds = seconds;
    }

    setPlaybackRate(rate) {
        if (Tone.context.state !== 'running') {
            Tone.start();
        }
        Tone.Transport.playbackRate = rate;
        console.log(`Playback rate set to: ${rate}x (Transport rate: ${Tone.Transport.playbackRate})`);

        // Force a sync if playing to ensure immediate effect
        if (this.isPlaying) {
            Tone.Transport.seconds = Tone.Transport.seconds;
        }
    }

    /**
     * Play a single note immediately (for keyboard clicking)
     * @param {number} midiNote - MIDI note number (0-127)
     * @param {number} velocity - Velocity (0-1)
     */
    playNote(midiNote, velocity = 0.8) {
        // Ensure audio context is started
        if (Tone.context.state !== 'running') {
            Tone.start();
        }

        // Create a temporary sampler if we don't have any
        if (!this.clickSampler) {
            this.clickSampler = new Tone.Sampler({
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
        }

        // Convert MIDI number to note name
        const noteName = this.midiToNoteName(midiNote);

        // Trigger attack (note on)
        this.clickSampler.triggerAttack(noteName, undefined, velocity);
    }

    /**
     * Stop a single note (for keyboard release)
     * @param {number} midiNote - MIDI note number
     */
    stopNote(midiNote) {
        if (this.clickSampler) {
            const noteName = this.midiToNoteName(midiNote);
            this.clickSampler.triggerRelease(noteName);
        }
    }

    /**
     * Convert MIDI note number to note name (e.g., 60 -> "C4")
     * @param {number} midi - MIDI note number
     * @returns {string} Note name
     */
    midiToNoteName(midi) {
        const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const octave = Math.floor(midi / 12) - 1;
        const noteName = noteNames[midi % 12];
        return `${noteName}${octave}`;
    }
}
