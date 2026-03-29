/**
 * live.js – Blink Live Streaming v3
 * ═══════════════════════════════════════════════════════════
 * Handles: Live Feed, Start Stream, Signaling (WebRTC), Chat
 * ═══════════════════════════════════════════════════════════
 */

document.addEventListener('DOMContentLoaded', async () => {
    // ── 1. HELPERS & AUTH ───────────────────────────────────────
    if (!window.Blink) return console.error('[Blink] auth.js not loaded');
    const { getToken, getUser, requireAuth, apiRequest, showToast } = window.Blink;
    
    if (!requireAuth()) return;

    const me = getUser();
    const liveList = document.getElementById('liveList');
    const noStreams = document.getElementById('noStreams');
    const streamPlayer = document.getElementById('streamPlayerContainer');
    const rVideo = document.getElementById('remoteVideo');
    const viewerCountEl = document.getElementById('viewerCount');
    const chatMessages = document.getElementById('chatMessages');
    const chatInput = document.getElementById('chatInput');
    const sendBtn = document.getElementById('sendLiveMsgBtn');
    const leaveBtn = document.getElementById('leaveBtn');
    const startLiveBtn = document.getElementById('startLiveBtn');

    let currentStreamId = null;
    let localStream = null;
    let peerConnection = null;
    const config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

    // ── 2. LIVE DISCOVERY ──────────────────────────────────────
    async function loadStreams() {
        if (liveList) liveList.innerHTML = '<div class="spinner"></div>';
        try {
            const data = await apiRequest('/live');
            renderStreams(data.streams || []);
        } catch (err) {
            console.error('[Live] Load fail:', err);
        }
    }

    function renderStreams(streams) {
        if (!liveList) return;
        liveList.innerHTML = '';
        
        if (streams.length === 0) {
            if (noStreams) noStreams.classList.remove('hidden');
            return;
        }

        if (noStreams) noStreams.classList.add('hidden');
        
        streams.forEach(s => {
            const card = document.createElement('div');
            card.className = 'live-card';
            card.innerHTML = `
                <div class="live-badge">LIVE</div>
                <img src="${s.avatar || 'css/default-avatar.png'}" alt="${s.username}" onerror="this.src='https://ui-avatars.com/api/?name=${s.username}'">
                <div class="live-info">
                    <div style="font-weight:700">@${s.username}</div>
                    <div style="font-size:11px; opacity:0.8">${s.viewers || 0} watching</div>
                </div>
            `;
            card.onclick = () => joinStream(s.id, s.host_id, s.username);
            liveList.appendChild(card);
        });
    }

    // ── 3. HOSTING (GO LIVE) ──────────────────────────────────
    if (startLiveBtn) {
        startLiveBtn.onclick = async () => {
            try {
                const res = await apiRequest('/live/start', { 
                    method: 'POST', 
                    body: JSON.stringify({ title: `${me.username}'s stream` }) 
                });
                
                if (res.success) {
                    currentStreamId = res.stream.id;
                    await startLocalStream();
                    setupHostSignaling();
                    showStreamUI(me.username);
                    showToast('🎉 You are now LIVE!', 'success');
                }
            } catch (err) {
                showToast('Failed to start live stream.', 'error');
            }
        };
    }

    async function startLocalStream() {
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            rVideo.srcObject = localStream;
            rVideo.muted = true; // Don't hear yourself
        } catch (err) {
            console.error('Media error:', err);
            throw new Error('Could not access camera/mic');
        }
    }

    // ── 4. VIEWING ─────────────────────────────────────────────
    async function joinStream(streamId, hostId, hostName) {
        currentStreamId = streamId;
        showStreamUI(hostName);
        
        const socket = window.Blink.socket;
        if (!socket) return;

        socket.emit('join_live', streamId);

        // WebRTC Viewer logic: Wait for offer from host or send request
        // In this simple v3, we'll use a request system
        socket.emit('live_chat', { 
            streamId, 
            user: me, 
            text: 'joined the stream! 👋' 
        });

        // Load chat history
        try {
            const history = await apiRequest(`/live/${streamId}/chat`);
            (history.messages || []).forEach(appendLiveMsg);
        } catch {}
    }

    function showStreamUI(title) {
        if (streamPlayer) streamPlayer.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }

    // ── 5. SIGNALING & SOCKETS ────────────────────────────────
    function setupHostSignaling() {
        const socket = window.Blink.socket;
        if (!socket) return;
        
        socket.emit('join_live', currentStreamId);

        // Host responds to viewer join requests
        // (Simplified: In a real app, you'd handle multiple peer connections)
    }

    function initSocketListeners() {
        const socket = window.Blink.socket;
        if (!socket) return;

        socket.on('viewer_count', ({ count }) => {
            if (viewerCountEl) viewerCountEl.textContent = count;
        });

        socket.on('live_chat', (data) => {
            appendLiveMsg(data);
        });

        // Basic signaling pass-through
        socket.on('offer', async (data) => {
            if (parseInt(data.streamId) !== parseInt(currentStreamId)) return;
            // Viewer receives offer from host
            if (!localStream) { // Only if we are a viewer
                 // WebRTC logic...
            }
        });
    }

    // ── 6. LIVE CHAT ──────────────────────────────────────────
    function appendLiveMsg(data) {
        if (!chatMessages) return;
        const div = document.createElement('div');
        div.className = 'chat-msg';
        const user = data.user || { username: data.username || 'Guest' };
        div.innerHTML = `<b>@${user.username}</b> <span>${data.text || data.message}</span>`;
        chatMessages.appendChild(div);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    if (sendBtn && chatInput) {
        sendBtn.onclick = () => {
            const text = chatInput.value.trim();
            if (!text || !currentStreamId) return;
            window.Blink.socket.emit('live_chat', { streamId: currentStreamId, user: me, text });
            chatInput.value = '';
        };
        chatInput.onkeydown = (e) => { if (e.key === 'Enter') sendBtn.click(); };
    }

    if (leaveBtn) {
        leaveBtn.onclick = () => {
            if (currentStreamId) {
                window.Blink.socket.emit('leave_live', currentStreamId);
                if (localStream) {
                    localStream.getTracks().forEach(track => track.stop());
                    // End stream on backend if we are host
                    apiRequest('/live/end', { method: 'POST' }).catch(() => {});
                }
            }
            window.location.reload();
        };
    }

    // ── INITIALIZE ────────────────────────────────────────────
    loadStreams();
    
    const checker = setInterval(() => {
        if (window.Blink.socket) {
            initSocketListeners();
            clearInterval(checker);
        }
    }, 500);
});
