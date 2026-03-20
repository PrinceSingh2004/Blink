console.log('[Live] Script loaded - starting initialization');

// Wrap everything to avoid global namespace pollution
(function() {
    document.addEventListener('DOMContentLoaded', async () => {
        console.log('[Live] DOMContentLoaded fired');
        
        // Wait for window.Blink if it's not yet set by auth.js
        let attempts = 0;
        while (!window.Blink && attempts < 20) {
            console.log('[Live] waiting for window.Blink...');
            await new Promise(r => setTimeout(r, 50));
            attempts++;
        }

        if (!window.Blink) {
            console.error('[Live] window.Blink not found after waiting. Auth.js might have failed.');
            return;
        }

        const { getToken, getUser, requireAuth, apiRequest, showToast, populateSidebar } = window.Blink;
        
        if (!requireAuth()) {
            console.warn('[Live] requireAuth failed, stopping.');
            return;
        }

        console.log('[Live] Auth verified, initializing UI...');

        try {
            populateSidebar();
        } catch (e) { console.warn('[Live] Sidebar failed', e); }

        // --- Selectors ---
        const video         = document.getElementById('livePreview');
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

        // --- Internal State ---
        let localStream     = null;
        let isBroadcaster   = false;
        let currentStreamId = null;
        let socket          = null;
        let peerConnections = {}; // Broadcaster: { viewerSocketId: RTCPeerConnection }
        let viewerPc        = null; // Viewer: current connection to broadcaster
        let streamEnded     = false;
        let pendingIce      = []; // For viewer
        let pendingIceBroadcaster = {}; // { viewerSocketId: [candidates] }
        
        // Recording State
        let mediaRecorder = null;
        let recordedChunks = [];

        // Robust RTC Config with several STUN servers
        const rtcConfig = { 
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' },
                { urls: 'stun:stun3.l.google.com:19302' },
                { urls: 'stun:stun4.l.google.com:19302' },
                { urls: 'stun:stun.l.google.com:19305' },
                { urls: 'stun:stun.services.mozilla.com' }
            ],
            iceCandidatePoolSize: 10
        };

        const dbg = (...args) => console.log('[Live]', ...args);
        const getCurrentUser = () => getUser() || {};

        // --- WebRTC Logic (Broadcaster Side) ---
        async function initiateBroadcasterPc(viewerSocketId) {
            dbg('Initiating PC for viewer:', viewerSocketId);
            if (peerConnections[viewerSocketId]) {
                peerConnections[viewerSocketId].close();
            }
            
            const pc = new RTCPeerConnection(rtcConfig);
            peerConnections[viewerSocketId] = pc;
            
            if (localStream) {
                localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
            }

            pc.onicecandidate = (event) => {
                if (event.candidate) {
                    socket.emit('ice-candidate', { to: viewerSocketId, candidate: event.candidate });
                }
            };

            pc.onconnectionstatechange = () => {
                dbg(`Broadcaster PC State [${viewerSocketId}]:`, pc.connectionState);
                if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
                    delete peerConnections[viewerSocketId];
                }
            };

            try {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                socket.emit('offer', { to: viewerSocketId, offer });
                dbg('Offer sent to viewer:', viewerSocketId);
            } catch (err) {
                dbg('Error creating offer:', err);
            }
        }

        // --- WebRTC Logic (Viewer Side) ---
        async function handleOffer(broadcasterSocketId, offer) {
            dbg('Offer received from broadcaster:', broadcasterSocketId);
            if (viewerPc) viewerPc.close();
            
            viewerPc = new RTCPeerConnection(rtcConfig);
            
            viewerPc.onicecandidate = (e) => {
                if (e.candidate) {
                    socket.emit('ice-candidate', { to: broadcasterSocketId, candidate: e.candidate });
                }
            };

            viewerPc.ontrack = (event) => {
                dbg('Remote track received:', event.streams[0]?.id);
                if (video && event.streams[0]) {
                    video.srcObject = event.streams[0];
                    video.muted = false; 
                    video.onloadedmetadata = () => {
                        dbg('Remote metadata loaded, playing...');
                        video.play().catch(err => {
                            dbg('Autoplay blocked, user interaction required');
                            if (watchOverlay) watchOverlay.style.display = 'flex';
                        });
                    };
                }
            };

            viewerPc.onconnectionstatechange = () => dbg('Viewer PC State:', viewerPc.connectionState);

            try {
                await viewerPc.setRemoteDescription(new RTCSessionDescription(offer));
                const answer = await viewerPc.createAnswer();
                await viewerPc.setLocalDescription(answer);
                socket.emit('answer', { to: broadcasterSocketId, answer });
                dbg('Answer sent back to broadcaster');

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

        // --- Socket ---
        function initSocket(streamId, role) {
            if (socket) socket.disconnect();
            socket = io();
            const user = getCurrentUser();
            
            socket.emit('join_live', { streamId, userId: user.id, username: user.username, role });

            socket.on('viewer_update', ({ count }) => { 
                if (viewCount) viewCount.textContent = count; 
            });
            
            socket.on('user_joined', async (data) => {
                dbg('User joined:', data.username, 'Role:', data.role, 'SocketID:', data.socketId);
                if (isBroadcaster && data.role === 'viewer' && localStream) {
                    await initiateBroadcasterPc(data.socketId);
                }
            });

            socket.on('request_offer', async (data) => {
                if (isBroadcaster && localStream) {
                    dbg('Offer requested by:', data.from);
                    await initiateBroadcasterPc(data.from);
                }
            });

            socket.on('offer', async (data) => { 
                if (!isBroadcaster) {
                    await handleOffer(data.from, data.offer); 
                }
            });

            socket.on('answer', async (data) => {
                dbg('Answer received from:', data.from);
                const pc = peerConnections[data.from];
                if (isBroadcaster && pc) {
                    await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
                    if (pendingIceBroadcaster[data.from]) {
                        for (const cand of pendingIceBroadcaster[data.from]) {
                            await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
                        }
                        delete pendingIceBroadcaster[data.from];
                    }
                }
            });

            socket.on('ice-candidate', async (data) => {
                const pc = isBroadcaster ? peerConnections[data.from] : viewerPc;
                if (pc && pc.remoteDescription) {
                    await pc.addIceCandidate(new RTCIceCandidate(data.candidate)).catch(() => {});
                } else {
                    if (isBroadcaster) {
                        if (!pendingIceBroadcaster[data.from]) pendingIceBroadcaster[data.from] = [];
                        pendingIceBroadcaster[data.from].push(data.candidate);
                    } else {
                        pendingIce.push(data.candidate);
                    }
                }
            });

            socket.on('receive_reaction', ({ emoji }) => spawnFloatingEmoji(emoji));
            socket.on('receive_live_chat', (data) => appendComment(data.username, data.message, data.username === user.username));
            socket.on('live_ended', () => handleStreamEnded());
            socket.on('live_discovery_update', () => {
                if (!isBroadcaster && !currentStreamId) loadDiscovery();
            });
        }

        // --- UI & Controls ---
        function appendComment(username, message, isSelf) {
            if (!commentsEl) return;
            const div = document.createElement('div');
            div.className = 'chat-message';
            div.style.padding = '8px 12px';
            div.style.marginBottom = '6px';
            div.style.borderRadius = '12px';
            div.style.background = isSelf ? 'rgba(255,45,110,0.15)' : 'rgba(255,255,255,0.08)';
            div.style.fontSize = '13px';
            div.style.border = isSelf ? '1px solid rgba(255,45,110,0.2)' : '1px solid rgba(255,255,255,0.1)';
            div.innerHTML = `<strong style="color:${isSelf ? 'var(--pink)':'#eee'}; font-weight:700;">@${username}:</strong> <span style="color:#fff;">${message}</span>`;
            commentsEl.appendChild(div);
            commentsEl.scrollTop = commentsEl.scrollHeight;
        }

        function handleStreamEnded() {
            dbg('Stream ended');
            streamEnded = true;
            
            // Stop recording if broadcaster
            if (isBroadcaster && mediaRecorder && mediaRecorder.state !== 'inactive') {
                mediaRecorder.stop();
            }

            if (localStream) {
                localStream.getTracks().forEach(t => t.stop());
                localStream = null;
            }
            if (viewerPc) {
                viewerPc.close();
                viewerPc = null;
            }
            Object.values(peerConnections).forEach(pc => pc.close());
            peerConnections = {};
            if (socket) {
                socket.disconnect();
                socket = null;
            }
            if (video) video.srcObject = null;
            if (liveBadge) {
                liveBadge.textContent = 'ENDED';
                liveBadge.style.background = '#444';
                liveBadge.style.animation = 'none';
            }
            showToast('Live Stream Ended', 'info');
            setTimeout(() => window.location.href = '/pages/index.html', 2000);
        }

        async function startLive() {
            dbg('startLive initiating...');
            try {
                localStream = await navigator.mediaDevices.getUserMedia({ 
                    video: { width: 1280, height: 720, frameRate: 30 }, 
                    audio: true 
                });
                
                // --- Recording Logic ---
                recordedChunks = [];
                mediaRecorder = new MediaRecorder(localStream, { mimeType: 'video/webm' });
                mediaRecorder.ondataavailable = (event) => { if (event.data.size > 0) recordedChunks.push(event.data); };
                mediaRecorder.onstop = async () => {
                    const blob = new Blob(recordedChunks, { type: 'video/webm' });
                    const formData = new FormData();
                    formData.append('video', blob, `live_archive_${Date.now()}.webm`);
                    formData.append('caption', `Live Archive: ${new Date().toLocaleString()}`);
                    
                    try {
                        const res = await fetch('/api/videos', {
                            method: 'POST',
                            headers: { 'Authorization': `Bearer ${getToken()}` },
                            body: formData
                        });
                        const data = await res.json();
                        if (data.video) showToast('Live archive saved!', 'success');
                    } catch (e) { console.error('Archive failed', e); }
                };
                mediaRecorder.start(2000); // 2sec chunks
                
                if (video) {
                    video.srcObject = localStream;
                    video.muted = true; 
                    video.play().catch(() => {});
                }
                const user = getCurrentUser();
                const res = await apiRequest('/live/start', { 
                    method: 'POST', 
                    body: JSON.stringify({ title: `${user.username}'s Live Blink` }) 
                });
                currentStreamId = res.stream_id;
                isBroadcaster = true;
                
                if (liveBadge) liveBadge.style.display = 'inline-flex';
                if (discoveryEl) discoveryEl.style.display = 'none';
                if (chatAreaEl) chatAreaEl.style.display = 'flex';
                if (stopLiveBtn) stopLiveBtn.style.display = 'block';
                if (goLiveBtn) goLiveBtn.style.display = 'none';
                
                initSocket(currentStreamId, 'broadcaster');
                showToast('You are LIVE!', 'success');
                dbg('Live started with ID:', currentStreamId);
            } catch (err) {
                dbg('startLive error:', err);
                showToast('Camera access denied.', 'error');
            }
        }

        window.Blink.watchStream = async (streamId) => {
            dbg('watchStream requested ID:', streamId);
            if (!streamId) return;
            
            if (watchOverlay) {
                watchOverlay.style.display = 'flex';
                watchOverlay.onclick = async () => {
                    try {
                        watchOverlay.style.display = 'none';
                        if (discoveryEl) discoveryEl.style.display = 'none';
                        if (chatAreaEl) chatAreaEl.style.display = 'flex';
                        if (watchingInfo) watchingInfo.style.display = 'block';
                        
                        if (video) {
                            video.muted = false;
                            await video.play().catch(() => dbg('Priming player...'));
                        }

                        const data = await apiRequest(`/live/${streamId}`);
                        currentStreamId = streamId;
                        isBroadcaster = false;
                        if (watchingUserEl) watchingUserEl.textContent = data.stream.username;
                        
                        initSocket(streamId, 'viewer');
                        
                        setTimeout(() => {
                            if (socket) {
                                dbg('Requesting offer...');
                                socket.emit('request_offer', { streamId: currentStreamId });
                            }
                        }, 800);
                    } catch (err) {
                        dbg('watchStream setup error:', err);
                        showToast('Stream is offline', 'error');
                        watchOverlay.style.display = 'none';
                    }
                };
            }
        };

        if (goLiveBtn) goLiveBtn.addEventListener('click', startLive);
        if (stopLiveBtn) stopLiveBtn.addEventListener('click', async () => {
             if (confirm('End live stream?')) {
                 await apiRequest('/live/end', { method: 'POST' }).catch(() => {});
                 handleStreamEnded();
             }
        });
        if (exitLiveBtn) exitLiveBtn.addEventListener('click', () => {
             if (isBroadcaster) {
                 if (confirm('Stop broadcasting?')) {
                     apiRequest('/live/end', { method: 'POST' }).catch(() => {});
                     handleStreamEnded();
                 }
             } else {
                 handleStreamEnded();
             }
        });

        sendMsgBtn?.addEventListener('click', () => {
            const msg = msgInput.value.trim();
            if (!msg || !socket || !currentStreamId) return;
            const user = getCurrentUser();
            socket.emit('send_live_chat', { streamId: currentStreamId, userId: user.id, username: user.username, message: msg });
            msgInput.value = '';
            appendComment(user.username, msg, true);
        });

        msgInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') sendMsgBtn.click();
        });

        function spawnFloatingEmoji(emoji) {
            const container = document.getElementById('floatingReactions');
            if (!container) return;
            const el = document.createElement('div');
            el.textContent = emoji;
            el.style.position = 'absolute';
            el.style.bottom = '0';
            el.style.right = (Math.random() * 60 + 20) + 'px';
            el.style.fontSize = '28px';
            el.style.transition = 'all 2.5s ease-out';
            el.style.opacity = '1';
            el.style.pointerEvents = 'none';
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

        // --- Discovery ---
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
                                     onerror="this.src='/favicon.png'">
                                <div class="live-badge-mini">LIVE</div>
                                <div class="viewer-count-tag"><i class="bi bi-eye-fill"></i> ${s.viewer_count || 0}</div>
                            </div>
                            <div class="live-card-info">
                                <div class="live-card-user">
                                    <div class="user-name">@${s.username}</div>
                                    <div class="stream-title">${s.stream_title || 'Live Stream'}</div>
                                </div>
                                <button class="watch-now-btn">Watch</button>
                            </div>
                        </div>
                    `).join('');
                } else {
                    streamsGrid.innerHTML = `
                        <div class="no-live-placeholder">
                            <div class="pulse-icon"><i class="bi bi-broadcast"></i></div>
                            <p>No creators are currently live.</p>
                        </div>
                    `;
                }
            } catch (e) { dbg('Discovery fail:', e); }
        }
        loadDiscovery();
        setInterval(() => { if (!isBroadcaster && !currentStreamId) loadDiscovery(); }, 8000);

        const urlParams = new URLSearchParams(window.location.search);
        const autoJoinId = urlParams.get('id');
        if (autoJoinId) {
            dbg('Auto-joining stream:', autoJoinId);
            setTimeout(() => window.Blink.watchStream(autoJoinId), 600);
        }
    });

    const style = document.createElement('style');
    style.textContent = `
        .live-card { background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 16px; overflow: hidden; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); cursor: pointer; }
        .live-card:hover { transform: translateY(-4px); background: rgba(255, 255, 255, 0.06); border-color: var(--pink); box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
        .live-card-hero { position: relative; aspect-ratio: 16/10; background: #111; }
        .live-card-hero img { width: 100%; height: 100%; object-fit: cover; filter: brightness(0.8); }
        .live-badge-mini { position: absolute; top: 12px; left: 12px; background: var(--pink); color: #fff; font-size: 10px; font-weight: 900; padding: 2px 8px; border-radius: 4px; }
        .viewer-count-tag { position: absolute; top: 12px; right: 12px; background: rgba(0,0,0,0.6); backdrop-filter: blur(4px); color: #fff; font-size: 10px; padding: 2px 8px; border-radius: 4px; }
        .live-card-info { padding: 12px; display: flex; align-items: center; justify-content: space-between; }
        .user-name { font-weight: 800; color: var(--pink); font-size: 13px; }
        .stream-title { color: #aaa; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 120px; }
        .watch-now-btn { background: var(--pink); color: #fff; border: none; padding: 6px 14px; border-radius: 8px; font-weight: 700; font-size: 11px; cursor: pointer; }
        .no-live-placeholder { grid-column: 1 / -1; text-align: center; padding: 60px 20px; color: #666; }
        .pulse-icon { font-size: 48px; margin-bottom: 20px; animation: pulse-broadcast 2s infinite; }
        @keyframes pulse-broadcast { 0% { transform: scale(1); opacity: 0.5; } 50% { transform: scale(1.1); opacity: 1; color: var(--pink); } 100% { transform: scale(1); opacity: 0.5; } }
        #watchOverlay { backdrop-filter: blur(20px); background: rgba(0,0,0,0.8); }
    `;
    document.head.appendChild(style);
})();
