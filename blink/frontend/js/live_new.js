/* ═══════════════════════════════════════════════════════════════════════════════
   BLINK v4.0 - LIVE STREAMING MODULE
   WebRTC streaming, peer connections, viewer management
   ═══════════════════════════════════════════════════════════════════════════════ */

class LiveStreamer {
    constructor() {
        this.isStreaming = false;
        this.localStream = null;
        this.peerConnections = new Map();
        this.socket = window.Blink?.socket || null;
        this.streamId = null;
    }

    /**
     * Initialize live page
     */
    init() {
        if (!window.auth?.requireAuth?.()) return;

        this.setupSocket();
        this.setupEventListeners();
        this.loadLiveStreams();
    }

    /**
     * Setup Socket.io connection
     */
    setupSocket() {
        if (!this.socket) {
            console.warn('Socket.io not connected');
            return;
        }

        // Join stream event
        this.socket.on('stream-joined', (data) => {
            console.log('User joined stream:', data.userId);
            this.handleNewViewer(data);
        });

        // Receive offer from streamer
        this.socket.on('webrtc-offer', (data) => {
            this.handleOffer(data);
        });

        // Receive answer
        this.socket.on('webrtc-answer', (data) => {
            this.handleAnswer(data);
        });

        // Receive ICE candidate
        this.socket.on('ice-candidate', (data) => {
            this.handleICECandidate(data);
        });

        // Stream ended
        this.socket.on('stream-ended', () => {
            this.handleStreamEnded();
        });
    }

