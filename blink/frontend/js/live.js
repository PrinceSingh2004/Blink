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
        const rtcConfig     = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
        const dbg = (...args) => console.log('[Live]', ...args);
        const getCurrentUser = () => getUser() || {};

        // --- WebRTC Helpers ---
        let pendingIceBroadcaster = {}; // { socketId: [candidates] }

        async function initiatePeerConnection(viewerSocketId) {
            dbg('initiatePeerConnection to', viewerSocketId);
            if (peerConnections[viewerSocketId]) peerConnections[viewerSocketId].close();
            const pc = new RTCPeerConnection(rtcConfig);
            peerConnections[viewerSocketId] = pc;
            
            if (localStream) {
                localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
                dbg('Tracks added to peer connection');
            }

            pc.onicecandidate = (event) => {
                if (event.candidate) {
                    dbg('ICE candidate found for viewer', viewerSocketId);
                    socket.emit('ice-candidate', { to: viewerSocketId, candidate: event.candidate });
                }
            };

            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            dbg('[Live] Offer sent to viewer', viewerSocketId);
            socket.emit('offer', { to: viewerSocketId, offer });
        }

        async function handleOffer(from, offer) {
            dbg('[Live] Offer received from Broadcaster:', from);
            if (peerConnection) peerConnection.close();
            peerConnection = new RTCPeerConnection(rtcConfig);
            
            peerConnection.onicecandidate = (e) => {
                if (e.candidate) {
                    dbg('[Live] ICE candidate sent to Broadcaster');
                    socket.emit('ice-candidate', { to: from, candidate: e.candidate });
                }
            };

            peerConnection.ontrack = (e) => {
                dbg('[Live] Remote track received and attached');
                if (video) {
                    video.srcObject = e.streams[0];
                    video.muted = false; // Unmute for viewer
                    video.play().catch(err => {
                        dbg('[Live] Autoplay blocked, user interaction required:', err.message);
                        showToast('Click anywhere to start video', 'info');
                    });
                }
            };

            await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            dbg('[Live] Answer created and sent to Broadcaster');
            socket.emit('answer', { to: from, answer });

            // Process any ICE candidates that arrived before the offer
            if (pendingIce.length) {
                dbg('Processing', pendingIce.length, 'queued ICE candidates');
                for (const cand of pendingIce) await peerConnection.addIceCandidate(new RTCIceCandidate(cand)).catch(e => {});
                pendingIce = [];
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
                if (isBroadcaster && data.role === 'viewer' && localStream) {
                    await initiatePeerConnection(data.socketId);
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
                    // Process any ICE candidates queued for this specific PC
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
        }

        // --- UI ---
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
                liveBadge.style.display = 'inline-flex';
            }
            showToast('Live Stream Ended', 'info');
            setTimeout(() => window.location.href = '/index.html', 1500);
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
                if (discoveryEl) discoveryEl.style.display = 'none';
                if (chatAreaEl) chatAreaEl.style.display = 'flex';
                if (stopLiveBtn) stopLiveBtn.style.display = 'block';
                initSocket(currentStreamId, 'broadcaster');
                showToast('You are LIVE!', 'success');
            } catch (err) {
                dbg('startLive fail', err);
                showToast('Failed to start stream: ' + err.message, 'error');
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

        window.Blink.watchStream = async (streamId) => {
            dbg('[Live] watchStream requested for:', streamId);
            try {
                // Pre-play gesture to satisfy browser autoplay policy
                if (video) {
                    video.muted = false;
                    await video.play().catch(e => dbg('[Live] Play gesture initiated'));
                }

                const data = await apiRequest(`/live/${streamId}`);
                currentStreamId = streamId;
                isBroadcaster = false;
                if (discoveryEl) discoveryEl.style.display = 'none';
                if (chatAreaEl) chatAreaEl.style.display = 'flex';
                if (watchingInfo) watchingInfo.style.display = 'block';
                if (watchingUserEl) watchingUserEl.textContent = data.stream.username;
                
                dbg('[Live] Initializing viewer socket...');
                initSocket(streamId, 'viewer');
            } catch (err) { 
                dbg('[Live] watchStream failed:', err.message);
                showToast('Stream not found', 'error'); 
            }
        };

        // --- Listeners ---
        if (goLiveBtn) {
            console.log('[Live] Found goLiveBtn, attaching listener');
            goLiveBtn.addEventListener('click', startLive);
        } else {
            console.error('[Live] goLiveBtn NOT found in DOM');
        }

        if (stopLiveBtn) stopLiveBtn.addEventListener('click', async () => {
            await apiRequest('/live/end', { method: 'POST' });
            handleStreamEnded();
        });

        if (exitLiveBtn) exitLiveBtn.addEventListener('click', async () => {
            if (isBroadcaster) {
                await apiRequest('/live/end', { method: 'POST' });
            }
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

        // Discovery View
        async function loadDiscovery() {
            try {
                const data = await apiRequest('/live/now');
                if (!streamsGrid) return;
                streamsGrid.innerHTML = (data.streams || []).map(s => `
                    <div class="live-card" onclick="window.Blink.watchStream(${s.stream_id})" style="cursor:pointer;background:rgba(255,255,255,0.05);padding:10px;border-radius:8px">
                        <strong>@${s.username}</strong>
                    </div>
                `).join('') || 'No one is live.';
            } catch (e) {}
        }
        loadDiscovery();
    });
})();
