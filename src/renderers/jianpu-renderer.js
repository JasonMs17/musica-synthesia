/**
 * jianpu-renderer.js — Numbered musical notation (Not Angka / Jianpu) renderer (stub).
 * Will render Jianpu notation from MIDI data.
 * Currently a placeholder establishing the renderer interface contract.
 *
 * PURE VIEW: Only draws based on current playback state.
 * Does not play audio, manage transport, or parse MIDI.
 */
export default class JianpuRenderer {
    constructor() {
        this.container = null;
        this.visible = false;
    }

    /**
     * Initialize with a container element.
     * @param {HTMLElement} containerEl - DOM element to render into
     */
    init(containerEl) {
        this.container = containerEl;
    }

    /**
     * Render Jianpu notation for the current playback position.
     * @param {number} currentTime - Current playback time in seconds
     * @param {object|null} midiData - Parsed MIDI data
     */
    render(currentTime, midiData) {
        // TODO: Implement Jianpu rendering
    }

    /** Show this renderer */
    show() {
        this.visible = true;
        if (this.container) this.container.style.display = '';
    }

    /** Hide this renderer */
    hide() {
        this.visible = false;
        if (this.container) this.container.style.display = 'none';
    }
}