    /**
     * Start streaming
     */
    async startStream() {
        if (!window.auth?.requireAuth?.()) return;

        try {
            window.app?.showLoading?.();

            // Get user media
            this.localStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                },
                audio: true
            });

            // Start live stream on backend
            const response = await window.api?.startLiveStream?.('Going Live!');
            if (!response?.stream) throw new Error('Failed to create stream');

            this.streamId = response.stream.id;
            this.isStreaming = true;

            // Display local video
            const video = document.querySelector('.live-container .stream-video-container video');
            if (video) {
                video.srcObject = this.localStream;
            }

            // Emit start-stream to notify viewers
            this.socket?.emit('start-stream', {
                streamId: this.streamId,
                title: 'Live Stream'
            });

            window.app?.hideLoading?.();
            this.updateStreamOverlay();
            window.app?.showSuccess?.('✅ You\'re now live!');
        } catch (error) {
            window.app?.hideLoading?.();
            window.app?.showError?.(`Failed to start stream: ${error.message}`);
            console.error('Stream start error:', error);
        }
    }

    /**
     * Join stream as viewer
     */
    async joinStream(streamId) {
        try {
            window.app?.showLoading?.();

            this.streamId = streamId;

            // Notify backend we're joining
            this.socket?.emit('join-stream', { streamId });

            // Get viewer stream (just audio from viewer)
            this.localStream = await navigator.mediaDevices.getUserMedia({
                video: false,
                audio: true
            });

            window.app?.hideLoading?.();
            window.app?.showSuccess?.('Connected to stream!');
        } catch (error) {
            window.app?.hideLoading?.();
            window.app?.showError?.(`Failed to join stream: ${error.message}`);
        }
    }

    /**
     * End stream
     */
    async endStream() {
        try {
            if (this.localStream) {
                this.localStream.getTracks().forEach(track => track.stop());
                this.localStream = null;
            }

            if (this.streamId) {
                await window.api?.endLiveStream?.(this.streamId);
            }

            // Close all peer connections
            this.peerConnections.forEach(pc => pc.close());
            this.peerConnections.clear();

            this.isStreaming = false;
            this.streamId = null;

            // Notify viewers
            this.socket?.emit('end-stream');

            window.app?.showSuccess?.('Stream ended');
            window.app?.redirect?.('feed');
        } catch (error) {
            window.app?.showError?.('Failed to end stream');
            console.error('Stream end error:', error);
        }
    }

    /**
     * Load available live streams
     */
    async loadLiveStreams() {
        try {
            const response = await window.api?.getLiveStreams?.();
            if (response?.streams) {
                this.displayLiveStreams(response.streams);
            } else {
                this.showEmptyState();
            }
        } catch (error) {
            console.error('Failed to load streams:', error);
            this.showEmptyState();
        }
    }

    /**
     * Display live streams
     */
    displayLiveStreams(streams) {
        const container = document.querySelector('.live-container');
        if (!container) return;

        const html = streams.map(stream => `
            <div class="stream-card">
                <div class="stream-thumbnail">
                    <img src="${stream.thumbnail_url || 'https://via.placeholder.com/300x200'}" alt="${stream.author?.username}">
                    <span class="live-badge">LIVE</span>
                </div>
                <div class="stream-info">
                    <h3>${stream.title}</h3>
                    <p>${stream.author?.username}</p>
                    <p>${stream.viewer_count || 0} viewers</p>
                    <button class="btn-primary" onclick="window.live.joinStream('${stream.id}')">
                        Join Stream
                    </button>
                </div>
            </div>
        `).join('');

        container.innerHTML = html;
    }

    /**
     * Show empty state
     */
    showEmptyState() {
        const container = document.querySelector('.live-container');
        if (!container) return;

        container.innerHTML = `
            <div class="empty-state">
                <i class="bi bi-video-off"></i>
                <h2>No live streams</h2>
                <p>No creators are streaming right now.</p>
                <button class="btn-primary" onclick="window.live.startStream()">
                    Start a Stream
                </button>
            </div>
        `;
    }

    /**
     * Handle offer from streamer
     */
    async handleOffer(data) {
        try {
            const { fromUserId, offer } = data;

            let pc = this.peerConnections.get(fromUserId);
            if (!pc) {
                pc = this.createPeerConnection(fromUserId);
            }

            await pc.setRemoteDescription(new RTCSessionDescription(offer));

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            this.socket?.emit('webrtc-answer', {
                toUserId: fromUserId,
                streamId: this.streamId,
                answer: pc.localDescription
            });
        } catch (error) {
            console.error('Error handling offer:', error);
        }
    }

    /**
     * Handle answer
     */
    async handleAnswer(data) {
        try {
            const { fromUserId, answer } = data;
            const pc = this.peerConnections.get(fromUserId);

            if (pc) {
                await pc.setRemoteDescription(new RTCSessionDescription(answer));
            }
        } catch (error) {
            console.error('Error handling answer:', error);
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
            console.error('Error adding ICE candidate:', error);
        }
    }

    /**
     * Create peer connection
     */
    createPeerConnection(userId) {
        const pc = new RTCPeerConnection({
            iceServers: [
                { urls: ['stun:stun.l.google.com:19302'] },
                { urls: ['stun:stun1.l.google.com:19302'] }
            ]
        });

        // Add local stream tracks
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                pc.addTrack(track, this.localStream);
            });
        }

        // Handle remote stream
        pc.ontrack = (event) => {
            const video = document.querySelector('.stream-video-container video');
            if (video && event.streams[0]) {
                video.srcObject = event.streams[0];
            }
        };

        // Handle ICE candidates
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                this.socket?.emit('ice-candidate', {
                    toUserId: userId,
                    streamId: this.streamId,
                    candidate: event.candidate
                });
            }
        };

        // Handle connection state changes
        pc.onconnectionstatechange = () => {
            if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
                pc.close();
                this.peerConnections.delete(userId);
            }
        };

        this.peerConnections.set(userId, pc);
        return pc;
    }

    /**
     * Handle new viewer
     */
    handleNewViewer(data) {
        if (this.isStreaming) {
            this.createOffer(data.userId);
        }
    }

    /**
     * Create offer for viewer
     */
    async createOffer(viewerId) {
        try {
            const pc = this.createPeerConnection(viewerId);

            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            this.socket?.emit('webrtc-offer', {
                toUserId: viewerId,
                streamId: this.streamId,
                offer: pc.localDescription
            });
        } catch (error) {
            console.error('Error creating offer:', error);
        }
    }

    /**
     * Handle stream ended
     */
    handleStreamEnded() {
        this.peerConnections.forEach(pc => pc.close());
        this.peerConnections.clear();
        window.app?.showError?.('Stream has ended');
        window.app?.redirect?.('live');
    }

    /**
     * Update stream overlay
     */
    updateStreamOverlay() {
        const info = document.querySelector('.stream-info');
        if (info) {
            info.innerHTML = `
                <span class="live-badge">🔴 LIVE</span>
                <span>${new Date().toLocaleTimeString()}</span>
            `;
        }
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        const startBtn = document.querySelector('[onclick*="startStream"]');
        const endBtn = document.querySelector('[onclick*="endStream"]');

        if (startBtn) {
            startBtn.addEventListener('click', () => this.startStream());
        }

        if (endBtn) {
            endBtn.addEventListener('click', () => this.endStream());
        }
    }
}

// Create global instance
window.live = new LiveStreamer();

export default window.live;
