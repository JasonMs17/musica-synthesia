/**
 * app.js — Application orchestrator.
 * Wires all modules together: audio engine, renderers, features, and UI events.
 * This is the single entry point loaded by index.html.
 *
 * Architecture:
 *   AudioEngine + PlaybackController  →  shared playback state
 *   PianoRenderer (always visible)     →  keyboard at bottom
 *   FallingNotesRenderer (toggleable)  →  falling notes visualization
 *   SheetRenderer / JianpuRenderer     →  future visual modes (stubs)
 *   InteractiveModeManager             →  learn/realtime mode logic
 *   MidiInputHandler                   →  external MIDI keyboard
 *   Recorder                           →  screen recording
 */

// ─── Core ────────────────────────────────────────────────────────────────────
import AudioEngine from './core/audio-engine.js';
import PlaybackController from './core/playback-controller.js';
import LicenseManager from './core/license-manager.js';
import InteractiveModeManager from './core/interactive-mode.js';

// ─── Renderers ───────────────────────────────────────────────────────────────
import PianoRenderer from './renderers/piano-renderer.js';
import FallingNotesRenderer from './renderers/falling-notes-renderer.js';
import SheetRenderer from './renderers/sheet-renderer.js';
import JianpuRenderer from './renderers/jianpu-renderer.js';

// ─── Features ────────────────────────────────────────────────────────────────
import MidiInputHandler from './features/midi-input.js';
import Recorder from './features/recorder.js';

// ─── Utilities ───────────────────────────────────────────────────────────────
import { NoteLayout, midiToNoteName, formatTime, getActiveNotes } from './utils/music-utils.js';

class SynthesiaNext {
    constructor() {
        // Core
        this.audioEngine = new AudioEngine();
        this.playbackController = new PlaybackController(this.audioEngine);
        this.licenseManager = new LicenseManager();
        this.interactiveModeManager = new InteractiveModeManager();

        // Shared layout — all renderers use this for pixel-perfect alignment
        this.noteLayout = new NoteLayout(36, 83); // C2..B5

        // Renderers
        this.pianoRenderer = new PianoRenderer(this.noteLayout);
        this.fallingNotesRenderer = new FallingNotesRenderer(this.noteLayout);
        this.sheetRenderer = new SheetRenderer();
        this.jianpuRenderer = new JianpuRenderer();

        // Features
        this.midiInputHandler = new MidiInputHandler();
        this.recorder = new Recorder();

        // State
        this.isPlaying = false;
        this.lastTime = 0;
        this.isWaitingForInput = false;
        this.monitorTimeout = null;

        this.init();
    }

    async init() {
        console.log("Initializing Synthesia Next...");

        // Initialize core modules
        this.licenseManager.init();
        await this.audioEngine.init();

        // Initialize renderers
        this.fallingNotesRenderer.init(document.getElementById('piano-roll-canvas'));
        this.pianoRenderer.init(document.getElementById('keyboard-canvas'));
        // Sheet and Jianpu stubs — no canvas yet, will be initialized when implemented
        // this.sheetRenderer.init(document.getElementById('sheet-container'));
        // this.jianpuRenderer.init(document.getElementById('jianpu-container'));

        // Initialize MIDI Input Handler
        const midiSupported = await this.midiInputHandler.init();
        console.log('MIDI Support:', midiSupported);

        // Setup Event Listeners
        this.setupEventListeners();
        this.setupMIDIEventListeners();

        // Setup piano keyboard input (mouse/touch) → routes to audio + interactive mode
        this.setupPianoInput();

        // Handle window resize for all renderers
        this.setupResizeListeners();

        // Render empty state
        this.fallingNotesRenderer.render(0, null);
        this.pianoRenderer.render();

        // Start Game Loop
        requestAnimationFrame(this.gameLoop.bind(this));

        console.log("Visualizer Initialized");
    }

    // ─── Resize Handling ─────────────────────────────────────────────────────

    setupResizeListeners() {
        const handleResize = () => {
            this.fallingNotesRenderer.resize();
            this.pianoRenderer.resize();
        };

        window.addEventListener('resize', handleResize);
        document.addEventListener('fullscreenchange', handleResize);
        document.addEventListener('webkitfullscreenchange', handleResize);
        document.addEventListener('mozfullscreenchange', handleResize);

        // Robust layout tracking
        if (typeof ResizeObserver !== 'undefined') {
            const observer = new ResizeObserver(() => {
                handleResize();
            });
            const container = document.getElementById('app-container');
            if (container) observer.observe(container);
        }

        // Fire immediately and again shortly after to handle CSS/flexbox settling
        handleResize();
        setTimeout(handleResize, 100);
    }

