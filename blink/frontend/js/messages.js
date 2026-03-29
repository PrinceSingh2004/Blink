/**
 * messages.js – Blink Messaging v4.0 (UI Optimized)
 * Premium Split-Pane Desktop & Responsive Mobile Layout
 */

document.addEventListener('DOMContentLoaded', async () => {
    // ── 1. HELPERS & AUTH ───────────────────────────────────────
    if (!window.Blink) return console.error('[Blink] auth.js not loaded');
    const { getToken, getUser, requireAuth, apiRequest, showToast } = window.Blink;
    
    if (!requireAuth()) return;

    const me = getUser();
    const elements = {
        list:       document.getElementById('conversationContainer'),
        thread:     document.getElementById('chatThread'),
        chatList:   document.getElementById('chatList'),
        box:        document.getElementById('messagesArea'),
        input:      document.getElementById('chatInput'),
        sendBtn:    document.getElementById('sendBtn'),
        header:     document.getElementById('threadHeader'),
        name:       document.getElementById('threadName'),
        avatar:     document.getElementById('threadAvatar'),
        inputArea:  document.getElementById('inputArea'),
        backBtn:    document.getElementById('backBtn')
    };

    let currentRoomId = null;
    let activeOtherUserId = null;

    // ── 2. CONVERSATION LIST ───────────────────────────────────
    async function loadConversations() {
        try {
            const data = await apiRequest('/messages/conversations');
            renderConversations(data.conversations || []);
        } catch (err) {
            console.warn('[Chat] Failed to load conversations:', err);
            if (elements.list) elements.list.innerHTML = '<p style="padding:40px;text-align:center;color:var(--text-muted);">Failed to load chats</p>';
        }
    }

    function renderConversations(convs) {
        if (!elements.list) return;
        if (!convs.length) {
            elements.list.innerHTML = '<div style="padding:60px;text-align:center;color:var(--text-muted);"><i class="bi bi-chat-dots" style="font-size:32px;opacity:0.2;"></i><p style="margin-top:10px;">No messages yet.</p></div>';
            return;
        }

        elements.list.innerHTML = convs.map(c => `
            <div class="conversation-item ${currentRoomId === c.room_id ? 'active' : ''}" data-room="${c.room_id}" data-uid="${c.other_user_id}">
                <div class="avatar" style="width:48px;height:48px;flex-shrink:0;background:#333;display:flex;align-items:center;justify-content:center;font-size:18px;">
                    ${c.avatar ? `<img src="${c.avatar}" alt="${c.username}" class="avatar" style="width:100%;height:100%;object-fit:cover;">` : c.username[0].toUpperCase()}
                </div>
                <div class="conv-info">
                    <div class="conv-name">@${c.username} ${c.is_verified ? '<i class="bi bi-patch-check-fill" style="color:var(--accent-secondary);font-size:12px;"></i>' : ''}</div>
                    <div class="conv-last">${c.last_message || 'Start a conversation...'}</div>
                </div>
                ${c.unread_count > 0 ? `<div style="background:var(--accent-primary);color:white;font-size:10px;font-weight:800;padding:2px 8px;border-radius:10px;">${c.unread_count}</div>` : ''}
            </div>
        `).join('');

        // Attach clicks
        elements.list.querySelectorAll('.conversation-item').forEach(item => {
            item.onclick = () => {
                const uid = item.getAttribute('data-uid');
                const username = item.querySelector('.conv-name').textContent.trim();
                const avatarContent = item.querySelector('.avatar').innerHTML;
                openChat(uid, username.replace('@', ''), avatarContent);
            };
        });
    }

    // ── 3. OPEN CHAT ───────────────────────────────────────────
    async function openChat(userId, username, avatarHtml) {
        activeOtherUserId = userId;
        
        // Mobile visibility toggle
        if (window.innerWidth <= 768) {
            elements.chatList.classList.remove('active');
            elements.thread.classList.add('active');
        }

        // Show UI components
        if (elements.header) elements.header.style.display = 'flex';
        if (elements.inputArea) elements.inputArea.style.display = 'flex';
        
        elements.box.innerHTML = '<div style="flex:1;display:flex;align-items:center;justify-content:center;"><div class="loader"></div></div>';
        
        if (elements.name) elements.name.textContent = '@' + username;
        if (elements.avatar) elements.avatar.innerHTML = avatarHtml;

        try {
            const data = await apiRequest(`/messages/room/${userId}`);
            currentRoomId = data.roomId;
            elements.box.innerHTML = '';
            
            if (data.messages && data.messages.length) {
                data.messages.forEach(m => appendMessage(m));
                autoScroll();
            } else {
                elements.box.innerHTML = `<div style="text-align:center;padding:100px 40px;color:var(--text-muted);opacity:0.5;font-size:14px;"><i class="bi bi-shield-lock" style="font-size:24px;"></i><p style="margin-top:10px;">Messages are end-to-end encrypted. Follow social guidelines to keep Blink safe.</p></div>`;
            }

            // Sync with socket
            if (window.Blink.socket) {
                window.Blink.socket.emit('joinRoom', currentRoomId);
            }

            loadConversations(); // Clear unread counts in UI
        } catch (err) {
            showToast('Failed to load chat history', 'error');
        }
    }

    function appendMessage(m) {
        const isSent = parseInt(m.sender_id || m.senderId) === parseInt(me.id);
        const div = document.createElement('div');
        div.className = `msg ${isSent ? 'msg-out animate-fade-in' : 'msg-in animate-fade-in'}`;
        
        const timestamp = m.created_at || m.timestamp || new Date();
        const timeStr = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        div.innerHTML = `
            <div>${m.message}</div>
            <div style="font-size:9px;opacity:0.5;text-align:right;margin-top:4px;">${timeStr}</div>
        `;
        elements.box.appendChild(div);
    }

    function autoScroll() {
        elements.box.scrollTop = elements.box.scrollHeight;
    }

    const sendMessage = async () => {
        const msg = elements.input.value.trim();
        if (!msg || !currentRoomId) return;

        const payload = {
            roomId: currentRoomId,
            message: msg,
            senderId: me.id,
            username: me.username
        };

        if (window.Blink.socket) {
            window.Blink.socket.emit('sendMessage', payload);
        }

        elements.input.value = '';
        elements.input.focus();
    };

    if (elements.sendBtn) elements.sendBtn.onclick = sendMessage;
    if (elements.input) {
        elements.input.onkeydown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                sendMessage();
            }
        };
    }

    // Back button for mobile
    if (elements.backBtn) {
        elements.backBtn.onclick = () => {
            elements.thread.classList.remove('active');
            elements.chatList.classList.add('active');
        };
    }

    // Socket Listeners
    const initSocket = () => {
        const socket = window.Blink.socket;
        if (!socket) return;

        socket.on('receiveMessage', (data) => {
            if (data.roomId === currentRoomId) {
                appendMessage(data);
                autoScroll();
            }
            loadConversations();
        });
    };

    // ── INITIALIZE ────────────────────────────────────────────
    await loadConversations();
    
    // Check if redirecting to a specific chat
    const startUid = new URLSearchParams(window.location.search).get('start');
    if (startUid) {
        try {
            const data = await apiRequest(`/users/${startUid}`);
            if (data.user) {
                const u = data.user;
                const avatar = (u.profile_pic || u.avatar_url) ? `<img src="${u.profile_pic || u.avatar_url}" alt="${u.username}" class="avatar">` : u.username[0].toUpperCase();
                openChat(u.id, u.username, avatar);
            }
        } catch {}
    }

    // Socket check
    const checker = setInterval(() => {
        if (window.Blink.socket) {
            initSocket();
            clearInterval(checker);
        }
    }, 500);
});
