document.addEventListener('DOMContentLoaded', async () => {
    const { getToken, getUser, requireAuth, apiRequest, showToast, populateSidebar } = window.Blink;
    if (!requireAuth()) return;
    await populateSidebar();

    const video         = document.getElementById('livePreview');
    const goLiveBtn     = document.getElementById('goLiveBtn');
    const stopLiveBtn    = document.getElementById('stopLiveBtn');
    const discoveryEl   = document.getElementById('liveDiscovery');
    const streamsGrid   = document.getElementById('liveStreamsGrid');
    const chatAreaEl    = document.getElementById('liveChatArea');
    const commentsEl    = document.getElementById('liveComments');
    const msgInput      = document.getElementById('liveMsgInput');
    const sendMsgBtn    = document.getElementById('sendLiveMsgBtn');
    const viewCount     = document.getElementById('viewCount');
    const liveBadge     = document.getElementById('liveBadge');

    let localStream     = null;
    let isBroadcaster   = false;
    let currentStreamId = null;
    let socket          = null;
    let peerConnections = {}; // socketId -> RTCPeerConnection (Broadcaster side)
    let peerConnection  = null; // RTCPeerConnection (Viewer side)
    const user          = getUser();

    const rtcConfig = {
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    };

    // ── Socket.IO Initialization ──────────────────────────────
    function initSocket(streamId, role) {
        if (socket) socket.disconnect();
        socket = io();
        currentStreamId = streamId;

        socket.emit('join_live', { streamId, userId: user.id, username: user.username, role });

        socket.on('viewer_update', ({ count }) => {
            viewCount.textContent = count;
        });

        socket.on('receive_live_chat', (data) => {
            appendComment(data.username, data.message);
        });

        socket.on('receive_reaction', ({ emoji }) => {
            spawnFloatingEmoji(emoji);
        });

        socket.on('system_message', ({ message }) => {
            appendComment('System', message, true);
        });

        // ── WebRTC Signaling Listeners ────────────────────────
        socket.on('user_joined', async (data) => {
            if (isBroadcaster && data.role === 'viewer') {
                // I am the broadcaster, a new viewer joined. Let's initiate WebRTC.
                await initiatePeerConnection(data.socketId);
            }
        });

        socket.on('signal', async (data) => {
            // Received signaling data (offer, answer, or ice-candidate)
            const { from, signal } = data;

            if (isBroadcaster) {
                const pc = peerConnections[from];
                if (!pc) return;
                if (signal.type === 'answer') {
                    await pc.setRemoteDescription(new RTCSessionDescription(signal));
                } else if (signal.candidate) {
                    await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
                }
            } else {
                // I am the viewer
                if (signal.type === 'offer') {
                    await handleOffer(from, signal);
                } else if (signal.candidate) {
                    if (peerConnection) {
                        await peerConnection.addIceCandidate(new RTCIceCandidate(signal.candidate));
                    }
                }
            }
        });
    }

    // ── Broadcaster WebRTC Handlers ────────────────────────────
    async function initiatePeerConnection(viewerSocketId) {
        const pc = new RTCPeerConnection(rtcConfig);
        peerConnections[viewerSocketId] = pc;

        // Add local tracks to the connection
        localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

        // ICE Candidate handling
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('signal', { to: viewerSocketId, signal: { candidate: event.candidate } });
            }
        };

        // Create and send offer
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('signal', { to: viewerSocketId, signal: offer });
    }

    // ── Viewer WebRTC Handlers ───────────────────────────────
    async function handleOffer(broadcasterSocketId, offer) {
        if (peerConnection) peerConnection.close();
        peerConnection = new RTCPeerConnection(rtcConfig);

        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('signal', { to: broadcasterSocketId, signal: { candidate: event.candidate } });
            }
        };

        peerConnection.ontrack = (event) => {
            // Set the remote stream to the video element
            video.srcObject = event.streams[0];
            video.muted = false;
        };

        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit('signal', { to: broadcasterSocketId, signal: answer });
    }

    function appendComment(username, message, isSystem = false) {
        const div = document.createElement('div');
        div.className = 'comment-bubble';
        if (isSystem) {
            div.style.borderLeft = '3px solid var(--blue)';
            div.innerHTML = `<span style="color:var(--blue); font-weight:800; font-size:11px; text-transform:uppercase; display:block; margin-bottom:2px;">System Notification</span>${message}`;
        } else {
            div.innerHTML = `<span class="comment-user">@${username}</span>${message}`;
        }
        commentsEl.appendChild(div);
        commentsEl.scrollTop = commentsEl.scrollHeight;
    }

    function spawnFloatingEmoji(emoji) {
        const container = document.getElementById('floatingReactions');
        if (!container) return;
        const span = document.createElement('span');
        span.textContent = emoji;
        span.style.position = 'absolute';
        span.style.bottom = '0';
        span.style.right = Math.random() * 60 + 'px';
        span.style.fontSize = (24 + Math.random() * 20) + 'px';
        span.style.animation = `floatUp ${1.5 + Math.random()}s ease-out forwards`;
        span.style.pointerEvents = 'none';
        container.appendChild(span);
        setTimeout(() => span.remove(), 2000);
    }

    // Add floating animation dynamically
    if (!document.getElementById('liveAnimations')) {
        const style = document.createElement('style');
        style.id = 'liveAnimations';
        style.textContent = `
            @keyframes floatUp {
                0% { transform: translateY(0) rotate(0deg) scale(0.5); opacity: 0; }
                20% { opacity: 1; transform: translateY(-20px) rotate(10deg) scale(1.1); }
                100% { transform: translateY(-400px) rotate(-15deg) scale(1.5); opacity: 0; }
            }
        `;
        document.head.appendChild(style);
    }

    // ── API Actions ───────────────────────────────────────────
    async function startLive() {
        try {
            // Get Camera Access FIRST so we can add tracks immediately when a viewer joins
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            video.srcObject = localStream;
            video.muted = true;

            const res = await apiRequest('/live/start', { 
                method: 'POST', 
                body: JSON.stringify({ title: `${user.username}'s Live Session` }) 
            });
            currentStreamId = res.stream_id;
            isBroadcaster = true;

            discoveryEl.style.display = 'none';
            chatAreaEl.style.display = 'flex';
            stopLiveBtn.style.display = 'block';
            liveBadge.style.display = 'block';
            liveBadge.textContent = 'LIVE';
            liveBadge.style.background = '#ff2d55';
            
            initSocket(currentStreamId, 'broadcaster');
            showToast('🚀 You are now LIVE!', 'success');
        } catch (err) {
            console.error(err);
            showToast('Permission denied or hardware error', 'error');
        }
    }

    async function stopLive() {
        if (!isBroadcaster) return;
        try {
            await apiRequest('/live/end', { method: 'POST' });
            if (socket) socket.disconnect();
            if (localStream) {
                localStream.getTracks().forEach(t => t.stop());
                video.srcObject = null;
            }
            // Close all peer connections
            Object.values(peerConnections).forEach(pc => pc.close());
            peerConnections = {};
            location.reload();
        } catch (err) {
            location.reload();
        }
    }

    window.Blink.watchStream = async (streamId) => {
        try {
            const data = await apiRequest(`/live/${streamId}`);
            const s = data.stream;
            currentStreamId = streamId;
            isBroadcaster = false;

            discoveryEl.style.display = 'none';
            chatAreaEl.style.display = 'flex';
            liveBadge.style.display = 'block';
            liveBadge.textContent = 'WATCHING';
            liveBadge.style.background = '#007AFF';
            
            document.getElementById('watchingInfo').style.display = 'block';
            document.getElementById('watchingUsername').textContent = s.username;

            // Clear previous video placeholder
            video.src = '';
            video.srcObject = null;

            // Fetch chat history
            const chatRes = await apiRequest(`/live/${streamId}/chat`);
            commentsEl.innerHTML = '';
            (chatRes.chat || []).forEach(c => appendComment(c.username, c.message));

            initSocket(streamId, 'viewer');
            showToast(`Watching @${s.username}'s live`);
        } catch (err) {
            showToast('Stream is no longer active', 'error');
        }
    };

    window.Blink.sendReaction = (emoji) => {
        if (!socket || !currentStreamId) return;
        socket.emit('send_reaction', { streamId: currentStreamId, emoji });
        spawnFloatingEmoji(emoji); // Local feedback
    };

    // ── Discovery Grid ────────────────────────────────────────
    async function initDiscovery() {
        try {
            const data = await apiRequest('/live/now');
            const streams = data.streams || [];
            if (streams.length) {
                streamsGrid.innerHTML = streams.map(s => `
                    <div class="live-card" style="cursor:pointer; background:rgba(255,255,255,0.05); padding:15px; border-radius:var(--radius-md); text-align:center; position:relative; overflow:hidden;" onclick="window.Blink.watchStream(${s.stream_id})">
                        <div style="position:absolute; top:8px; left:8px; background:#ff2d55; color:white; font-size:9px; font-weight:900; padding:2px 6px; border-radius:4px; z-index:5">LIVE</div>
                        <div style="width:60px; height:60px; border-radius:50%; margin:0 auto 10px; border:2px solid #ff2d55; padding:2px;">
                            <img src="${s.profile_picture || `https://i.pravatar.cc/100?u=live_${s.user_id}`}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">
                        </div>
                        <div style="font-size:12px; font-weight:700; color:white;">@${s.username}</div>
                        <div style="font-size:10px; color:rgba(255,255,255,0.5); margin-top:5px;">👁️ ${s.viewer_count} watching</div>
                    </div>
                `).join('');
            } else {
                streamsGrid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:20px; color:var(--text-muted)">No one is live right now.</div>';
            }
        } catch (err) { console.error('Discovery failed', err); }
    }

    // ── Listeners ─────────────────────────────────────────────
    if (goLiveBtn) goLiveBtn.addEventListener('click', startLive);
    if (stopLiveBtn) stopLiveBtn.addEventListener('click', stopLive);
    
    sendMsgBtn?.addEventListener('click', () => {
        const msg = msgInput.value.trim();
        if (!msg || !socket || !currentStreamId) return;
        socket.emit('send_live_chat', { streamId: currentStreamId, userId: user.id, username: user.username, message: msg });
        msgInput.value = '';
    });
    
    msgInput?.addEventListener('keydown', e => { if (e.key === 'Enter') sendMsgBtn.click(); });

    // Startup
    const watchId = new URLSearchParams(window.location.search).get('watch');
    if (watchId) {
        window.Blink.watchStream(watchId);
    } else {
        initDiscovery();
    }

    window.addEventListener('beforeunload', () => {
        if (isBroadcaster) stopLive();
    });
});
