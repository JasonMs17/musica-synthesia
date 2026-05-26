/**
 * recorder.js — Screen + audio recording feature.
 * Captures the screen via getDisplayMedia and audio from Tone.js destination.
 * Produces a downloadable .webm file when recording stops.
 * Optional feature: can be removed without affecting playback.
 */
export default class Recorder {
    constructor() {
        this.isRecording = false;
        this.mediaRecorder = null;
        this.recordedChunks = [];
        this.recordingStream = null;
        this.audioDest = null;
    }

    /**
     * Start screen recording with audio capture from Tone.js.
     * Prompts the user to select a screen/window to capture.
     * @returns {Promise<void>}
     * @throws {Error} If user denies screen sharing permission
     */
    async start() {
        // Inform user what to choose in the screen sharing prompt.
        alert("Pilih layar atau jendela yang menampilkan aplikasi ini. Jika tab browser tidak muncul, pilih seluruh layar atau jendela browser.");

        const displayStream = await navigator.mediaDevices.getDisplayMedia({
            video: {
                width: { ideal: 1920 },
                height: { ideal: 1080 },
                frameRate: { ideal: 60 },
                cursor: "never"
            },
            audio: false
        });

        // Capture high quality audio directly from Tone.js Context
        this.audioDest = Tone.context.createMediaStreamDestination();
        Tone.getDestination().connect(this.audioDest);

        // Combine video and audio
        const tracks = [
            ...displayStream.getVideoTracks(),
            ...this.audioDest.stream.getAudioTracks()
        ];

        this.recordingStream = new MediaStream(tracks);

        // Check supported types for high quality webm
        let options = { mimeType: 'video/webm; codecs=vp9' };
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
            options = { mimeType: 'video/webm; codecs=vp8' };
        }
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
            options = { mimeType: 'video/webm' };
        }

        this.mediaRecorder = new MediaRecorder(this.recordingStream, options);
        this.recordedChunks = [];

        this.mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                this.recordedChunks.push(event.data);
            }
        };

        this.mediaRecorder.onstop = () => {
            const blob = new Blob(this.recordedChunks, { type: options.mimeType });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = `synthesia-recording-${Date.now()}.webm`;
            document.body.appendChild(a);
            a.click();

            setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, 100);

            // Disconnect to clean up
            Tone.getDestination().disconnect(this.audioDest);
            this.recordingStream.getTracks().forEach(track => track.stop());

            this.isRecording = false;
            console.log("Recording stopped and saved.");
        };

        displayStream.getVideoTracks()[0].onended = () => {
            if (this.isRecording) {
                this.stop();
            }
        };

        this.mediaRecorder.start();
        this.isRecording = true;
        console.log("Recording started...");
    }

    /**
     * Stop the current recording. Triggers download of the .webm file.
     */
    stop() {
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
        }
    }

    /** Whether recording is currently active */
    get isActive() {
        return this.isRecording;
    }
}
