/**
 * frontend/js/live.js
 * ═══════════════════════════════════════════════════════════════════════════════
 * Live Streaming with WebRTC 
 * Requirements: Socket.io, WebRTC API, getUserMedia
 * ═══════════════════════════════════════════════════════════════════════════════
 */

class BlinkLiveStreamer {
    constructor() {
        this.socket = null;
        this.localStream = null;
        this.peerConnections = new Map();
        this.streamId = null;
        this.isStreaming = false;
        this.config = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' }
            ]
        };

        this.init();
    }

    /**
     * Initialize WebSocket connection
     */
    async init() {
        try {
            const token = window.BlinkConfig.getToken();
            if (!token) {
                alert('Please login to stream');
                window.location.href = '/login.html';
                return;
            }

            // Connect to Socket.io
            const IO = (typeof io !== 'undefined') ? io : null;
            if (!IO) {
                console.error('Socket.io not loaded');
                return;
            }

            this.socket = IO(window.BlinkConfig.SOCKET_URL, {
                auth: { token },
                transports: ['websocket', 'polling']
            });

            this.setupSocketEvents();
            console.log('✅ Live streaming initialized');

        } catch (error) {
            console.error('❌ Init error:', error);
        }
    }

    /**
     * Setup Socket.io event listeners
     */
    setupSocketEvents() {
        this.socket.on('connect', () => {
            console.log('✅ Connected to Socket.io');
        });

        this.socket.on('viewer-joined', (data) => {
            console.log(`👁️  Viewer joined:`, data);
            this.updateViewerCount(data.viewerCount);
        });

        this.socket.on('stream-ended', (data) => {
            console.log('🔴 Stream ended');
            this.stopStream();
        });

        this.socket.on('webrtc-offer', async (data) => {
            console.log('📨 Received WebRTC offer');
            await this.handleWebRTCOffer(data);
        });

        this.socket.on('webrtc-answer', async (data) => {
            console.log('📨 Received WebRTC answer');
            await this.handleWebRTCAnswer(data);
        });

        this.socket.on('webrtc-ice-candidate', async (data) => {
            console.log('📨 Received ICE candidate');
            await this.handleICECandidate(data);
        });
    }

    /**
     * Start live stream
     */
    async startStream() {
        try {
            if (this.isStreaming) {
                alert('Already streaming');
                return;
            }

            // Get user media permissions
            this.localStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    facingMode: 'user'
                },
                audio: true
            });

            // Display local stream
            const videoElement = document.getElementById('local-video');
            if (videoElement) {
                videoElement.srcObject = this.localStream;
                videoElement.style.display = 'block';
            }

            // Notify backend
            this.socket.emit('start-stream', {});

            this.isStreaming = true;
            console.log('🔴 Stream started');

            // Update UI
            this.updateStreamStatus('LIVE');

        } catch (error) {
            console.error('❌ Stream start error:', error);
            alert(`Failed to start stream: ${error.message}`);
        }
    }

    /**
     * Stop live stream
     */
    async stopStream() {
        try {
            if (!this.isStreaming) return;

            // Stop all peer connections
            for (const [peerId, pc] of this.peerConnections) {
                pc.close();
            }
            this.peerConnections.clear();

            // Stop local stream
            if (this.localStream) {
                this.localStream.getTracks().forEach(track => track.stop());
                this.localStream = null;
            }

            // Hide video element
            const videoElement = document.getElementById('local-video');
            if (videoElement) {
                videoElement.style.display = 'none';
            }

            // Notify backend
            if (this.streamId) {
                this.socket.emit('end-stream', { streamId: this.streamId });
            }

            this.isStreaming = false;
            console.log('🔴 Stream stopped');

            // Update UI
            this.updateStreamStatus('ENDED');

        } catch (error) {
            console.error('❌ Stream stop error:', error);
        }
    }

    /**
     * Join existing live stream as viewer
     */
    async joinStream(streamId) {
        try {
            this.streamId = streamId;
            this.socket.emit('join-stream', { streamId });
            console.log('👁️  Joined stream:', streamId);
        } catch (error) {
            console.error('❌ Join error:', error);
        }
    }

    /**
     * Handle WebRTC offer
     */
    async handleWebRTCOffer(data) {
        try {
            const { fromUserId, offer } = data;
            const pc = this.createPeerConnection(fromUserId);

            await pc.setRemoteDescription(new RTCSessionDescription(offer));

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            this.socket.emit('webrtc-answer', {
                targetUserId: fromUserId,
                answer: pc.localDescription
            });

        } catch (error) {
            console.error('❌ Offer handling error:', error);
        }
    }

    /**
     * Handle WebRTC answer
     */
    async handleWebRTCAnswer(data) {
        try {
            const { fromUserId, answer } = data;
            const pc = this.peerConnections.get(fromUserId);

            if (pc) {
                await pc.setRemoteDescription(new RTCSessionDescription(answer));
            }

        } catch (error) {
            console.error('❌ Answer handling error:', error);
        }
    }

    /**
     * Handle ICE candidate
     */
    async handleICECandidate(data) {
        try {
            const { fromUserId, candidate } = data;
            const pc = this.peerConnections.get(fromUserId);

            if (pc && candidate) {
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
            }

        } catch (error) {
            console.error('❌ ICE candidate error:', error);
        }
    }

    /**
     * Create peer connection
     */
    createPeerConnection(peerId) {
        if (this.peerConnections.has(peerId)) {
            return this.peerConnections.get(peerId);
        }

        const pc = new RTCPeerConnection({
            iceServers: this.config.iceServers
        });

        // Add local stream to connection
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                pc.addTrack(track, this.localStream);
            });
        }

        // Handle remote stream
        pc.ontrack = (event) => {
            console.log('📹 Remote stream received');
            const remoteVideo = document.getElementById(`remote-video-${peerId}`);
            if (remoteVideo) {
                remoteVideo.srcObject = event.streams[0];
            }
        };

        // Send ICE candidates
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                this.socket.emit('webrtc-ice-candidate', {
                    targetUserId: peerId,
                    candidate: event.candidate
                });
            }
        };

        this.peerConnections.set(peerId, pc);
        return pc;
    }

    /**
     * Send WebRTC offer to peer
     */
    async sendWebRTCOffer(targetUserId) {
        try {
            const pc = this.createPeerConnection(targetUserId);
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            this.socket.emit('webrtc-offer', {
                targetUserId,
                offer: pc.localDescription
            });

        } catch (error) {
            console.error('❌ Offer error:', error);
        }
    }

    /**
     * Update viewer count in UI
     */
    updateViewerCount(count) {
        const element = document.getElementById('viewer-count');
        if (element) {
            element.textContent = `👁️  ${count} viewers`;
        }
    }

    /**
     * Update stream status
     */
    updateStreamStatus(status) {
        const element = document.getElementById('stream-status');
        if (element) {
            element.textContent = `● ${status}`;
            element.className = `status-${status.toLowerCase()}`;
        }
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    window.BlinkStreamer = new BlinkLiveStreamer();

    // Setup UI button handlers
    const startBtn = document.querySelector('[data-action="start-stream"]');
    const stopBtn = document.querySelector('[data-action="stop-stream"]');

    if (startBtn) {
        startBtn.addEventListener('click', () => window.BlinkStreamer.startStream());
    }

    if (stopBtn) {
        stopBtn.addEventListener('click', () => window.BlinkStreamer.stopStream());
    }

    console.log('✅ Live streaming module loaded');
});
