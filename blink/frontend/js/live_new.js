/* ═══════════════════════════════════════════════════════════════════════════════
    BLINK v5.0 - LIVE STREAMING ENGINE
    WebRTC | Socket Real-time | End Stream Confirmation | Mute Toggle
    ═══════════════════════════════════════════════════════════════════════════════ */

class LiveStreamer {
    constructor() {
        this.streamId = null;
        this.localStream = null;
        this.isStreaming = false;
        this.isMuted = false;
        this.socket = window.Blink?.socket || null;
        this.init();
    }

    init() {
        if (!window.api.isAuthenticated()) return;
        
        // Global access
        window.live = this;

        this.setupSocket();
        this.loadActiveStreams();
    }

    setupSocket() {
        if (!this.socket) {
            setTimeout(() => {
                this.socket = window.Blink?.socket;
                if(this.socket) this.setupSocketListeners();
            }, 1000);
            return;
        }
        this.setupSocketListeners();
    }

    setupSocketListeners() {
        this.socket.on('stream-ended', (data) => {
            if (this.streamId == data.streamId) {
                window.app.showError("The stream has ended.");
                this.stopLocalStream();
                window.app.navigateTo('feed');
            }
        });

        this.socket.on('new-viewer', (data) => {
            if (this.isStreaming) {
                this.updateViewerCount(data.count);
            }
        });
    }

    async startLive() {
        try {
            window.app.showLoading();
            
            // 1. Get Media Permission
            this.localStream = await navigator.mediaDevices.getUserMedia({
                video: { width: 1280, height: 720 },
                audio: true
            });

            // 2. Register on Backend
            const res = await window.api.request('/live/start', {
                method: 'POST',
                body: JSON.stringify({ title: "My Live Stream" })
            });

            if (res.success) {
                this.streamId = res.stream.id;
                this.isStreaming = true;
                
                // 3. UI Update
                this.renderStreamOverlay();
                const video = document.getElementById('liveVideo');
                if (video) video.srcObject = this.localStream;

                window.app.showSuccess("🚀 You are now LIVE!");
                
                // 4. Emit to Socket
                this.socket.emit('start-stream', { streamId: this.streamId });
            }
        } catch (err) {
            console.error("Live start error:", err);
            window.app.showError("Connection to the live universe failed.");
        } finally {
            window.app.hideLoading();
        }
    }

    async confirmEndStream() {
        if (!this.isStreaming) return;
        
        if (confirm("Are you sure you want to end this transmission?")) {
            this.endStream();
        }
    }

    async endStream() {
        try {
            window.app.showLoading();
            
            await window.api.request('/live/end', {
                method: 'POST',
                body: JSON.stringify({ streamId: this.streamId })
            });

            this.stopLocalStream();
            this.isStreaming = false;
            this.streamId = null;

            window.app.showSuccess("Transmission ended successfully.");
            window.app.navigateTo('feed');
        } catch (err) {
            window.app.showError("Failed to exit the live frequency.");
        } finally {
            window.app.hideLoading();
        }
    }

    stopLocalStream() {
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }
        const video = document.getElementById('liveVideo');
        if (video) video.srcObject = null;
    }

    toggleMute() {
        if (this.localStream) {
            this.isMuted = !this.isMuted;
            this.localStream.getAudioTracks().forEach(track => {
                track.enabled = !this.isMuted;
            });
            
            const btn = document.getElementById('muteBtn');
            if (btn) {
                btn.innerHTML = this.isMuted ? '<i class="bi bi-mic-mute"></i>' : '<i class="bi bi-mic"></i>';
                btn.classList.toggle('active', this.isMuted);
            }
        }
    }

    async loadActiveStreams() {
        const container = document.getElementById('activeStreamsGrid');
        if (!container) return;

        try {
            const data = await window.api.request('/live');
            const streams = Array.isArray(data) ? data : (data.streams || []);

            if (streams.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <i class="bi bi-broadcast"></i>
                        <p>No active transmissions found.</p>
                    </div>
                `;
                return;
            }

            container.innerHTML = streams.map(s => `
                <div class="stream-card" onclick="window.live.joinStream(${s.id})">
                    <img src="${s.thumbnail || window.profile.getFallbackAvatar(s.username)}">
                    <div class="card-overlay">
                        <span class="live-tag">LIVE</span>
                        <div class="card-info">
                            <div class="card-user">@${s.username}</div>
                            <div class="card-viewers"><i class="bi bi-eye"></i> ${s.viewers || 0}</div>
                        </div>
                    </div>
                </div>
            `).join('');
        } catch (err) {
            console.error("Load live error:", err);
        }
    }

    renderStreamOverlay() {
        const overlay = document.getElementById('liveOverlay');
        if (overlay) {
            overlay.innerHTML = `
                <div class="live-status">
                    <span class="pulse-dot"></span> LIVE
                </div>
                <div class="live-controls">
                    <button id="muteBtn" class="ctrl-btn" onclick="window.live.toggleMute()">
                        <i class="bi bi-mic"></i>
                    </button>
                    <button class="ctrl-btn end-btn" onclick="window.live.confirmEndStream()">
                        End Stream
                    </button>
                </div>
            `;
        }
    }

    updateViewerCount(count) {
        const el = document.getElementById('viewerCount');
        if (el) el.textContent = count;
    }
}

// Global initialization
window.live = new LiveStreamer();
