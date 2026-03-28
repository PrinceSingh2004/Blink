/**
 * messages.js – Real-Time Chat System (Socket.IO Fix)
 * ═══════════════════════════════════════════════════════════
 * Instant message delivery, room support, auto-scroll – No Refresh
 * ═══════════════════════════════════════════════════════════
 */

document.addEventListener('DOMContentLoaded', async () => {
    // ── 1. HELPERS & AUTH ───────────────────────────────────────
    const { getToken, getUser, requireAuth, showToast, populateSidebar } = window.Blink;
    if (!requireAuth()) return;
    await populateSidebar();

    const me = getUser();
    const chatBox = document.getElementById('messagesArea');
    const input = document.getElementById('chatInput');
    const sendBtn = document.getElementById('sendMsgBtn');
    
    let activeUserId = null;
    let socket = null;
    let currentRoomId = null;

    const typingIndicator = document.getElementById('typingIndicator');
    let typingTimer;

    // ── 2. SOCKET.IO SETUP ─────────────────────────────────────
    const setupSocket = () => {
        const socketUrl = window.BlinkConfig ? window.BlinkConfig.SOCKET_URL : window.location.origin;
        socket = io(socketUrl, { reconnection: true, reconnectionAttempts: 10 });

        socket.on('receiveMessage', (data) => {
            appendMessage(data);
            autoScroll();
            // Mark as seen immediately if active
            if (currentRoomId === data.roomId) {
                socket.emit('markSeen', { roomId: currentRoomId, userId: me.id });
            }
        });

        socket.on('userTyping', (data) => {
            if (typingIndicator) {
                typingIndicator.textContent = data.typing ? `${data.username} is typing...` : '';
                typingIndicator.style.display = data.typing ? 'block' : 'none';
            }
        });

        socket.on('msgSeen', (data) => {
            // Update UI to show 'Seen' badge for last sent message
            const lastSent = document.querySelectorAll('.msg-bubble.sent').pop();
            if (lastSent && !lastSent.querySelector('.seen-status')) {
                const seen = document.createElement('span');
                seen.className = 'seen-status';
                seen.innerHTML = '<i class="bi bi-check-all text-primary"></i> Seen';
                lastSent.appendChild(seen);
            }
        });
    };

    // ── 3. TYPING LOGIC ─────────────────────────────────────────
    input?.addEventListener('input', () => {
        socket.emit('typing', { roomId: currentRoomId, username: me.username, isTyping: true });
        clearTimeout(typingTimer);
        typingTimer = setTimeout(() => {
            socket.emit('typing', { roomId: currentRoomId, username: me.username, isTyping: false });
        }, 2000);
    });

    // ── 3. SEND MESSAGE ────────────────────────────────────────
    const sendMessage = () => {
        const msg = input.value.trim();
        if (!msg) return; // Prevent empty messages
        if (!currentRoomId) return showToast('Please select a chat to begin', 'error');

        const payload = {
            roomId: currentRoomId,
            message: msg,
            username: me.username,
            avatar: me.avatar_url || me.profile_pic,
            senderId: me.id
        };

        // Emit to server (The Real-Time Fix)
        socket.emit('sendMessage', payload);
        
        input.value = '';
        input.focus();
    };

    // ── 4. JOIN ROOM ───────────────────────────────────────────
    const joinChatRoom = (otherUserId) => {
        activeUserId = otherUserId;
        // Simple room ID formula: sort IDs then join with underscore
        currentRoomId = [me.id, otherUserId].sort().join('_');
        
        socket.emit('joinRoom', currentRoomId);
        console.log('[Chat] Joining room:', currentRoomId);
        
        // Clear chat area before loading new chat history
        chatBox.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted)">Welcome to the chat!</div>';
    };

    // ── 5. UI HELPERS ─────────────────────────────────────────
    const appendMessage = (data) => {
        const isSent = parseInt(data.senderId) === parseInt(me.id);
        const div = document.createElement('div');
        div.id = `msg-${data.id || Date.now()}`;
        div.className = `msg-bubble ${isSent ? 'sent' : 'received'}`;
        div.innerHTML = `
            ${!isSent ? `<b>@${data.username}</b><br>` : ''}
            ${data.message}
            <div class="msg-time">${new Date(data.timestamp).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}</div>
        `;
        chatBox.appendChild(div);
    };

    const autoScroll = () => {
        chatBox.scrollTop = chatBox.scrollHeight;
    };

    // ── 6. EVENT LISTENERS ─────────────────────────────────────
    sendBtn?.addEventListener('click', sendMessage);
    input?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // Simulate clicking a conversation list item (to select user)
    document.querySelectorAll('.conv-item').forEach(el => {
        el.addEventListener('click', () => {
            const uid = el.getAttribute('data-uid');
            joinChatRoom(uid);
        });
    });

    // Start everything
    setupSocket();
});
