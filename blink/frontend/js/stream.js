// frontend/js/stream.js
/**
 * ONE-TO-MANY WebRTC Live Streaming 
 * Handles Broadcaster and Viewer logic.
 */

window.LiveStreaming = (function() {
    let socket;
    let localStream = null;
    let isBroadcaster = false;
    
    // Broadcaster keeps a map of PeerConnections: { viewerSocketId: RTCPeerConnection }
    const peerConnections = {}; 
    
    // Viewer keeps a single PeerConnection to the broadcaster
    let viewerPc = null;
    let pendingIce = []; // Queue for ICE candidates arriving before remote description

    // ── TURN/STUN Configuration ─────────────────────────────────────
    // Multiple fallback TURN servers are critical for different networks
    const configuration = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            {
                urls: 'turn:openrelay.metered.ca:80',
                username: 'openrelayproject',
                credential: 'openrelayproject'
            },
            {
                urls: 'turn:openrelay.metered.ca:443?transport=tcp',
                username: 'openrelayproject',
                credential: 'openrelayproject'
            },
            {
                urls: 'turns:openrelay.metered.ca:443',
                username: 'openrelayproject',
                credential: 'openrelayproject'
            }
        ],
        iceCandidatePoolSize: 10,
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require'
    };

    // ── Utility Functions ───────────────────────────────────────────
    function log(msg, ...args) {
        console.log(`[WebRTC] ${msg}`, ...args);
    }

    function debugLog(label, value) {
        const debugContent = document.getElementById('debugContent');
        if (!debugContent) return;
        
        let row = document.getElementById(`debug-${label}`);
        if (!row) {
            row = document.createElement('div');
            row.id = `debug-${label}`;
            row.className = 'debug-row';
            row.innerHTML = `<span class="debug-label">${label}</span> <span class="debug-value" id="val-${label}">${value}</span>`;
            debugContent.appendChild(row);
        } else {
            document.getElementById(`val-${label}`).textContent = value;
        }
    }

    // Single unified function to handle all black screen scenarios
    function fixBlackScreen(videoElement) {
        if (!videoElement) return;
        
        // 1. Enforce attributes missing from HTML
        videoElement.autoplay = true;
        videoElement.playsInline = true;

        // 2. Play fallback if srcObject is set but paused
        if (videoElement.srcObject && videoElement.paused) {
            log('Video paused, attempting manual play()');
            videoElement.play().catch(err => {
                log('Autoplay blocked by browser. Showing manual play overlay.', err);
                const playOverlay = document.getElementById('playOverlay');
                if (playOverlay) {
                    playOverlay.style.display = 'flex';
                    playOverlay.onclick = () => {
                        videoElement.play();
                        playOverlay.style.display = 'none';
                    };
                }
            });
        }
    }

    // Monitor WebRTC Stats every 2 seconds (DEBUG)
    function monitorStats(pc, peerId = 'Viewer') {
        setInterval(async () => {
            if (!pc || pc.connectionState !== 'connected') return;

            try {
                const stats = await pc.getStats();
                let bytesReceived = 0;
                let fps = 0;
                let activeCandidate = null;

                stats.forEach(report => {
                    if (report.type === 'inbound-rtp' && report.kind === 'video') {
                        bytesReceived = report.bytesReceived || 0;
                        fps = report.framesPerSecond || 0;
                    }
                    if (report.type === 'candidate-pair' && report.state === 'succeeded') {
                        activeCandidate = report;
                    }
                });

                debugLog(`${peerId} FPS`, fps);
                debugLog(`${peerId} Bytes Rx`, (bytesReceived / 1024).toFixed(2) + ' KB');
                debugLog(`${peerId} Conn State`, pc.connectionState);

                if (activeCandidate) {
                    const localCandidate = stats.get(activeCandidate.localCandidateId);
                    if (localCandidate) {
                        // relay means TURN server is actively routing traffic
                        debugLog(`${peerId} ICE Mode`, localCandidate.candidateType.toUpperCase());
                    }
                }
            } catch (err) {
                log('Stats error', err);
            }
        }, 2000);
    }

    // Clean up peer connection to avoid memory leaks
    function cleanupPeerConnection(socketId) {
        if (peerConnections[socketId]) {
            peerConnections[socketId].onicecandidate = null;
            peerConnections[socketId].ontrack = null;
            peerConnections[socketId].onconnectionstatechange = null;
            peerConnections[socketId].close();
            delete peerConnections[socketId];
            log(`Cleaned up peer connection for ${socketId}`);
        }
        if (viewerPc) {
            viewerPc.close();
            viewerPc = null;
            log('Cleaned up viewer peer connection');
        }
    }

    // ── Broadcaster Setup ───────────────────────────────────────────
    async function initBroadcaster(roomId) {
        isBroadcaster = true;
        log(`Initializing Broadcaster for room: ${roomId}`);
        document.getElementById('statusIndicator').textContent = 'Requesting Camera...';

        try {
            // Fallback constraints: Try HD, fallback to anything on failure
            try {
                localStream = await navigator.mediaDevices.getUserMedia({
                    video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
                    audio: true
                });
                document.getElementById('qualityIndicator').textContent = 'Quality: 720p HD';
            } catch (e) {
                log('HD constraint failed, falling back to basic constraints', e);
                localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                document.getElementById('qualityIndicator').textContent = 'Quality: Basic/SD';
            }

            const localVideo = document.getElementById('localVideo');
            localVideo.srcObject = localStream;
            fixBlackScreen(localVideo);

            // Connect socket
            socket = io();
            socket.on('connect', () => {
                log('Socket connected, joining as broadcaster');
                socket.emit('join-room', { roomId, role: 'broadcaster' });
                document.getElementById('statusIndicator').textContent = 'Broadcasting';
                document.getElementById('statusIndicator').style.color = '#0f0';
            });

            socket.on('viewer-joined', async ({ viewerId }) => {
                log(`New viewer joined: ${viewerId}, sending offer...`);
                await createOfferForViewer(viewerId);
            });

            socket.on('answer', async ({ viewerId, answer }) => {
                log(`Received answer from ${viewerId}`);
                if (peerConnections[viewerId]) {
                    await peerConnections[viewerId].setRemoteDescription(new RTCSessionDescription(answer));
                }
            });

            socket.on('ice-candidate', async ({ senderId, candidate }) => {
                const pc = peerConnections[senderId];
                if (pc && pc.remoteDescription) {
                    await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(e => log('ICE error', e));
                }
            });

            socket.on('viewer-disconnected', ({ viewerId }) => {
                log(`Viewer ${viewerId} disconnected`);
                cleanupPeerConnection(viewerId);
            });

            socket.on('room-update', ({ viewersCount }) => {
                document.getElementById('viewerCount').textContent = viewersCount;
            });

            // UI
            document.getElementById('endStreamBtn').style.display = 'inline-block';
            document.getElementById('goLiveBtn').style.display = 'none';
            document.getElementById('endStreamBtn').onclick = () => location.href = '/pages/index.html';

        } catch (err) {
            log('Error accessing media devices', err);
            document.getElementById('statusIndicator').textContent = 'Camera Denied';
            document.getElementById('statusIndicator').style.color = '#f00';
            alert('Could not access camera/microphone. Please check permissions.');
        }
    }

    async function createOfferForViewer(viewerId) {
        cleanupPeerConnection(viewerId); // Reset if exists

        const pc = new RTCPeerConnection(configuration);
        peerConnections[viewerId] = pc;

        // Add all local tracks
        localStream.getTracks().forEach(track => {
            pc.addTrack(track, localStream);
        });

        // Exchange ICE candidates
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('ice-candidate', { targetId: viewerId, candidate: event.candidate });
            }
        };

        pc.onconnectionstatechange = () => {
            log(`[Connection State Viewer ${viewerId}]: ${pc.connectionState}`);
            if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
                cleanupPeerConnection(viewerId);
            }
        };

        monitorStats(pc, `Viewer_${viewerId.substring(0,4)}`);

        // Create and send offer
        try {
            const offer = await pc.createOffer({ offerToReceiveVideo: false, offerToReceiveAudio: false });
            await pc.setLocalDescription(offer);
            socket.emit('offer', { viewerId, offer });
            log(`Sent offer to ${viewerId}`);
        } catch (err) {
            log('Error creating offer', err);
        }
    }

    // ── Viewer Setup ───────────────────────────────────────────
    function initViewer(roomId) {
        log(`Initializing Viewer for room: ${roomId}`);
        socket = io();

        socket.on('connect', () => {
            log('Socket connected, joining as viewer');
            socket.emit('join-room', { roomId, role: 'viewer' });
            document.getElementById('statusIndicator').textContent = 'Waiting for Host...';
        });

        socket.on('broadcaster-ready', () => {
            log('Host is ready! Offer should arrive soon...');
        });

        socket.on('broadcaster-disconnected', () => {
            document.getElementById('statusIndicator').textContent = 'Stream Offline';
            document.getElementById('statusIndicator').style.color = '#f00';
            cleanupPeerConnection('all');
        });

        socket.on('offer', async ({ broadcasterId, offer }) => {
            log(`Received offer from host ${broadcasterId}`);
            await handleOfferFromBroadcaster(broadcasterId, offer);
        });

        socket.on('ice-candidate', async ({ senderId, candidate }) => {
            if (!viewerPc) {
                pendingIce.push(candidate);
                return;
            }
            if (viewerPc.remoteDescription) {
                await viewerPc.addIceCandidate(new RTCIceCandidate(candidate)).catch(e => log('ICE Viewer error', e));
            } else {
                pendingIce.push(candidate);
            }
        });

        socket.on('room-update', ({ viewersCount }) => {
            document.getElementById('viewerCount').textContent = viewersCount;
        });

        // Volume control
        const volCtrl = document.getElementById('volumeControl');
        if (volCtrl) {
            volCtrl.addEventListener('input', (e) => {
                const video = document.getElementById('remoteVideo');
                if (video) video.volume = e.target.value;
            });
        }
    }

    async function handleOfferFromBroadcaster(broadcasterId, offer) {
        cleanupPeerConnection('all'); // Clear existing UI
        document.getElementById('loadingSpinner').style.display = 'flex';
        
        viewerPc = new RTCPeerConnection(configuration);

        viewerPc.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('ice-candidate', { targetId: broadcasterId, candidate: event.candidate });
            }
        };

        viewerPc.ontrack = (event) => {
            log('Got remote track', event.streams[0]);
            const remoteVideo = document.getElementById('remoteVideo');
            
            // Fix duplicate track mapping bug: always use streams[0]
            if (remoteVideo.srcObject !== event.streams[0]) {
                remoteVideo.srcObject = event.streams[0];
                remoteVideo.muted = false; // NEVER mute viewer
                log('Attached stream to video element');
                
                remoteVideo.onloadedmetadata = () => {
                    document.getElementById('loadingSpinner').style.display = 'none';
                    fixBlackScreen(remoteVideo);
                };
            }
        };

        viewerPc.onconnectionstatechange = () => {
            const state = viewerPc.connectionState;
            log(`[Viewer Connection State]: ${state}`);
            document.getElementById('statusIndicator').textContent = `Conn: ${state.toUpperCase()}`;
            debugLog('Viewer State', state);
            
            if (state === 'connected') {
                document.getElementById('loadingSpinner').style.display = 'none';
                document.getElementById('reconnectBtn').style.display = 'none';
                document.getElementById('statusIndicator').style.color = '#0f0';
            } else if (state === 'failed' || state === 'disconnected') {
                document.getElementById('reconnectBtn').style.display = 'block';
                document.getElementById('reconnectBtn').onclick = () => window.location.reload();
            }
        };

        viewerPc.oniceconnectionstatechange = () => {
            log(`[ICE State Viewer]: ${viewerPc.iceConnectionState}`);
            debugLog('ICE State', viewerPc.iceConnectionState);
        };

        monitorStats(viewerPc, 'Host');

        try {
            await viewerPc.setRemoteDescription(new RTCSessionDescription(offer));
            
            // Add any valid queued ICE candidates now that remoteDesc is set
            while(pendingIce.length) {
                const c = pendingIce.shift();
                await viewerPc.addIceCandidate(new RTCIceCandidate(c)).catch(()=>{});
            }

            const answer = await viewerPc.createAnswer();
            await viewerPc.setLocalDescription(answer);
            socket.emit('answer', { broadcasterId, answer });
            log('Sent answer to host');
        } catch (err) {
            log('Error handling offer', err);
        }
    }

    return { initBroadcaster, initViewer };
})();
