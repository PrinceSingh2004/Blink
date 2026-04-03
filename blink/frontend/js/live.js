/**
 * live.js – Blink Streamer Engine Pro v6.0
 * Features: High-Fidelity WebRTC, Creator Controls, Real-time Chat, View Counts
 */

const socket = io();
const { getToken, getUser, showToast } = window.BlinkConfig;

let localStream;
let peerConnections = {}; // PeerID -> PeerConnection
const rtcConfig = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

const videoEl = document.getElementById('localVideo');
const startBtn = document.getElementById('startBtn');
const endBtn = document.getElementById('endStreamBtn');
const chatBox = document.getElementById('chatBox');
const chatInput = document.getElementById('chatInput');
const user = getUser();
let currentStreamId = null;

// ── 1. MEDIA HUB ──────────────────────────────────────────
async function initMedia() {
    try {
        console.log("🎬 Requesting camera pulse...");
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        videoEl.srcObject = localStream;
        console.log("✅ Camera pulse stabilized");
    } catch (err) {
        if (window.showToast) window.showToast("Camera and Mic permissions are required for live pulse.", "error");
    }
}

// ── 2. BROADCAST LIFECYCLE ────────────────────────────────
startBtn.onclick = async () => {
    if (!localStream) return window.showToast("Initialize camera pulse first!", "info");
    
    startBtn.disabled = true;
    startBtn.textContent = "Connecting Universe...";

    try {
        // Register in DB Pulse
        const res = await window.API('/live/start', {
            method: 'POST',
            body: JSON.stringify({ userId: user.id, title: `${user.username}'s Active Universe` })
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        currentStreamId = data.streamId;
        startBtn.style.display = 'none';
        endBtn.style.display = 'block';

        // Join Signaling Pulse
        socket.emit('join-stream', `stream-${currentStreamId}`);
        console.log(`🚀 Pulse LIVE in room: stream-${currentStreamId}`);
        if (window.showToast) window.showToast("The universe is watching.", "success");
    } catch (err) {
        if (window.showToast) window.showToast("Pulse stabilization failed.", "error");
        startBtn.disabled = false;
        startBtn.textContent = "Go Live";
    }
};

endBtn.onclick = async () => {
    const confirmEnd = confirm("Complete the session and terminate the pulse?");
    if (!confirmEnd) return;

    try {
        await window.API('/live/stop', {
            method: 'POST',
            body: JSON.stringify({ streamId: currentStreamId, userId: user.id })
        });
        window.location.href = 'index.html';
    } catch (err) {
        if (window.showToast) window.showToast("Termination signal failed.", "error");
    }
};

// ── 3. SIGNALING OVERLAY ──────────────────────────────────
socket.on('user-joined', async (peerId) => {
    console.log(`📡 Peer joined: ${peerId}. Creating bridge pulse...`);
    
    const pc = new RTCPeerConnection(rtcConfig);
    peerConnections[peerId] = pc;

    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

    pc.onicecandidate = (e) => {
        if (e.candidate) socket.emit('ice-candidate', { target: peerId, candidate: e.candidate });
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit('offer', { target: peerId, sdp: pc.localDescription });
    
    updateViewerStats();
});

function updateViewerStats() {
    const count = Object.keys(peerConnections).length;
    document.getElementById('viewerCount').textContent = `👁️ ${count}`;
}

// ── 4. CHAT HUB ───────────────────────────────────────────
chatInput.onkeydown = (e) => {
    if (e.key === 'Enter' && chatInput.value.trim() && currentStreamId) {
        socket.emit('send-message', {
            roomId: `stream-${currentStreamId}`,
            username: user.username,
            text: chatInput.value.trim()
        });
        chatInput.value = '';
    }
};

socket.on('receive-message', (data) => {
    const msg = document.createElement('div');
    msg.className = 'chat-msg';
    msg.innerHTML = `<b>@${data.username}</b> ${data.text}`;
    chatBox.appendChild(msg);
    chatBox.scrollTop = chatBox.scrollHeight;
});

// Auto-init
initMedia();
