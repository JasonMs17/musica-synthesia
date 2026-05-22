import AudioEngine from './js/audio-engine.js';
import Visualizer from './js/visualizer.js';
import LicenseManager from './js/license-manager.js';
import MidiInputHandler from './js/midi-input-handler.js';
import InteractiveModeManager from './js/interactive-mode.js';

class SynthesiaNext {
    constructor() {
        this.audioEngine = new AudioEngine();
        this.visualizer = new Visualizer();
        this.licenseManager = new LicenseManager();
        this.midiInputHandler = new MidiInputHandler();
        this.interactiveModeManager = new InteractiveModeManager();

        this.isPlaying = false;
        this.lastTime = 0;
        this.isWaitingForInput = false;

        this.init();
    }

    async init() {
        console.log("Initializing Synthesia Next...");

        // Initialize modules
        this.licenseManager.init();
        this.visualizer.init(this.audioEngine);
        await this.audioEngine.init();

        // Initialize MIDI Input Handler
        const midiSupported = await this.midiInputHandler.init();
        console.log('MIDI Support:', midiSupported);

        // Setup Event Listeners
        this.setupEventListeners();
        this.setupMIDIEventListeners();

        // Setup visualizer keyboard input (mouse/touch)
        this.setupVisualizerInput();

        // Start Game Loop
        requestAnimationFrame(this.gameLoop.bind(this));
    }

    setupEventListeners() {
        // Toolbar Controls
        document.getElementById('btn-play-pause').addEventListener('click', () => this.togglePlay());
        document.getElementById('btn-stop').addEventListener('click', () => this.stop());

        // File Loading
        const fileInput = document.getElementById('file-input');
        document.getElementById('btn-load-midi').addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => this.handleFileSelect(e));

        // Drag and Drop
        const dropZone = document.getElementById('visualizer-container');
        const dragOverlay = document.getElementById('drag-overlay');

        window.addEventListener('dragover', (e) => {
            e.preventDefault();
            dragOverlay.classList.remove('hidden');
        });

        window.addEventListener('dragleave', (e) => {
            if (e.relatedTarget === null) {
                dragOverlay.classList.add('hidden');
            }
        });

        window.addEventListener('drop', (e) => {
            e.preventDefault();
            dragOverlay.classList.add('hidden');
            if (e.dataTransfer.files.length > 0) {
                this.loadMidiFile(e.dataTransfer.files[0]);
            }
        });

        // Fullscreen
        document.getElementById('btn-fullscreen').addEventListener('click', () => {
            if (!document.fullscreenElement) {
                document.getElementById('app-container').requestFullscreen();
            } else {
                document.exitFullscreen();
            }
        });

        // Speed Slider
        const speedSlider = document.getElementById('speed-slider');
        const speedValue = document.getElementById('speed-value');
        speedSlider.addEventListener('input', (e) => {
            const rate = parseFloat(e.target.value);
            speedValue.textContent = rate.toFixed(1) + 'x';
            this.audioEngine.setPlaybackRate(rate);
        });

        // Seek Slider
        const seekSlider = document.getElementById('seek-slider');
        seekSlider.addEventListener('input', (e) => {
            const percent = parseFloat(e.target.value);
            const duration = this.audioEngine.duration;
            if (duration > 0) {
                const time = (percent / 100) * duration;
                this.audioEngine.setTime(time);
            }
        });

        document.querySelector('.close-modal').addEventListener('click', () => {
            const modal = document.getElementById('license-modal');
            modal.classList.add('hidden');
        });

        // License Activation
        document.getElementById('btn-activate').addEventListener('click', () => {
            const key = document.getElementById('license-input').value;
            const result = this.licenseManager.validateKey(key);
            const statusEl = document.getElementById('license-status');

            if (result.valid) {
                statusEl.textContent = "License Activated Successfully!";
                statusEl.className = "status-message status-success";
                setTimeout(() => modal.classList.add('hidden'), 1500);

                // Refresh MIDI modal if it was previously restricted
                this.updateMIDIModalAccess();
            } else {
                statusEl.textContent = "Invalid License Key.";
                statusEl.className = "status-message status-error";
            }
        });

