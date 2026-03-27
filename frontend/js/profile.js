/**
 * js/profile.js
 * ═══════════════════════════════════════════════════════════
 * Blink — Production Universal Profile & Live Module
 * Implementation: WEBRTC Signaling Flow + CHAT Room System +
 *                 Optimistic Updates + TOAST Toast Notifications
 * ═══════════════════════════════════════════════════════════ */

(function() {
    "use strict";

    const socket = io(); // Connect to server
    let peerConn;
    const config = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };
    let currentStreamId = null;

    // ── CONFIG & STATE ───────────────────────────────────────
    const state = {
        userId: null,
        user: null,
        isLive: false,
        token: localStorage.getItem('blink_token')
    };

    // ── DOM SELECTORS ────────────────────────────────────────
    const doc = (id) => document.getElementById(id);

    // ── INITIALIZATION ───────────────────────────────────────
    async function initProfile() {
        const streamId = new URLSearchParams(window.location.search).get('stream');
        if (streamId) {
            currentStreamId = streamId;
            socket.emit('joinStream', streamId);
            setupWebRTC(false); // Join as Viewer
        }
        setupChatListeners();
    }

    // ── WEBRTC : LIVE STREAMING ──────────────────────────────
    async function setupWebRTC(isCreator) {
        try {
            peerConn = new RTCPeerConnection(config);

            // Handle ICE Candidates (Expert Flow)
            peerConn.onicecandidate = (event) => {
                if (event.candidate) {
                    socket.emit('signal', {
                        to: currentStreamId, // Broadcaster or specific viewer
                        signal: { candidate: event.candidate }
                    });
                }
            };

            // Stream Media (Autoplay Fix for Mobile)
            peerConn.ontrack = (event) => {
                const vid = doc('videoPlayer');
                if (vid) {
                    vid.srcObject = event.streams[0];
                    vid.muted = true; // Auto-play requirement
                    vid.playsInline = true;
                    vid.play().catch(e => console.warn('[Video] Manual play needed', e));
                }
            };

            if (isCreator) {
                const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                stream.getTracks().forEach(track => peerConn.addTrack(track, stream));
                const offer = await peerConn.createOffer();
                await peerConn.setLocalDescription(offer);
                socket.emit('signal', { signal: { offer: offer } });
            }

            // SIGNALING HANDLER
            socket.on('signal', async (data) => {
                if (data.signal.offer) {
                    await peerConn.setRemoteDescription(new RTCSessionDescription(data.signal.offer));
                    const answer = await peerConn.createAnswer();
                    await peerConn.setLocalDescription(answer);
                    socket.emit('signal', { to: data.from, signal: { answer: answer } });
                } else if (data.signal.answer) {
                    await peerConn.setRemoteDescription(new RTCSessionDescription(data.signal.answer));
                } else if (data.signal.candidate) {
                    await peerConn.addIceCandidate(new RTCIceCandidate(data.signal.candidate));
                }
            });

        } catch (err) {
            console.error('[WebRTC] Connection failed:', err);
            showToast('Failed to connect to stream. Please refresh.', 'error');
        }
    }

    // ── LIVE CHAT SYSTEM ────────────────────────────────────
    function setupChatListeners() {
        const chatInput = doc('chatInput');
        const sendBtn = doc('sendChatBtn');

        socket.on('receiveMessage', (msg) => {
            appendMessage(msg);
        });

        if (sendBtn) {
            sendBtn.onclick = () => sendMessage();
        }
        if (chatInput) {
            chatInput.onkeypress = (e) => (e.key === 'Enter' && sendMessage());
        }
    }

    function sendMessage() {
        const input = doc('chatInput');
        if (!input.value.trim()) return;

        socket.emit('sendMessage', {
            streamId: currentStreamId,
            username: state.user?.username || 'Guest',
            avatar: state.user?.profile_pic || '',
            text: input.value
        });
        input.value = '';
    }

    function appendMessage(msg) {
        const box = doc('chatMessages');
        if (!box) return;

        const row = document.createElement('div');
        row.className = 'chat-row';
        row.innerHTML = `
            <img src="${msg.avatar || '/img/default-avatar.svg'}" class="chat-avatar">
            <div class="chat-content">
                <strong>${msg.user}</strong>: <span>${msg.text}</span>
            </div>
        `;
        box.appendChild(row);
        box.scrollTop = box.scrollHeight; // Auto-scroll
    }

    // ── UI UTILITIES ────────────────────────────────────────
    function showToast(msg, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `blink-toast toast-${type}`;
        toast.textContent = msg;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    document.addEventListener('DOMContentLoaded', initProfile);
})();
