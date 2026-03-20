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
        const emojiBtn      = document.getElementById('emojiBtn');
        const emojiPicker   = document.getElementById('emojiPicker');
        const exitLiveBtn   = document.getElementById('exitLiveBtn');

        // --- Internal State ---
        let localStream     = null;
        let isBroadcaster   = false;
        let currentStreamId = null;
        let socket          = null;
        let peerConnections = {}; 
        let peerConnection  = null; 
        let streamEnded     = false;
        let pendingIce      = []; 
        const rtcConfig     = { 
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
        
        let pendingIceBroadcaster = {}; // { socketId: [candidates] }

        // --- WebRTC Logic (Signaling & Peer Management) ---
        let signalQueue = []; // For when we get a signal before pc is ready

        async function initiatePeerConnection(viewerSocketId) {
            dbg('Initiating PeerConnection to viewer:', viewerSocketId);
            if (peerConnections[viewerSocketId]) {
                dbg('Closing existing PC for', viewerSocketId);
                peerConnections[viewerSocketId].close();
            }
            
            const pc = new RTCPeerConnection(rtcConfig);
            peerConnections[viewerSocketId] = pc;
            
            if (localStream) {
                localStream.getTracks().forEach(track => {
                    dbg('Adding track to PC:', track.kind);
                    pc.addTrack(track, localStream);
                });
            }

            pc.onicecandidate = (event) => {
                if (event.candidate) {
                    socket.emit('ice-candidate', { to: viewerSocketId, candidate: event.candidate });
                }
            };

            pc.onconnectionstatechange = () => dbg(`PC State [${viewerSocketId}]:`, pc.connectionState);

            try {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                dbg('Offer sent to viewer:', viewerSocketId);
                socket.emit('offer', { to: viewerSocketId, offer });
            } catch (err) {
                dbg('PC createOffer error:', err.message);
            }
        }

        async function handleOffer(from, offer) {
            dbg('Offer received from broadcaster:', from);
            if (peerConnection) peerConnection.close();
            peerConnection = new RTCPeerConnection(rtcConfig);
            
            peerConnection.onicecandidate = (e) => {
                if (e.candidate) {
                    socket.emit('ice-candidate', { to: from, candidate: e.candidate });
                }
            };

            peerConnection.ontrack = (e) => {
                dbg('Remote track received:', e.streams[0]?.id);
                if (video && e.streams[0]) {
                    if (video.srcObject !== e.streams[0]) {
                        dbg('Attaching remote stream to video element');
                        video.srcObject = e.streams[0];
                    }
                    video.onloadedmetadata = () => {
                         dbg('Remote metadata loaded, attempting play');
                         video.play().catch(pErr => dbg('Auto-play blocked, interaction required'));
                    };
                }
            };

            peerConnection.onconnectionstatechange = () => dbg('Viewer PC state:', peerConnection.connectionState);

            try {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
                const answer = await peerConnection.createAnswer();
                await peerConnection.setLocalDescription(answer);
                dbg('Answer sent to broadcaster');
                socket.emit('answer', { to: from, answer });

                // Process any ICE candidates that arrived before the offer
                if (pendingIce.length > 0) {
                    dbg('Relaying', pendingIce.length, 'queued ICE candidates');
                    for (const cand of pendingIce) {
                        await peerConnection.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
                    }
                    pendingIce = [];
                }
            } catch (err) {
                dbg('handleOffer error:', err.message);
            }
        }

        // --- Socket ---
        function initSocket(streamId, role) {
            if (socket) socket.disconnect();
            socket = io();
            const user = getCurrentUser();
            socket.emit('join_live', { streamId, userId: user.id, username: user.username, role });

            socket.on('viewer_update', ({ count }) => { if (viewCount) viewCount.textContent = count; });
            
            socket.on('user_joined', async (data) => {
                dbg('User joined:', data.username, 'Role:', data.role);
                // If I am broadcaster and a viewer joined, send them an offer
                if (isBroadcaster && data.role === 'viewer' && localStream) {
                    await initiatePeerConnection(data.socketId);
                }
                // If I am viewer and a broadcaster joined, ask for an offer
                if (!isBroadcaster && data.role === 'broadcaster') {
                    dbg('Broadcaster detected, requesting offer...');
                    socket.emit('request_offer', { to: data.socketId });
                }
            });

            socket.on('request_offer', async (data) => {
                if (isBroadcaster && localStream) {
                    dbg('Offer requested by:', data.from);
                    await initiatePeerConnection(data.from);
                }
            });

            socket.on('offer', async (data) => { 
                if (!isBroadcaster) {
                    await handleOffer(data.from, data.offer); 
                }
            });

            socket.on('answer', async (data) => {
                dbg('[Live] Answer received from viewer');
                const pc = peerConnections[data.from];
                if (isBroadcaster && pc) {
                    await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
                    if (pendingIceBroadcaster[data.from]) {
                        for (const cand of pendingIceBroadcaster[data.from]) {
                            await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(e => {});
                        }
                        delete pendingIceBroadcaster[data.from];
                    }
                }
            });

            socket.on('ice-candidate', async (data) => {
                const pc = isBroadcaster ? peerConnections[data.from] : peerConnection;
                if (pc && pc.remoteDescription) {
                    await pc.addIceCandidate(new RTCIceCandidate(data.candidate)).catch(e => {});
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
            div.style.padding = '4px 8px';
            div.style.marginBottom = '4px';
            div.style.borderRadius = '4px';
            div.style.background = isSelf ? 'rgba(230,0,35,0.1)' : 'rgba(255,255,255,0.05)';
            div.innerHTML = `<strong style="color:${isSelf ? '#ff2d55':'#aaa'}">${username}:</strong> ${message}`;
            commentsEl.appendChild(div);
            commentsEl.scrollTop = commentsEl.scrollHeight;
        }

        function handleStreamEnded() {
            dbg('Stream ended');
            streamEnded = true;
            if (localStream) {
                localStream.getTracks().forEach(t => t.stop());
                localStream = null;
            }
            if (peerConnection) {
                peerConnection.close();
                peerConnection = null;
            }
            Object.values(peerConnections).forEach(pc => pc.close());
            peerConnections = {};
            if (socket) {
                socket.disconnect();
                socket = null;
            }
            if (video) { video.srcObject = null; }
            if (liveBadge) {
                liveBadge.textContent = 'ENDED';
                liveBadge.style.background = '#666';
                liveBadge.style.animation = 'none';
            }
            showToast('Live Stream Ended', 'info');
            setTimeout(() => window.location.href = '/pages/index.html', 1500);
        }

        async function startLive() {
            dbg('startLive called');
            try {
                localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                if (video) {
                    video.srcObject = localStream;
                    video.muted = true;
                    video.play().catch(e => {});
                }
                const user = getCurrentUser();
                const res = await apiRequest('/live/start', { method: 'POST', body: JSON.stringify({ title: `${user.username}'s stream` }) });
                currentStreamId = res.stream_id;
                isBroadcaster = true;
                if (liveBadge) { liveBadge.style.display = 'inline-flex'; }
                if (discoveryEl) discoveryEl.style.display = 'none';
                if (chatAreaEl) chatAreaEl.style.display = 'flex';
                if (stopLiveBtn) stopLiveBtn.style.display = 'block';
                initSocket(currentStreamId, 'broadcaster');
                showToast('You are LIVE!', 'success');
            } catch (err) {
                dbg('startLive fail', err);
                showToast('Camera access denied. Enable HTTPS and Permissions.', 'error');
            }
        }

        window.Blink.sendReaction = (emoji) => {
            if (!socket || !currentStreamId) return;
            socket.emit('send_reaction', { streamId: currentStreamId, emoji });
            spawnFloatingEmoji(emoji);
        };

        function spawnFloatingEmoji(emoji) {
            const container = document.getElementById('floatingReactions');
            if (!container) return;
            const el = document.createElement('div');
            el.textContent = emoji;
            el.style.position = 'absolute';
            el.style.bottom = '0';
            el.style.right = Math.random() * 80 + 'px';
            el.style.fontSize = '24px';
            el.style.transition = 'all 2s ease-out';
            el.style.opacity = '1';
            container.appendChild(el);
            setTimeout(() => {
                el.style.transform = `translateY(-200px) scale(1.5) rotate(${Math.random()*40-20}deg)`;
                el.style.opacity = '0';
            }, 50);
            setTimeout(() => el.remove(), 2000);
        }

        const watchOverlay = document.getElementById('watchOverlay');
        if (watchOverlay) watchOverlay.style.display = 'none';

        window.Blink.watchStream = async (streamId) => {
            dbg('[Live] watchStream requested for:', streamId);
            if (watchOverlay) {
                watchOverlay.style.display = 'flex';
                // Attach a one-time click handler to the overlay to prime the video
                watchOverlay.onclick = async () => {
                    try {
                        if (video) {
                            video.muted = false;
                            await video.play().catch(e => dbg('[Live] Priming player...'));
                        }
                        watchOverlay.style.display = 'none';
                        // Immediately show chat/video grid to provide feedback
                        if (discoveryEl) discoveryEl.style.display = 'none';
                        if (chatAreaEl) chatAreaEl.style.display = 'flex';
                        if (watchingInfo) watchingInfo.style.display = 'block';

                        const data = await apiRequest(`/live/${streamId}`);
                        currentStreamId = streamId;
                        isBroadcaster = false;
                        if (watchingUserEl) watchingUserEl.textContent = data.stream.username;
                        dbg('[Live] Initializing signaling...');
                        initSocket(streamId, 'viewer');
                        // Notify anyone already there that I've joined and need an offer
                        setTimeout(() => { if (socket) socket.emit('request_offer', { isInitial: true }); }, 1000);
                    } catch (err) { 
                        dbg('[Live] watchStream failed:', err.message);
                        showToast('Stream is offline or failed', 'error'); 
                        watchOverlay.style.display = 'none';
                    }
                };
            }
        };

        if (goLiveBtn) goLiveBtn.addEventListener('click', startLive);
        if (stopLiveBtn) stopLiveBtn.addEventListener('click', async () => {
             await apiRequest('/live/end', { method: 'POST' });
             handleStreamEnded();
        });
        if (exitLiveBtn) exitLiveBtn.addEventListener('click', async () => {
             if (isBroadcaster) await apiRequest('/live/end', { method: 'POST' });
             handleStreamEnded();
        });

        sendMsgBtn?.addEventListener('click', () => {
            const msg = msgInput.value.trim();
            if (!msg || !socket || !currentStreamId) return;
            const user = getCurrentUser();
            socket.emit('send_live_chat', { streamId: currentStreamId, userId: user.id, username: user.username, message: msg });
            msgInput.value = '';
            appendComment(user.username, msg, true);
        });

        // --- Multi-User Discovery ---
        let discoveryInterval = null;

        async function loadDiscovery() {
            try {
                const data = await apiRequest('/live/now');
                if (!streamsGrid) return;
                const streams = data.streams || [];
                if (streams.length) {
                    streamsGrid.innerHTML = streams.map(s => `
                        <div class="live-card" 
                             onclick="if(window.Blink && window.Blink.watchStream) window.Blink.watchStream('${s.stream_id}')" 
                             style="cursor:pointer; background:rgba(255,45,110,0.05); border:1px solid rgba(255,45,110,0.1); padding:15px; border-radius:12px; transition:all 0.2s ease; position:relative;">
                            <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
                                <img src="${s.profile_picture || `https://i.pravatar.cc/100?u=${s.user_id}`}" 
                                     style="width:36px;height:36px;border-radius:50%;border:2px solid var(--pink);object-fit:cover;" 
                                     onerror="this.src='/favicon.png'">
                                <div>
                                    <div style="font-weight:900; color:var(--pink);">@${s.username}</div>
                                    <div style="font-size:11px; color:var(--text-muted);">${s.viewer_count || 0} viewers</div>
                                </div>
                            </div>
                            <button type="button" 
                                    onclick="event.stopPropagation(); if(window.Blink && window.Blink.watchStream) window.Blink.watchStream('${s.stream_id}')"
                                    style="width:100%;padding:8px;background:var(--pink);color:#fff;border:none;border-radius:8px;font-weight:700;font-size:12px;cursor:pointer;">
                                <i class="bi bi-play-fill"></i> Watch Stream
                            </button>
                        </div>
                    `).join('');
                } else {
                    streamsGrid.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:var(--text-muted); padding:20px;"><i class="bi bi-broadcast" style="font-size:32px;display:block;margin-bottom:8px;"></i>No one is live right now</div>';
                }
            } catch (e) {
                dbg('[Live] Discovery fetch error:', e.message);
            }
        }
        loadDiscovery();

        // Auto-refresh discovery every 10 seconds
        discoveryInterval = setInterval(() => {
            if (!isBroadcaster && !currentStreamId) loadDiscovery();
        }, 10000);

        // --- Automatic Join from URL ---
        const urlParams = new URLSearchParams(window.location.search);
        const autoStreamId = urlParams.get('id');
        if (autoStreamId) {
             dbg('[Live] Auto-joining stream:', autoStreamId);
             setTimeout(() => window.Blink.watchStream(autoStreamId), 500);
        }
    });
})();
