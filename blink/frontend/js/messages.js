/**
 * messages.js – Blink Messaging v3
 * ═══════════════════════════════════════════════════════════
 * Handles: Conv List, Search, Room History, Real-Time Socket
 * ═══════════════════════════════════════════════════════════
 */

document.addEventListener('DOMContentLoaded', async () => {
    // ── 1. HELPERS & AUTH ───────────────────────────────────────
    if (!window.Blink) return console.error('[Blink] auth.js not loaded');
    const { getToken, getUser, requireAuth, apiRequest, showToast } = window.Blink;
    
    if (!requireAuth()) return;

    const me = getUser();
    const convList = document.getElementById('convList');
    const chatMain = document.getElementById('chatMain');
    const noChatSelected = document.getElementById('noChatSelected');
    const chatBox = document.getElementById('messagesArea');
    const input = document.getElementById('chatInput');
    const sendBtn = document.getElementById('sendMsgBtn');
    
    // Header elements
    const chatHeaderName = document.getElementById('chatHeaderName');
    const chatHeaderAvatar = document.getElementById('chatHeaderAvatar');

    let currentRoomId = null;
    let activeOtherUser = null;
    let typingTimer;

    // ── 2. CONVERSATION LIST ───────────────────────────────────
    async function loadConversations() {
        if (convList) convList.innerHTML = '<div class="spinner"></div>';
        try {
            const data = await apiRequest('/messages/conversations');
            renderConversations(data.conversations || []);
        } catch (err) {
            console.warn('[Chat] Conv list fail:', err);
            if (convList) convList.innerHTML = '<p class="error-msg">Failed to load chats</p>';
        }
    }

    function renderConversations(convs) {
        if (!convList) return;
        if (!convs.length) {
            convList.innerHTML = '<div class="empty-conv">No messages yet. Start a new one!</div>';
            return;
        }

        convList.innerHTML = convs.map(c => {
            const time = c.last_message_time ? new Date(c.last_message_time).toLocaleDateString() : '';
            return `
                <div class="conv-item ${currentRoomId === c.room_id ? 'active' : ''}" data-room="${c.room_id}" data-uid="${c.other_user_id}">
                    <div class="conv-avatar">
                        ${c.avatar ? `<img src="${c.avatar}" alt="${c.username}">` : c.username[0].toUpperCase()}
                    </div>
                    <div class="conv-info">
                        <div class="conv-name">
                            ${c.username}
                            ${c.is_verified ? '<i class="bi bi-patch-check-fill verified-icon"></i>' : ''}
                        </div>
                        <div class="conv-last-msg">${c.last_message || 'Start chatting...'}</div>
                    </div>
                    <div class="conv-meta">
                        <div class="conv-time">${time}</div>
                        ${c.unread_count > 0 ? `<div class="conv-badge">${c.unread_count}</div>` : ''}
                    </div>
                </div>
            `;
        }).join('');

        // Attach click events
        convList.querySelectorAll('.conv-item').forEach(item => {
            item.onclick = () => {
                const uid = item.getAttribute('data-uid');
                const username = item.querySelector('.conv-name').textContent.trim();
                const avatar = item.querySelector('.conv-avatar').innerHTML;
                openChat(uid, username, avatar);
            };
        });
    }

    // ── 3. OPEN CHAT ───────────────────────────────────────────
    window.openChat = async (userId, username, avatarHtml) => {
        if (noChatSelected) noChatSelected.style.display = 'none';
        if (chatMain) chatMain.style.display = 'flex';
        
        chatBox.innerHTML = '<div class="loading-messages">Loading history...</div>';
        window.__activeChatId = userId;

        if (chatHeaderName) chatHeaderName.textContent = username;
        if (chatHeaderAvatar) chatHeaderAvatar.innerHTML = avatarHtml;

        try {
            const data = await apiRequest(`/messages/room/${userId}`);
            currentRoomId = data.roomId;
            chatBox.innerHTML = '';
            
            if (data.messages && data.messages.length) {
                data.messages.forEach(m => appendMessage(m));
                autoScroll();
            } else {
                chatBox.innerHTML = '<div class="chat-start-hint">Start of your conversation</div>';
            }

            // Join socket room
            if (window.Blink.socket) {
                window.Blink.socket.emit('joinRoom', currentRoomId);
                window.Blink.socket.emit('markSeen', { roomId: currentRoomId, userId: me.id });
            }

            // Update list to clear unread
            loadConversations();
        } catch (err) {
            showToast('Failed to open chat', 'error');
        }
    };

    // ── 4. SOCKET LISTENERS ────────────────────────────────────
    function initSocketListeners() {
        const socket = window.Blink.socket;
        if (!socket) return;

        socket.on('receiveMessage', (data) => {
            if (data.roomId === currentRoomId) {
                appendMessage(data);
                autoScroll();
                socket.emit('markSeen', { roomId: currentRoomId, userId: me.id });
                // If we're at the bottom, autoScroll
            }
            // Always refresh conv list to show last msg
            loadConversations();
        });

        socket.on('userTyping', (data) => {
            const typingIndicator = document.getElementById('typingIndicator');
            if (typingIndicator && data.roomId === currentRoomId) {
                typingIndicator.textContent = data.typing ? `@${data.username} is typing...` : '';
                typingIndicator.style.display = data.typing ? 'block' : 'none';
            }
        });
    }

    // ── 5. UI HELPERS ──────────────────────────────────────────
    function appendMessage(m) {
        const isSent = parseInt(m.sender_id || m.senderId) === parseInt(me.id);
        const div = document.createElement('div');
        div.className = `msg-bubble ${isSent ? 'sent' : 'received'}`;
        
        const timestamp = m.created_at || m.timestamp || new Date();
        const timeStr = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        div.innerHTML = `
            <div class="msg-content">${m.message}</div>
            <div class="msg-meta">
                <span class="msg-time">${timeStr}</span>
                ${isSent && m.is_read ? '<i class="bi bi-check-all seen-status"></i>' : ''}
            </div>
        `;
        chatBox.appendChild(div);
    }

    function autoScroll() {
        chatBox.scrollTop = chatBox.scrollHeight;
    }

    // ── 6. EVENT LISTENERS ─────────────────────────────────────
    function sendMessage() {
        const msg = input.value.trim();
        if (!msg || !currentRoomId) return;

        const payload = {
            roomId: currentRoomId,
            message: msg,
            senderId: me.id,
            username: me.username,
            avatar: me.profile_pic || me.avatar_url
        };

        if (window.Blink.socket) {
            window.Blink.socket.emit('sendMessage', payload);
        }

        input.value = '';
        input.focus();
    }

    if (sendBtn) sendBtn.onclick = sendMessage;
    if (input) {
        input.onkeydown = (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        };

        input.oninput = () => {
            if (window.Blink.socket && currentRoomId) {
                window.Blink.socket.emit('typing', { roomId: currentRoomId, username: me.username, isTyping: true });
                clearTimeout(typingTimer);
                typingTimer = setTimeout(() => {
                    window.Blink.socket.emit('typing', { roomId: currentRoomId, username: me.username, isTyping: false });
                }, 2000);
            }
        };
    }

    // New Message Modal
    const newMsgBtn = document.getElementById('newMsgBtn');
    const newMsgModal = document.getElementById('newMsgModal');
    const modalStartBtn = document.getElementById('modalStartBtn');
    const modalCancelBtn = document.getElementById('modalCancelBtn');

    if (newMsgBtn) newMsgBtn.onclick = () => newMsgModal.classList.add('active');
    if (modalCancelBtn) modalCancelBtn.onclick = () => newMsgModal.classList.remove('active');

    if (modalStartBtn) {
        modalStartBtn.onclick = async () => {
            const username = document.getElementById('newMsgUsername').value.trim().replace('@', '');
            if (!username) return;
            try {
                const data = await apiRequest(`/users/search?q=${username}`);
                const user = (data.users || []).find(u => u.username.toLowerCase() === username.toLowerCase());
                if (!user) {
                    showToast('User not found', 'error');
                } else {
                    newMsgModal.classList.remove('active');
                    openChat(user.id, user.username, user.profile_photo ? `<img src="${user.profile_photo}" alt="${user.username}">` : user.username[0].toUpperCase());
                }
            } catch (err) {
                showToast('Failed to start chat', 'error');
            }
        };
    }

    // ── INITIALIZE ────────────────────────────────────────────
    loadConversations();
    
    // Check if redirecting from another page to chat (via URL id)
    const startUid = urlParams.get('start');
    if (startUid) {
        // Find user and start chat
        try {
            const data = await apiRequest(`/users/${startUid}`);
            if (data.success) {
                const u = data.data;
                const avatar = (u.profile_pic || u.avatar_url) ? `<img src="${u.profile_pic || u.avatar_url}" alt="${u.username}">` : u.username[0].toUpperCase();
                openChat(u.id, u.username, avatar);
            }
        } catch {}
    }

    // Wait for socket to be initialized by auth.js
    const checker = setInterval(() => {
        if (window.Blink.socket) {
            initSocketListeners();
            clearInterval(checker);
        }
    }, 500);
});
