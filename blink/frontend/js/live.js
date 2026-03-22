console.log('[Live] Script loaded — starting initialization');

(function() {
    document.addEventListener('DOMContentLoaded', async () => {
        console.log('[Live] DOMContentLoaded fired');
        
        // Wait for window.Blink
        let attempts = 0;
        while (!window.Blink && attempts < 30) {
            await new Promise(r => setTimeout(r, 50));
            attempts++;
        }

        if (!window.Blink) {
            console.error('[Live] window.Blink not found after waiting.');
            return;
        }

        const { getToken, getUser, requireAuth, apiRequest, showToast, populateSidebar } = window.Blink;
        
        if (!requireAuth()) return;

        try { populateSidebar(); } catch (e) { console.warn('[Live] Sidebar failed', e); }

        // ═══════════════════════════════════════════════════════
        // ── DOM Selectors ────────────────────────────────────
        // ═══════════════════════════════════════════════════════
        const video         = document.getElementById('remoteVideo');
        const goLiveBtn     = document.getElementById('goLiveBtn');
        const stopLiveBtn   = document.getElementById('stopLiveBtn');
        const discoveryEl   = document.getElementById('liveDiscovery');
        const streamsGrid   = document.getElementById('liveStreamsGrid');
        const chatAreaEl    = document.getElementById('liveChatArea');
        const commentsEl    = document.getElementById('liveComments');
        const msgInput      = document.getElementById('liveMsgInput');
        const sendMsgBtn    = document.getElementById('sendLiveMsgBtn');
        const viewCount     = document.getElementById('viewCount');
        const liveBadge     = document.getElementById('liveBadge');
        const watchingInfo  = document.getElementById('watchingInfo');
        const watchingUserEl= document.getElementById('watchingUsername');
        const exitLiveBtn   = document.getElementById('exitLiveBtn');
        const watchOverlay  = document.getElementById('watchOverlay');
        const broadcasterControls = document.getElementById('broadcasterControls');
        const toggleMicBtn  = document.getElementById('toggleMicBtn');
        const toggleCamBtn  = document.getElementById('toggleCamBtn');

        // ═══════════════════════════════════════════════════════
        // ── State ────────────────────────────────────────────
        // ═══════════════════════════════════════════════════════
        let localStream     = null;
        let isBroadcaster   = false;
        let currentStreamId = null;
        let socket          = null;
        let peerConnections = {};   // Broadcaster: { viewerSocketId: RTCPeerConnection }
        let viewerPc        = null; // Viewer: connection to broadcaster
        let streamEnded     = false;
        let pendingIce      = [];
        let pendingIceBroadcaster = {};
        let mediaRecorder   = null;
        let recordedChunks  = [];
        let micEnabled      = true;
        let camEnabled      = true;

        // ── ICE/STUN Configuration ───────────────────────────
        const rtcConfig = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' },
                { urls: 'stun:stun3.l.google.com:19302' },
                { urls: 'stun:stun4.l.google.com:19302' }
            ],
            iceCandidatePoolSize: 10
        };

        const dbg = (...args) => console.log('[Live]', ...args);
        const getCurrentUser = () => getUser() || {};

        // ═══════════════════════════════════════════════════════
        // ── WebRTC: BROADCASTER creates PC per viewer ────────
        // ═══════════════════════════════════════════════════════
        async function initiateBroadcasterPc(viewerSocketId) {
            dbg('Creating PeerConnection for viewer:', viewerSocketId);
            
            // Close existing connection if any
            if (peerConnections[viewerSocketId]) {
                peerConnections[viewerSocketId].close();
            }

            const pc = new RTCPeerConnection(rtcConfig);
            peerConnections[viewerSocketId] = pc;

            // Add all local tracks to this connection
            if (localStream) {
                localStream.getTracks().forEach(track => {
                    pc.addTrack(track, localStream);
                });
            }

            // Send ICE candidates to viewer
            pc.onicecandidate = (event) => {
                if (event.candidate && socket) {
                    socket.emit('ice-candidate', { to: viewerSocketId, candidate: event.candidate });
                }
            };

            pc.onconnectionstatechange = () => {
                dbg(`Broadcaster→Viewer[${viewerSocketId}] state:`, pc.connectionState);
                if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
                    pc.close();
                    delete peerConnections[viewerSocketId];
                }
            };

            // Create and send offer
            try {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                socket.emit('offer', { to: viewerSocketId, offer });
                dbg('Offer sent to viewer:', viewerSocketId);
            } catch (err) {
                dbg('Error creating offer:', err);
            }
        }

        // ═══════════════════════════════════════════════════════
        // ── WebRTC: VIEWER handles offer from broadcaster ────
        // ═══════════════════════════════════════════════════════
        async function handleOffer(broadcasterSocketId, offer) {
            dbg('Received offer from broadcaster:', broadcasterSocketId);
            
            if (viewerPc) viewerPc.close();
            viewerPc = new RTCPeerConnection(rtcConfig);

            // Send ICE candidates to broadcaster
            viewerPc.onicecandidate = (e) => {
                if (e.candidate && socket) {
                    socket.emit('ice-candidate', { to: broadcasterSocketId, candidate: e.candidate });
                }
            };

            // Receive remote video/audio track
            viewerPc.ontrack = (event) => {
                dbg('🎥 Remote track received!', event.streams.length, 'streams');
                if (video && event.streams[0]) {
                    video.srcObject = event.streams[0];
                    video.muted = false;
                    
                    const spinner = document.getElementById('loadingSpinner');
                    
                    video.onloadedmetadata = () => {
                        dbg('Video metadata loaded — playing');
                        if (spinner) spinner.style.display = 'none';
                        video.play().catch(err => {
                            dbg('Autoplay blocked — showing overlay');
                            if (watchOverlay) watchOverlay.style.display = 'flex';
                        });
                    };
                }
            };

            viewerPc.onconnectionstatechange = () => {
                dbg('Viewer PC state:', viewerPc.connectionState);
                if (viewerPc.connectionState === 'connected') {
                    dbg('✅ Connected to broadcaster!');
                }
            };

            try {
                await viewerPc.setRemoteDescription(new RTCSessionDescription(offer));
                const answer = await viewerPc.createAnswer();
                await viewerPc.setLocalDescription(answer);
                socket.emit('answer', { to: broadcasterSocketId, answer });
                dbg('Answer sent to broadcaster');

                // Flush pending ICE candidates
                if (pendingIce.length > 0) {
                    dbg('Adding', pendingIce.length, 'queued ICE candidates');
                    for (const cand of pendingIce) {
                        await viewerPc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
                    }
                    pendingIce = [];
                }
            } catch (err) {
                dbg('handleOffer error:', err);
            }
        }

        // ═══════════════════════════════════════════════════════
        // ── Socket.IO Connection ─────────────────────────────
        // ═══════════════════════════════════════════════════════
        function initSocket(streamId, role) {
            if (socket) socket.disconnect();
            socket = io();
            const user = getCurrentUser();

            socket.on('connect', () => {
                dbg('Socket connected:', socket.id);
                socket.emit('join_live', { streamId, userId: user.id, username: user.username, role });
            });

            // Viewer count updates
            socket.on('viewer_update', ({ count }) => {
                if (viewCount) viewCount.textContent = count;
            });

            // When a new user joins the room
            socket.on('user_joined', async (data) => {
                dbg('User joined:', data.username, '(' + data.role + ') socketId:', data.socketId);
                // Broadcaster creates a PC for each new viewer
                if (isBroadcaster && data.role === 'viewer' && localStream) {
                    await initiateBroadcasterPc(data.socketId);
                }
            });

            // Viewer requests an offer (re-negotiation)
            socket.on('request_offer', async (data) => {
                if (isBroadcaster && localStream) {
                    dbg('Offer requested by:', data.from);
                    await initiateBroadcasterPc(data.from);
                }
            });

            // Viewer receives offer
            socket.on('offer', async (data) => {
                if (!isBroadcaster) {
                    await handleOffer(data.from, data.offer);
                }
            });

            // Broadcaster receives answer
            socket.on('answer', async (data) => {
                dbg('Answer received from:', data.from);
                const pc = peerConnections[data.from];
                if (isBroadcaster && pc) {
                    try {
                        await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
                        // Flush pending ICE
                        if (pendingIceBroadcaster[data.from]) {
                            for (const cand of pendingIceBroadcaster[data.from]) {
                                await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
                            }
                            delete pendingIceBroadcaster[data.from];
                        }
                    } catch (err) {
                        dbg('Set answer error:', err);
                    }
                }
            });

            // ICE candidate exchange
            socket.on('ice-candidate', async (data) => {
                const pc = isBroadcaster ? peerConnections[data.from] : viewerPc;
                if (pc && pc.remoteDescription) {
                    await pc.addIceCandidate(new RTCIceCandidate(data.candidate)).catch(() => {});
                } else {
                    // Queue if remote description not set yet
                    if (isBroadcaster) {
                        if (!pendingIceBroadcaster[data.from]) pendingIceBroadcaster[data.from] = [];
                        pendingIceBroadcaster[data.from].push(data.candidate);
                    } else {
                        pendingIce.push(data.candidate);
                    }
                }
            });

            // Chat
            socket.on('receive_live_chat', (data) => {
                appendComment(data.username, data.message, data.username === user.username);
            });

            // Reactions
            socket.on('receive_reaction', ({ emoji }) => spawnFloatingEmoji(emoji));

            // Stream ended
            socket.on('live_ended', () => handleStreamEnded());

            // Discovery refresh
            socket.on('live_discovery_update', () => {
                if (!isBroadcaster && !currentStreamId) loadDiscovery();
            });
        }

        // ═══════════════════════════════════════════════════════
        // ── UI Helpers ───────────────────────────────────────
        // ═══════════════════════════════════════════════════════

        function appendComment(username, message, isSelf) {
            if (!commentsEl) return;
            const div = document.createElement('div');
            div.className = 'chat-message';
            div.style.cssText = `padding:10px 14px;margin-bottom:8px;border-radius:14px;font-size:13px;
                background:${isSelf ? 'rgba(255,45,110,0.15)' : 'rgba(255,255,255,0.06)'};
                border:1px solid ${isSelf ? 'rgba(255,45,110,0.25)' : 'rgba(255,255,255,0.08)'}`;
            div.innerHTML = `<strong style="color:${isSelf ? 'var(--pink)' : '#eee'};font-weight:700">@${username}:</strong> <span style="color:#fff">${message}</span>`;
            commentsEl.appendChild(div);
            commentsEl.scrollTop = commentsEl.scrollHeight;
        }

        function handleStreamEnded() {
            if (streamEnded) return;
            dbg('Stream ended');
            streamEnded = true;

            // Stop recording
            if (isBroadcaster && mediaRecorder && mediaRecorder.state !== 'inactive') {
                mediaRecorder.stop();
            }

            // Stop local camera/mic
            if (localStream) {
                localStream.getTracks().forEach(t => t.stop());
                localStream = null;
            }

            // Close all peer connections
            if (viewerPc) { viewerPc.close(); viewerPc = null; }
            Object.values(peerConnections).forEach(pc => pc.close());
            peerConnections = {};

            // Disconnect socket
            if (socket) { socket.disconnect(); socket = null; }

            // Clear video
            if (video) video.srcObject = null;

            // Update UI
            if (liveBadge) {
                liveBadge.textContent = 'ENDED';
                liveBadge.style.background = '#444';
                liveBadge.style.animation = 'none';
                liveBadge.style.display = 'inline-flex';
            }
            if (broadcasterControls) broadcasterControls.style.display = 'none';
            if (stopLiveBtn) stopLiveBtn.style.display = 'none';

            showToast('Live Stream Ended', 'info');
            setTimeout(() => window.location.href = '/pages/index.html', 2500);
        }

        // ═══════════════════════════════════════════════════════
        // ── GO LIVE (Broadcaster) ────────────────────────────
        // ═══════════════════════════════════════════════════════
        async function startLive() {
            dbg('startLive initiating...');
            try {
                // Request camera + microphone
                localStream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        width: { ideal: 1280, max: 1920 },
                        height: { ideal: 720, max: 1080 },
                        frameRate: { ideal: 30, max: 60 },
                        facingMode: 'user'
                    },
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true
                    }
                });

                // Show local preview
                if (video) {
                    video.srcObject = localStream;
                    video.muted = true; // Prevent echo
                    video.play().catch(() => {});
                }

                // Start recording for archive
                recordedChunks = [];
                try {
                    mediaRecorder = new MediaRecorder(localStream, { mimeType: 'video/webm;codecs=vp9,opus' });
                } catch {
                    mediaRecorder = new MediaRecorder(localStream, { mimeType: 'video/webm' });
                }
                mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data); };
                mediaRecorder.onstop = async () => {
                    if (recordedChunks.length === 0) return;
                    const blob = new Blob(recordedChunks, { type: 'video/webm' });
                    const formData = new FormData();
                    formData.append('video', blob, `live_archive_${Date.now()}.webm`);
                    formData.append('caption', `Live Archive: ${new Date().toLocaleString()}`);
                    try {
                        const res = await fetch('/api/videos/upload', {
                            method: 'POST',
                            headers: { 'Authorization': `Bearer ${getToken()}` },
                            body: formData
                        });
                        const data = await res.json();
                        if (data.video) showToast('Live archive saved!', 'success');
                    } catch (e) { console.error('Archive save failed', e); }
                };
                mediaRecorder.start(2000);

                // Create stream on server
                const user = getCurrentUser();
                const res = await apiRequest('/live/start', {
                    method: 'POST',
                    body: JSON.stringify({ title: `${user.username}'s Live` })
                });
                currentStreamId = res.stream_id;
                isBroadcaster = true;

                // Update UI
                if (liveBadge) liveBadge.style.display = 'inline-flex';
                if (discoveryEl) discoveryEl.style.display = 'none';
                if (chatAreaEl) chatAreaEl.style.display = 'flex';
                if (stopLiveBtn) stopLiveBtn.style.display = 'block';
                if (goLiveBtn) goLiveBtn.style.display = 'none';
                if (broadcasterControls) broadcasterControls.style.display = 'flex';
                if (watchOverlay) watchOverlay.style.display = 'none';

                // Connect socket as broadcaster
                initSocket(currentStreamId, 'broadcaster');
                showToast('🔴 You are LIVE!', 'success');
                dbg('Live started - Stream ID:', currentStreamId);

            } catch (err) {
                dbg('startLive error:', err);
                if (err.name === 'NotAllowedError') {
                    showToast('Camera/microphone access denied. Please allow permissions.', 'error');
                } else {
                    showToast('Failed to start stream: ' + err.message, 'error');
                }
            }
        }

        // ═══════════════════════════════════════════════════════
        // ── WATCH STREAM (Viewer) ────────────────────────────
        // ═══════════════════════════════════════════════════════
        window.Blink.watchStream = async (streamId) => {
            dbg('watchStream requested for ID:', streamId);
            if (!streamId) return;

            // Show the watch overlay prompt
            if (watchOverlay) {
                watchOverlay.style.display = 'flex';

                watchOverlay.onclick = async () => {
                    try {
                        watchOverlay.style.display = 'none';
                        const spinner = document.getElementById('loadingSpinner');
                        if (spinner) spinner.style.display = 'flex';

                        // Switch UI to watch mode
                        if (discoveryEl) discoveryEl.style.display = 'none';
                        if (chatAreaEl) chatAreaEl.style.display = 'flex';
                        if (watchingInfo) watchingInfo.style.display = 'flex';
                        if (liveBadge) liveBadge.style.display = 'inline-flex';

                        // Fetch stream details
                        const data = await apiRequest(`/live/${streamId}`);
                        currentStreamId = streamId;
                        isBroadcaster = false;

                        if (watchingUserEl && data.stream) {
                            watchingUserEl.textContent = data.stream.username;
                            const watchingAvatar = document.getElementById('watchingAvatar');
                            if (watchingAvatar && data.stream.profile_picture) {
                                watchingAvatar.src = data.stream.profile_picture;
                            }
                        }

                        // Connect socket as viewer
                        initSocket(streamId, 'viewer');

                        // Request offer from broadcaster after a short delay
                        setTimeout(() => {
                            if (socket) {
                                dbg('Requesting offer from broadcaster...');
                                socket.emit('request_offer', { streamId: currentStreamId });
                            }
                        }, 1000);

                    } catch (err) {
                        dbg('watchStream error:', err);
                        showToast('Stream is offline or unavailable', 'error');
                        watchOverlay.style.display = 'none';
                        const spinner = document.getElementById('loadingSpinner');
                        if (spinner) spinner.style.display = 'none';
                    }
                };
            }
        };

        // ═══════════════════════════════════════════════════════
        // ── Button Event Listeners ───────────────────────────
        // ═══════════════════════════════════════════════════════

        // Go Live
        if (goLiveBtn) goLiveBtn.addEventListener('click', startLive);

        // Stop Live
        if (stopLiveBtn) stopLiveBtn.addEventListener('click', async () => {
            if (confirm('End your live stream?')) {
                await apiRequest('/live/end', { method: 'POST' }).catch(() => {});
                handleStreamEnded();
            }
        });

        // Exit Live (both broadcaster and viewer)
        if (exitLiveBtn) exitLiveBtn.addEventListener('click', () => {
            if (isBroadcaster) {
                if (confirm('Stop broadcasting?')) {
                    apiRequest('/live/end', { method: 'POST' }).catch(() => {});
                    handleStreamEnded();
                }
            } else {
                if (socket) socket.emit('leave_live');
                handleStreamEnded();
            }
        });

        // Toggle Microphone
        if (toggleMicBtn) toggleMicBtn.addEventListener('click', () => {
            if (!localStream) return;
            micEnabled = !micEnabled;
            localStream.getAudioTracks().forEach(t => { t.enabled = micEnabled; });
            toggleMicBtn.innerHTML = micEnabled
                ? '<i class="bi bi-mic-fill"></i>'
                : '<i class="bi bi-mic-mute-fill"></i>';
            toggleMicBtn.classList.toggle('disabled', !micEnabled);
            showToast(micEnabled ? 'Mic unmuted' : 'Mic muted', 'info');
        });

        // Toggle Camera
        if (toggleCamBtn) toggleCamBtn.addEventListener('click', () => {
            if (!localStream) return;
            camEnabled = !camEnabled;
            localStream.getVideoTracks().forEach(t => { t.enabled = camEnabled; });
            toggleCamBtn.innerHTML = camEnabled
                ? '<i class="bi bi-camera-video-fill"></i>'
                : '<i class="bi bi-camera-video-off-fill"></i>';
            toggleCamBtn.classList.toggle('disabled', !camEnabled);
            showToast(camEnabled ? 'Camera on' : 'Camera off', 'info');
        });

        // Send Chat Message
        sendMsgBtn?.addEventListener('click', () => {
            const msg = msgInput.value.trim();
            if (!msg || !socket || !currentStreamId) return;
            const user = getCurrentUser();
            socket.emit('send_live_chat', {
                streamId: currentStreamId,
                userId: user.id,
                username: user.username,
                message: msg
            });
            msgInput.value = '';
            appendComment(user.username, msg, true);
        });

        msgInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') sendMsgBtn.click();
        });

        // ═══════════════════════════════════════════════════════
        // ── Floating Reaction Emojis ─────────────────────────
        // ═══════════════════════════════════════════════════════
        function spawnFloatingEmoji(emoji) {
            const container = document.getElementById('floatingReactions');
            if (!container) return;
            const el = document.createElement('div');
            el.textContent = emoji;
            el.style.cssText = `position:absolute;bottom:0;right:${Math.random()*60+20}px;font-size:28px;
                transition:all 2.5s ease-out;opacity:1;pointer-events:none;`;
            container.appendChild(el);
            setTimeout(() => {
                el.style.transform = `translateY(-300px) scale(2) rotate(${Math.random()*60-30}deg)`;
                el.style.opacity = '0';
            }, 50);
            setTimeout(() => el.remove(), 2600);
        }

        window.Blink.sendReaction = (emoji) => {
            if (!socket || !currentStreamId) return;
            socket.emit('send_reaction', { streamId: currentStreamId, emoji });
            spawnFloatingEmoji(emoji);
        };

        // ═══════════════════════════════════════════════════════
        // ── Live Discovery Grid ──────────────────────────────
        // ═══════════════════════════════════════════════════════
        async function loadDiscovery() {
            try {
                const data = await apiRequest('/live/now');
                if (!streamsGrid) return;
                const streams = data.streams || [];
                if (streams.length) {
                    streamsGrid.innerHTML = streams.map(s => `
                        <div class="live-card" onclick="window.Blink.watchStream('${s.stream_id}')">
                            <div class="live-card-hero">
                                <img src="${s.profile_picture || `https://i.pravatar.cc/150?u=${s.user_id}`}" 
                                     onerror="this.src='/favicon.png'" alt="${s.username}">
                                <div class="live-badge-mini">LIVE</div>
                                <div class="viewer-count-tag"><i class="bi bi-eye-fill"></i> ${s.viewer_count || 0}</div>
                            </div>
                            <div class="live-card-info">
                                <div class="live-card-user">
                                    <div class="user-name">@${s.username}</div>
                                    <div class="stream-title">${s.stream_title || 'Live Stream'}</div>
                                </div>
                                <button class="watch-now-btn" onclick="event.stopPropagation(); window.Blink.watchStream('${s.stream_id}')">Watch</button>
                            </div>
                        </div>
                    `).join('');
                } else {
                    streamsGrid.innerHTML = `
                        <div class="no-live-placeholder">
                            <div class="pulse-icon"><i class="bi bi-broadcast"></i></div>
                            <p style="color:#888;font-size:15px">No creators are currently live.</p>
                            <p style="color:#555;font-size:13px;margin-top:8px">Be the first to go live!</p>
                        </div>
                    `;
                }
            } catch (e) { dbg('Discovery fail:', e); }
        }

        // Initial load + polling
        loadDiscovery();
        setInterval(() => { if (!isBroadcaster && !currentStreamId) loadDiscovery(); }, 8000);

        // Auto-join if ?id= in URL
        const urlParams = new URLSearchParams(window.location.search);
        const autoJoinId = urlParams.get('id');
        if (autoJoinId) {
            dbg('Auto-joining stream:', autoJoinId);
            setTimeout(() => window.Blink.watchStream(autoJoinId), 600);
        }
    });

    // ── Injected Styles (live cards) ─────────────────────────
    const style = document.createElement('style');
    style.textContent = `
        .live-card { background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 16px; overflow: hidden; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); cursor: pointer; }
        .live-card:hover { transform: translateY(-4px); background: rgba(255, 255, 255, 0.06); border-color: var(--pink); box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
        .live-card-hero { position: relative; aspect-ratio: 16/10; background: #111; overflow: hidden; }
        .live-card-hero img { width: 100%; height: 100%; object-fit: cover; filter: brightness(0.8); transition: filter 0.3s; }
        .live-card:hover .live-card-hero img { filter: brightness(1); }
        .live-badge-mini { position: absolute; top: 12px; left: 12px; background: var(--pink); color: #fff; font-size: 10px; font-weight: 900; padding: 3px 10px; border-radius: 6px; text-transform: uppercase; letter-spacing: 1px; box-shadow: 0 0 12px rgba(255,45,110,0.4); }
        .viewer-count-tag { position: absolute; top: 12px; right: 12px; background: rgba(0,0,0,0.6); backdrop-filter: blur(4px); color: #fff; font-size: 11px; padding: 3px 10px; border-radius: 6px; display: flex; align-items: center; gap: 4px; }
        .live-card-info { padding: 14px; display: flex; align-items: center; justify-content: space-between; }
        .user-name { font-weight: 800; color: var(--pink); font-size: 14px; }
        .stream-title { color: #888; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 140px; margin-top: 2px; }
        .watch-now-btn { background: var(--pink); color: #fff; border: none; padding: 8px 18px; border-radius: 10px; font-weight: 700; font-size: 12px; cursor: pointer; transition: all 0.2s; box-shadow: 0 4px 12px rgba(255,45,110,0.3); }
        .watch-now-btn:hover { transform: scale(1.05); box-shadow: 0 6px 20px rgba(255,45,110,0.4); }
        .no-live-placeholder { grid-column: 1 / -1; text-align: center; padding: 60px 20px; }
        .pulse-icon { font-size: 52px; margin-bottom: 20px; color: #444; animation: pulse-broadcast 2s infinite; }
        @keyframes pulse-broadcast { 0% { transform: scale(1); opacity: 0.5; } 50% { transform: scale(1.1); opacity: 1; color: var(--pink); } 100% { transform: scale(1); opacity: 0.5; } }
        
        #remoteVideo { width: 100%; height: 100%; object-fit: cover; max-height: 100vh; background: #000; }
    `;
    document.head.appendChild(style);
})();
