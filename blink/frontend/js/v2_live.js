/* ═══════════════════════════════════════════════════════════════════════════════
    BLINK v6.0 - PROFESSIONAL LIVE ENGINE (V2)
    MediaStream API | Real-time Status | Resource Hygiene
    ═══════════════════════════════════════════════════════════════════════════════ */

class BlinkLiveV2 {
    constructor() {
        this.localStream = null;
        this.videoElement = document.getElementById('localVideoPreview');
    }

    async startStream() {
        console.log('[BlinkLive] Establishing frequency...');
        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            if (this.videoElement) {
                this.videoElement.srcObject = this.localStream;
                this.videoElement.play();
                this.updateUI(true);
            }
        } catch (err) {
            console.error('[BlinkLive] Failed to access camera:', err);
            alert("Cam error: " + err.message);
        }
    }

    stopStream() {
        if (this.localStream) {
            console.log('[BlinkLive] Closing frequency...');
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
            if (this.videoElement) this.videoElement.srcObject = null;
            this.updateUI(false);
        }
    }

    updateUI(isLive) {
        const liveIndicator = document.getElementById('liveIndicator');
        const startBtn = document.getElementById('startLiveBtn');
        const endBtn = document.getElementById('endLiveBtn');

        if (liveIndicator) liveIndicator.style.display = isLive ? 'flex' : 'none';
        if (startBtn) startBtn.style.display = isLive ? 'none' : 'block';
        if (endBtn) endBtn.style.display = isLive ? 'block' : 'none';
    }
}