        // Interactive Mode Button (Premium check)
        document.getElementById('btn-interactive-mode').addEventListener('click', () => {
            this.openMIDISettingsModal();
        });
    }

    setupMIDIEventListeners() {
        // MIDI Modal Controls
        const midiModal = document.getElementById('midi-modal');
        document.getElementById('close-midi-modal').addEventListener('click', () => {
            midiModal.classList.add('hidden');
        });

        // Mode Selection Buttons
        const modeButtons = document.querySelectorAll('.mode-btn');
        modeButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                // Remove active class from all
                modeButtons.forEach(b => b.classList.remove('active'));
                // Add to clicked
                btn.classList.add('active');

                const mode = btn.dataset.mode;
                this.interactiveModeManager.setMode(mode);
                console.log('Mode changed to:', mode);
            });
        });

        // MIDI Device Selection
        const deviceSelect = document.getElementById('midi-device-select');
        deviceSelect.addEventListener('change', (e) => {
            const deviceId = e.target.value;
            if (deviceId) {
                this.midiInputHandler.selectDevice(deviceId);
            }
        });

        // MIDI Input Handler Events
        this.midiInputHandler.on('note-on', (data) => {
            // Pass to interactive mode manager
            this.interactiveModeManager.handleNoteOn(data.note, data.velocity);

            // Update monitor display
            this.updateMIDIMonitor(`Note ON: ${this.getNoteNameFromMidi(data.note)} (${data.note}) Vel: ${Math.round(data.velocity * 127)}`);
        });

        this.midiInputHandler.on('note-off', (data) => {
            this.interactiveModeManager.handleNoteOff(data.note);
            this.updateMIDIMonitor(`Note OFF: ${this.getNoteNameFromMidi(data.note)} (${data.note})`);
        });

        this.midiInputHandler.on('device-connected', () => {
            this.refreshMIDIDeviceList();
        });

        this.midiInputHandler.on('device-disconnected', () => {
            this.refreshMIDIDeviceList();
        });
    }

    setupVisualizerInput() {
        // Connect visualizer keyboard clicks to interactive mode
        this.visualizer.setNoteCallbacks(
            (note, velocity) => {
                // Mouse note-on
                this.interactiveModeManager.handleNoteOn(note, velocity);
                this.updateMIDIMonitor(`Mouse: ${this.getNoteNameFromMidi(note)} (${note})`);
            },
            (note) => {
                // Mouse note-off
                this.interactiveModeManager.handleNoteOff(note);
            }
        );
    }

    openMIDISettingsModal() {
        const midiModal = document.getElementById('midi-modal');
        const premiumWarning = document.getElementById('midi-premium-warning');
        const settingsContent = document.getElementById('midi-settings-content');

        // Check Premium License
        if (!this.licenseManager.isPremium) {
            // Show warning, hide settings
            premiumWarning.classList.remove('hidden');
            settingsContent.classList.add('hidden');
        } else {
            // Hide warning, show settings
            premiumWarning.classList.add('hidden');
            settingsContent.classList.remove('hidden');

            // Refresh device list
            this.refreshMIDIDeviceList();
        }

        midiModal.classList.remove('hidden');
    }

    updateMIDIModalAccess() {
        // Called after license activation to update modal
        const premiumWarning = document.getElementById('midi-premium-warning');
        const settingsContent = document.getElementById('midi-settings-content');

        if (this.licenseManager.isPremium) {
            premiumWarning.classList.add('hidden');
            settingsContent.classList.remove('hidden');
            this.refreshMIDIDeviceList();
        }
    }

    refreshMIDIDeviceList() {
        const deviceSelect = document.getElementById('midi-device-select');
        const deviceStatus = document.getElementById('midi-device-status');
        const notSupported = document.getElementById('midi-not-supported');

        // Check MIDI support
        if (!MidiInputHandler.isSupported()) {
            notSupported.classList.remove('hidden');
            deviceSelect.classList.add('hidden');
            deviceStatus.classList.add('hidden');
            return;
        }

        notSupported.classList.add('hidden');

        const devices = this.midiInputHandler.getAvailableDevices();

        if (devices.length === 0) {
            deviceStatus.textContent = 'No MIDI devices found. Please connect a MIDI keyboard.';
            deviceStatus.className = 'status-message status-error';
            deviceSelect.classList.add('hidden');
        } else {
            deviceStatus.textContent = `${devices.length} device(s) found`;
            deviceStatus.className = 'status-message status-success';
            deviceSelect.classList.remove('hidden');

            // Populate dropdown
            deviceSelect.innerHTML = '<option value="">Select a device</option>';
            devices.forEach(device => {
                const option = document.createElement('option');
                option.value = device.id;
                option.textContent = `${device.name} (${device.manufacturer})`;
                deviceSelect.appendChild(option);
            });
        }
    }

    updateMIDIMonitor(message) {
        const monitor = document.getElementById('midi-input-display');
        monitor.textContent = message;

        // Auto-fade back to placeholder after 2 seconds
        clearTimeout(this.monitorTimeout);
        this.monitorTimeout = setTimeout(() => {
            if (monitor.textContent === message) {
                monitor.textContent = 'Play a note on your MIDI device...';
            }
        }, 2000);
    }

    getNoteNameFromMidi(midiNote) {
        const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const octave = Math.floor(midiNote / 12) - 1;
        const noteName = names[midiNote % 12];
        return `${noteName}${octave}`;
    }

    togglePlay() {
        if (this.audioEngine.isPlaying || this.isWaitingForInput) {
            this.audioEngine.pause();
            this.isWaitingForInput = false;
            document.getElementById('btn-play-pause').textContent = "▶";
        } else {
            this.audioEngine.play();
            document.getElementById('btn-play-pause').textContent = "⏸";
        }
    }

    stop() {
        this.audioEngine.stop();
        document.getElementById('btn-play-pause').textContent = "▶";

        // Reset interactive mode state
        this.interactiveModeManager.reset();
        this.isWaitingForInput = false;
    }

    handleFileSelect(event) {
        const file = event.target.files[0];
        if (file) {
            this.loadMidiFile(file);
        }
    }

    async loadMidiFile(file) {
        console.log("Loading file:", file.name);
        try {
            const arrayBuffer = await file.arrayBuffer();
            await this.audioEngine.loadMidi(arrayBuffer);
            this.visualizer.reset();
            this.interactiveModeManager.reset();
            console.log("MIDI loaded successfully");
        } catch (error) {
            console.error("Error loading MIDI:", error);
            alert("Failed to load MIDI file.");
        }
    }

    formatTime(seconds) {
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }

    gameLoop(timestamp) {
        const deltaTime = timestamp - this.lastTime;
        this.lastTime = timestamp;

        // Learn Mode Logic
        if (this.interactiveModeManager.getMode() === 'learn') {
            if (this.audioEngine.isPlaying) {
                // Check if we need to pause for input
                const currentTime = this.audioEngine.currentTime;
                this.interactiveModeManager.updateExpectedNotes(currentTime, this.audioEngine.midiData);

                if (this.interactiveModeManager.canAdvancePlayback()) {
                    // If notes are correct, mark them as played so they don't block later
                    if (this.interactiveModeManager.getExpectedNotesSet().size > 0) {
                        this.interactiveModeManager.confirmNotesPlayed(currentTime);
                    }
                } else {
                    // Notes are missing. Check if we reached the deadline.
                    if (this.interactiveModeManager.shouldPause(currentTime)) {
                        this.audioEngine.pause();
                        this.isWaitingForInput = true;
                    }
                }
            } else if (this.isWaitingForInput) {
                // We are waiting. Check if input requirements are met.
                if (this.interactiveModeManager.canAdvancePlayback()) {
                    this.interactiveModeManager.confirmNotesPlayed(this.audioEngine.currentTime);
                    this.audioEngine.play();
                    this.isWaitingForInput = false;
                }
            }
        } else {
            this.isWaitingForInput = false;
        }

        if (this.audioEngine.isPlaying) {
            // Update expected notes in learn-to-play mode
            const currentTime = this.audioEngine.currentTime;
            this.interactiveModeManager.updateExpectedNotes(currentTime, this.audioEngine.midiData);
        }

        // Get user notes for visualization
        const userNotes = this.interactiveModeManager.getUserNotesForRendering();
        const activeUserNotes = this.interactiveModeManager.getCurrentlyPressedNotes();

        // Render with interactive mode data
        this.visualizer.render(
            this.audioEngine.currentTime,
            this.audioEngine.midiData,
            activeUserNotes,
            userNotes,
            this.interactiveModeManager.getExpectedNotesSet(),
            this.interactiveModeManager.getMode()
        );

        // Update UI time
        const currentTime = this.audioEngine.currentTime;
        const duration = this.audioEngine.duration;

        // If playback reaches or exceeds end, stop automatically
        if (this.audioEngine.isPlaying && duration > 0 && currentTime >= duration - 0.01) {
            this.stop();
        }

        document.getElementById('current-time').textContent = this.formatTime(currentTime);
        document.getElementById('total-time').textContent = this.formatTime(duration);

        if (duration > 0) {
            const percent = (currentTime / duration) * 100;
            document.getElementById('seek-slider').value = percent;
        }

        // Cleanup old history
        this.interactiveModeManager.cleanupHistory();

        requestAnimationFrame(this.gameLoop.bind(this));
    }
}

// Start the app
window.app = new SynthesiaNext();
