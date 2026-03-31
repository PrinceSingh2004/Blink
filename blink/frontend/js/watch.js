/**
 * watch.js – Blink Viewer Logic v6.0
 * Connects to streamer signaling through Peer ID
 */

const socket = io();
let pc;
const config = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

const videoEl = document.getElementById('remoteVideo');
const chatBox = document.getElementById('chatBox');
const chatInput = document.getElementById('chatInput');
const user = JSON.parse(localStorage.getItem('blink_user')) || { username: `Guest_${Math.floor(Math.random()*1000)}`, id: 0 };
const streamId = new URLSearchParams(window.location.search).get('id') || 'preview';

// ── TASK 1 & 2: JOIN STREAM SIGNALING ───────────────────────
async function joinStream() {
    console.log(`📡 Joining Signaling Room: room-${streamId}`);
    socket.emit('join-stream', `room-${streamId}`);
}

// ── TASK 3 & 4: WEBRTC SIGNALING ───────────────────────────
socket.on('offer', async (data) => {
    console.log(`📦 Receive Offer from: ${data.sender}`);
    
    pc = new RTCPeerConnection(config);
    
    // When remote track is added
    pc.ontrack = (event) => {
        console.log("✅ Remote Vision Stream Added");
        videoEl.srcObject = event.streams[0];
    };

    // When ICE candidate is generated
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('ice-candidate', { target: data.sender, candidate: event.candidate });
        }
    };

    // Process Offer and Create Answer
    await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    socket.emit('answer', { target: data.sender, sdp: pc.localDescription });
});

socket.on('ice-candidate', async (data) => {
    if (pc) {
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
    }
});

// ── CHAT SYSTEM ──────────────────────────────────────────────
chatInput.onkeydown = (e) => {
    if (e.key === 'Enter' && chatInput.value.trim()) {
        socket.emit('send-message', {
            roomId: `room-${streamId}`,
            username: user.username,
            text: chatInput.value.trim()
        });
        chatInput.value = '';
    }
};

document.getElementById('sendBtn').onclick = () => {
    if (chatInput.value.trim()) {
        socket.emit('send-message', {
            roomId: `room-${streamId}`,
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

// Initial join
joinStream();