    // ─── Event Listeners ─────────────────────────────────────────────────────

    setupEventListeners() {
        // Toolbar Controls
        document.getElementById('btn-play-pause').addEventListener('click', () => this.togglePlay());
        document.getElementById('btn-stop').addEventListener('click', () => this.stop());

        // File Loading
        const fileInput = document.getElementById('file-input');
        document.getElementById('btn-load-midi').addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => this.handleFileSelect(e));

        // Drag and Drop
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
            this.playbackController.setPlaybackRate(rate);
        });

        // Seek Slider
        const seekSlider = document.getElementById('seek-slider');
        seekSlider.addEventListener('input', (e) => {
            const percent = parseFloat(e.target.value);
            const duration = this.playbackController.duration;
            if (duration > 0) {
                const time = (percent / 100) * duration;
                this.playbackController.setTime(time);
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
                setTimeout(() => document.getElementById('license-modal').classList.add('hidden'), 1500);

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

        // Keyboard Shortcut: 'K' to toggle toolbar visibility, 'H' to toggle recording
        document.addEventListener('keydown', (e) => {
            if (e.key.toLowerCase() === 'k') {
                this.toggleToolbar();
            } else if (e.key.toLowerCase() === 'h') {
                this.toggleRecording();
            }
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
            this.updateMIDIMonitor(`Note ON: ${midiToNoteName(data.note)} (${data.note}) Vel: ${Math.round(data.velocity * 127)}`);
        });

        this.midiInputHandler.on('note-off', (data) => {
            this.interactiveModeManager.handleNoteOff(data.note);
            this.updateMIDIMonitor(`Note OFF: ${midiToNoteName(data.note)} (${data.note})`);
        });

        this.midiInputHandler.on('device-connected', () => {
            this.refreshMIDIDeviceList();
        });

        this.midiInputHandler.on('device-disconnected', () => {
            this.refreshMIDIDeviceList();
        });
    }

    /**
     * Connect piano keyboard clicks to audio engine + interactive mode.
     * The piano renderer is pure view — it just fires callbacks.
     */
    setupPianoInput() {
        this.pianoRenderer.setNoteCallbacks(
            (note, velocity) => {
                // Play audio
                this.audioEngine.playNote(note, velocity);
                // Route to interactive mode
                this.interactiveModeManager.handleNoteOn(note, velocity);
                // Update monitor
                this.updateMIDIMonitor(`Mouse: ${midiToNoteName(note)} (${note})`);
            },
            (note) => {
                // Stop audio
                this.audioEngine.stopNote(note);
                // Route to interactive mode
                this.interactiveModeManager.handleNoteOff(note);
            }
        );
    }

    // ─── MIDI Settings Modal ─────────────────────────────────────────────────

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

    // ─── Playback Controls ───────────────────────────────────────────────────

    togglePlay() {
        if (this.playbackController.isPlaying || this.isWaitingForInput) {
            this.playbackController.pause();
            this.isWaitingForInput = false;
            document.getElementById('btn-play-pause').textContent = "▶";
        } else {
            this.playbackController.play();
            document.getElementById('btn-play-pause').textContent = "⏸";
        }
    }

    stop() {
        this.playbackController.stop();
        document.getElementById('btn-play-pause').textContent = "▶";

        // Reset interactive mode state
        this.interactiveModeManager.reset();
        this.isWaitingForInput = false;

        if (this.recorder.isActive) {
            this.recorder.stop();
        }
    }

    // ─── File Loading ────────────────────────────────────────────────────────

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

            // Store MIDI data in playback controller for renderers
            this.playbackController.setMidiData(this.audioEngine.midiData);

            // Reset renderers
            this.fallingNotesRenderer.reset();
            this.interactiveModeManager.reset();

            // Enable controllers
            document.getElementById('btn-play-pause').disabled = false;
            document.getElementById('btn-stop').disabled = false;
            document.getElementById('seek-slider').disabled = false;
            document.getElementById('speed-slider').disabled = false;

            console.log("MIDI loaded successfully");
        } catch (error) {
            console.error("Error loading MIDI:", error);
            alert("Failed to load MIDI file.");
        }
    }

    // ─── Toolbar ─────────────────────────────────────────────────────────────

    toggleToolbar() {
        const toolbar = document.getElementById('toolbar');
        const keyboardContainer = document.getElementById('keyboard-container');
        toolbar.classList.toggle('toolbar-hidden');
        keyboardContainer.classList.toggle('keyboard-minimal');

        // Resize renderers after toolbar toggle
        this.fallingNotesRenderer.resize();
        this.pianoRenderer.resize();
    }

    // ─── Recording ───────────────────────────────────────────────────────────

    async toggleRecording() {
        if (this.recorder.isActive) {
            this.recorder.stop();
            return;
        }

        if (!this.playbackController.midiData) {
            alert("Harap load file MIDI/XML terlebih dahulu sebelum merekam.");
            return;
        }

        try {
            await this.recorder.start();
            // Reset time and play to start recording
            this.playbackController.setTime(0);
            this.playbackController.play();
            document.getElementById('btn-play-pause').textContent = "⏸";
            console.log("Recording started...");
        } catch (error) {
            console.error("Error starting screen recording:", error);
            alert("Gagal memulai recording. Pastikan memberikan izin share screen.");
        }
    }

    // ─── Game Loop ───────────────────────────────────────────────────────────

    gameLoop(timestamp) {
        const deltaTime = timestamp - this.lastTime;
        this.lastTime = timestamp;

        const currentTime = this.playbackController.currentTime;
        const midiData = this.playbackController.midiData;

        // ── Learn Mode Logic ─────────────────────────────────────────────────

        if (this.interactiveModeManager.getMode() === 'learn') {
            if (this.playbackController.isPlaying) {
                // Check if we need to pause for input
                this.interactiveModeManager.updateExpectedNotes(currentTime, midiData);

                if (this.interactiveModeManager.canAdvancePlayback()) {
                    // If notes are correct, mark them as played so they don't block later
                    if (this.interactiveModeManager.getExpectedNotesSet().size > 0) {
                        this.interactiveModeManager.confirmNotesPlayed(currentTime);
                    }
                } else {
                    // Notes are missing. Check if we reached the deadline.
                    if (this.interactiveModeManager.shouldPause(currentTime)) {
                        this.playbackController.pause();
                        this.isWaitingForInput = true;
                    }
                }
            } else if (this.isWaitingForInput) {
                // We are waiting. Check if input requirements are met.
                if (this.interactiveModeManager.canAdvancePlayback()) {
                    this.interactiveModeManager.confirmNotesPlayed(currentTime);
                    this.playbackController.play();
                    this.isWaitingForInput = false;
                }
            }
        } else {
            this.isWaitingForInput = false;
        }

        if (this.playbackController.isPlaying) {
            // Update expected notes in learn-to-play mode
            this.interactiveModeManager.updateExpectedNotes(currentTime, midiData);
        }

        // ── Gather rendering data ────────────────────────────────────────────

        const userNotes = this.interactiveModeManager.getUserNotesForRendering();
        const activeUserNotes = this.interactiveModeManager.getCurrentlyPressedNotes();
        const expectedNotes = this.interactiveModeManager.getExpectedNotesSet();
        const interactiveMode = this.interactiveModeManager.getMode();

        // ── Render falling notes (returns activeNotes for piano) ─────────────

        let activeNotes;

        if (this.fallingNotesRenderer.visible) {
            const result = this.fallingNotesRenderer.render(
                currentTime, midiData,
                activeUserNotes, userNotes, expectedNotes, interactiveMode
            );
            activeNotes = result.activeNotes;
        } else {
            // Falling notes hidden — compute activeNotes separately for the piano
            activeNotes = getActiveNotes(currentTime, midiData, this.noteLayout);
        }

        // ── Render piano keyboard (always visible) ───────────────────────────

        this.pianoRenderer.render(activeNotes, activeUserNotes, expectedNotes, interactiveMode);

        // ── Future renderers ─────────────────────────────────────────────────

        // if (this.sheetRenderer.visible) {
        //     this.sheetRenderer.render(currentTime, midiData);
        // }
        // if (this.jianpuRenderer.visible) {
        //     this.jianpuRenderer.render(currentTime, midiData);
        // }

        // ── Update UI time display ───────────────────────────────────────────

        const duration = this.playbackController.duration;

        // If playback reaches or exceeds end, stop automatically
        if (this.playbackController.isPlaying && duration > 0 && currentTime >= duration - 0.01) {
            this.stop();
        }

        document.getElementById('current-time').textContent = formatTime(currentTime);
        document.getElementById('total-time').textContent = formatTime(duration);

        if (duration > 0) {
            const percent = (currentTime / duration) * 100;
            document.getElementById('seek-slider').value = percent;
        }

        // Cleanup old history
        this.interactiveModeManager.cleanupHistory();

        requestAnimationFrame(this.gameLoop.bind(this));
    }
}

// ─── Start the app ───────────────────────────────────────────────────────────
const app = new SynthesiaNext();
