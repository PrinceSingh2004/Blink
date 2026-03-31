/**
 * live.js – Blink Streamer Logic v6.0
 * One-to-Many WebRTC implementation
 */

const socket = io();
let localStream;
let peerConnections = {}; // Track ID -> RTCPeerConnection mapping
const config = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

const videoEl = document.getElementById('localVideo');
const startBtn = document.getElementById('startBtn');
const chatBox = document.getElementById('chatBox');
const chatInput = document.getElementById('chatInput');
const user = JSON.parse(localStorage.getItem('blink_user')) || { username: 'Anonymous', id: 0 };
let currentStreamId = null;

// ── TASK 4: MEDIA ACCESS ──────────────────────────────────────
async function initStream() {
    try {
        console.log("🎬 Requesting camera access...");
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        videoEl.srcObject = localStream;
        console.log("✅ Camera access granted");
    } catch (err) {
        console.error("❌ Permission Failure:", err);
        alert("Camera and Mic permissions are required to go live.");
    }
}

// ── TASK 1: START STREAM ──────────────────────────────────────
startBtn.onclick = async () => {
    if (!localStream) return alert("Initialize camera first!");
    
    startBtn.disabled = true;
    startBtn.textContent = "Connecting...";

    try {
        // Register in DB
        const res = await fetch('/api/live/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: user.id, title: `${user.username}'s Live Universe` })
        });
        const data = await res.json();
        currentStreamId = data.streamId;

        // Join Signaling Room
        socket.emit('join-stream', `room-${currentStreamId}`);
        startBtn.textContent = "Currently Live";
        
        console.log(`🚀 We are LIVE in room: room-${currentStreamId}`);
    } catch (err) {
        console.error("❌ Signal Failure:", err);
    }
};

// ── TASK 3 & 4: WEBRTC SIGNALING ───────────────────────────
socket.on('user-joined', async (peerId) => {
    console.log(`📡 Peer joined: ${peerId}. Creating bridge...`);
    
    const pc = new RTCPeerConnection(config);
    peerConnections[peerId] = pc;

    // Add local tracks to the connection
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('ice-candidate', { target: peerId, candidate: event.candidate });
        }
    };

    // Create Offer
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    
    socket.emit('offer', { target: peerId, sdp: pc.localDescription });
});

socket.on('answer', async (data) => {
    console.log(`📦 Answer received from: ${data.sender}`);
    const pc = peerConnections[data.sender];
    if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
    }
});

socket.on('ice-candidate', async (data) => {
    const pc = peerConnections[data.sender];
    if (pc) {
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
    }
});

// ── CHAT SYSTEM ──────────────────────────────────────────────
chatInput.onkeydown = (e) => {
    if (e.key === 'Enter' && chatInput.value.trim()) {
        socket.emit('send-message', {
            roomId: `room-${currentStreamId}`,
            username: user.username,
            text: chatInput.value.trim()
        });
        chatInput.value = '';
    }
};

socket.on('receive-message', (data) => {
    const msg = document.createElement('div');
    msg.className = 'chat-msg';
    msg.innerHTML = `<b>${data.username}</b> ${data.text}`;
    chatBox.appendChild(msg);
    chatBox.scrollTop = chatBox.scrollHeight;
});

// Sync visual stats
socket.on('user-joined', () => {
    const count = Object.keys(peerConnections).length;
    document.getElementById('viewerCount').textContent = `👁️ ${count}`;
});

// Initialize on page load
initStream();
