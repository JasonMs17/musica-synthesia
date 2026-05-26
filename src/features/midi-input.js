/**
 * midi-input.js — Web MIDI API integration for external MIDI keyboard input.
 * Optional feature: connects physical MIDI devices for real-time note input.
 * Uses an event emitter pattern (on/off/emit) for decoupled communication.
 */

/**
 * MidiInputHandler - Web MIDI API Integration
 * Handles MIDI device detection, selection, and real-time note events
 */
export default class MidiInputHandler {
    constructor() {
        this.midiAccess = null;
        this.activeDevice = null;
        this.listeners = {
            'note-on': [],
            'note-off': [],
            'device-connected': [],
            'device-disconnected': []
        };
        this.currentlyPressedNotes = new Set();
    }

    /**
     * Initialize Web MIDI API
     * @returns {Promise<boolean>} Success status
     */
    async init() {
        if (!navigator.requestMIDIAccess) {
            console.error('Web MIDI API not supported in this browser');
            return false;
        }

        try {
            this.midiAccess = await navigator.requestMIDIAccess();
            console.log('MIDI Access granted');

            // Listen for device connection changes
            this.midiAccess.onstatechange = (e) => this.handleStateChange(e);

            // Auto-select first available device
            const devices = this.getAvailableDevices();
            if (devices.length > 0) {
                this.selectDevice(devices[0].id);
            }

            return true;
        } catch (error) {
            console.error('Failed to get MIDI access:', error);
            return false;
        }
    }

    /**
     * Get list of available MIDI input devices
     * @returns {Array} Array of device objects {id, name}
     */
    getAvailableDevices() {
        if (!this.midiAccess) return [];

        const devices = [];
        const inputs = this.midiAccess.inputs.values();

        for (let input of inputs) {
            devices.push({
                id: input.id,
                name: input.name || 'Unknown Device',
                manufacturer: input.manufacturer || 'Unknown',
                state: input.state
            });
        }

        return devices;
    }

    /**
     * Select and activate a MIDI input device
     * @param {string} deviceId - MIDI device ID
     * @returns {boolean} Success status
     */
    selectDevice(deviceId) {
        if (!this.midiAccess) return false;

        // Disconnect previous device
        if (this.activeDevice) {
            this.activeDevice.onmidimessage = null;
        }

        const input = this.midiAccess.inputs.get(deviceId);
        if (!input) {
            console.error('Device not found:', deviceId);
            return false;
        }

        this.activeDevice = input;
        this.activeDevice.onmidimessage = (message) => this.handleMidiMessage(message);

        console.log(`Connected to MIDI device: ${input.name}`);
        return true;
    }

    /**
     * Handle incoming MIDI messages
     * @param {MIDIMessageEvent} message - MIDI message event
     */
    handleMidiMessage(message) {
        const [command, note, velocity] = message.data;

        // MIDI command parsing
        // 144-159: Note On (channel 1-16)
        // 128-143: Note Off (channel 1-16)
        const commandType = command >> 4;

        if (commandType === 9 && velocity > 0) {
            // Note On
            this.currentlyPressedNotes.add(note);
            this.emit('note-on', {
                note: note,
                velocity: velocity / 127, // Normalize to 0-1
                timestamp: performance.now()
            });
        } else if (commandType === 8 || (commandType === 9 && velocity === 0)) {
            // Note Off
            this.currentlyPressedNotes.delete(note);
            this.emit('note-off', {
                note: note,
                timestamp: performance.now()
            });
        }
    }

    /**
     * Handle MIDI device connection/disconnection
     * @param {MIDIConnectionEvent} event - State change event
     */
    handleStateChange(event) {
        const port = event.port;

        if (port.type === 'input') {
            if (port.state === 'connected') {
                console.log('MIDI device connected:', port.name);
                this.emit('device-connected', { device: port });
            } else if (port.state === 'disconnected') {
                console.log('MIDI device disconnected:', port.name);
                this.emit('device-disconnected', { device: port });

                // If active device was disconnected, clear it
                if (this.activeDevice && this.activeDevice.id === port.id) {
                    this.activeDevice = null;
                }
            }
        }
    }

    /**
     * Subscribe to events
     * @param {string} eventName - Event name
     * @param {Function} callback - Callback function
     */
    on(eventName, callback) {
        if (this.listeners[eventName]) {
            this.listeners[eventName].push(callback);
        }
    }

    /**
     * Unsubscribe from events
     * @param {string} eventName - Event name
     * @param {Function} callback - Callback function to remove
     */
    off(eventName, callback) {
        if (this.listeners[eventName]) {
            this.listeners[eventName] = this.listeners[eventName].filter(cb => cb !== callback);
        }
    }

    /**
     * Emit event to all listeners
     * @param {string} eventName - Event name
     * @param {*} data - Event data
     */
    emit(eventName, data) {
        if (this.listeners[eventName]) {
            this.listeners[eventName].forEach(callback => callback(data));
        }
    }

    /**
     * Get currently pressed notes
     * @returns {Set} Set of MIDI note numbers currently pressed
     */
    getCurrentlyPressedNotes() {
        return new Set(this.currentlyPressedNotes);
    }

    /**
     * Check if MIDI is supported
     * @returns {boolean} Support status
     */
    static isSupported() {
        return !!navigator.requestMIDIAccess;
    }

    /**
     * Cleanup and disconnect
     */
    dispose() {
        if (this.activeDevice) {
            this.activeDevice.onmidimessage = null;
            this.activeDevice = null;
        }

        if (this.midiAccess) {
            this.midiAccess.onstatechange = null;
        }

        this.currentlyPressedNotes.clear();

        // Clear all listeners
        Object.keys(this.listeners).forEach(key => {
            this.listeners[key] = [];
        });
    }
}
