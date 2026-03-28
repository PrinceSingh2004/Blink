/**
 * live.js – WebRTC One-to-Many Multi-Streaming Core
 * ═══════════════════════════════════════════════════════════
 * Video broadcasting, remote viewing, peer signaling, live chat
 * ═══════════════════════════════════════════════════════════
 */

document.addEventListener('DOMContentLoaded', async () => {
    const { getToken, getUser, requireAuth, apiRequest, showToast } = window.Blink;
    if (!requireAuth()) return;

    const me = getUser();
    const rVideo = document.getElementById('remoteVideo');
    const player = document.getElementById('streamPlayerContainer');
    const liveGrid = document.getElementById('liveList');

    let pc = null;
    let localStream = null;
    let currentStreamId = null;

    const configuration = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

    // ─── 2. SOCKET.IO SETUP ─────────────────────────────────────
    const socketUrl = window.BlinkConfig ? window.BlinkConfig.SOCKET_URL : window.location.origin;
    const socket = io(socketUrl, { reconnection: true });

    // ─── 1. DISCOVERY ──────────────────────────────────────────
    async function loadDiscovery() {
        try {
            const data = await apiRequest('/api/live/now');
            renderLiveList(data.streams);
        } catch (err) { console.error(err); }
    }

    function renderLiveList(streams) {
        liveGrid.innerHTML = '';
        if (streams.length === 0) return document.getElementById('noStreams').classList.remove('hidden');
        
        streams.forEach(s => {
            const card = document.createElement('div');
            card.className = 'live-card';
            card.innerHTML = `
                <div class="live-badge">LIVE</div>
                <img src="${s.profile_photo || 'image/default-avatar.png'}" alt="Avatar">
                <div class="live-info">@${s.username}</div>
            `;
            card.onclick = () => joinStream(s.stream_id);
            liveGrid.appendChild(card);
        });
    }

    // ─── 2. BROADCAST (Host) ───────────────────────────────────
    document.getElementById('startLiveBtn').onclick = async () => {
        try {
            const { stream_id } = await apiRequest('/api/live/start', { method: 'POST', body: JSON.stringify({ title: 'Live Now' }) });
            currentStreamId = stream_id;
            
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            rVideo.srcObject = localStream;
            rVideo.muted = true;
            player.classList.remove('hidden');

            socket.emit('joinRoom', `live_${stream_id}`);
            showToast('You are now LIVE!', 'success');

            // Listen for viewers asking for offer
            socket.on('stream_offer', async ({ offer, from }) => {
                const pc = createPeerConnection(from);
                localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
                await pc.setRemoteDescription(new RTCSessionDescription(offer));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                socket.emit('stream_answer', { answer, to: from });
            });

        } catch (err) {
            showToast('Failed to start stream', 'error');
        }
    };

    // ─── 3. JOIN STREAM (Viewer) ───────────────────────────────
    async function joinStream(streamId) {
        currentStreamId = streamId;
        player.classList.remove('hidden');
        rVideo.muted = false;

        const room = `live_${streamId}`;
        socket.emit('joinRoom', room);

        // Create fresh PeerConnection
        pc = new RTCPeerConnection(configuration);
        pc.ontrack = (e) => { rVideo.srcObject = e.streams[0]; };
        
        const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
        await pc.setLocalDescription(offer);
        socket.emit('stream_offer', { streamId, offer });

        socket.on('stream_answer', async ({ answer }) => {
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
        });

        socket.on('stream_ice_candidate', async ({ candidate }) => {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
        });
    }

    function createPeerConnection(to) {
        const conn = new RTCPeerConnection(configuration);
        conn.onicecandidate = (e) => {
            if (e.candidate) socket.emit('stream_ice_candidate', { candidate: e.candidate, to });
        };
        return conn;
    }

    // ─── 4. CHAT ───────────────────────────────────────────────
    document.getElementById('sendLiveMsgBtn').onclick = () => {
        const msg = document.getElementById('chatInput').value.trim();
        if (!msg || !currentStreamId) return;
        socket.emit('sendMessage', { roomId: `live_${currentStreamId}`, username: me.username, message: msg });
        document.getElementById('chatInput').value = '';
    };

    socket.on('receiveMessage', (data) => {
        const box = document.getElementById('chatMessages');
        const div = document.createElement('div');
        div.className = 'chat-msg';
        div.innerHTML = `<b>@${data.username}</b> ${data.message}`;
        box.appendChild(div);
        box.scrollTop = box.scrollHeight;
    });

    document.getElementById('leaveBtn').onclick = () => window.location.reload();

    // INIT
    loadDiscovery();
});
