/* message.js – Messages/Chat Page */
document.addEventListener('DOMContentLoaded', async () => {
const { getToken, getUser, requireAuth, apiRequest, showToast, populateSidebar } = window.Blink;

if (!requireAuth()) return;
await populateSidebar();


const me           = getUser();
const convList     = document.getElementById('convList');
const messagesArea = document.getElementById('messagesArea');
const chatInput    = document.getElementById('chatInput');
const sendBtn      = document.getElementById('sendMsgBtn');
const chatHeader   = document.getElementById('chatHeader');
const convSearch   = document.getElementById('convSearch');

let activeUserId   = null;
let socket         = null;

// ── Format time ───────────────────────────────────────────────
function fmtTime(dateStr) {
    return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ── Load conversations ────────────────────────────────────────
async function loadConversations() {
    try {
        const data = await apiRequest('/messages/conversations');
        renderConversations(data.conversations || []);
    } catch { showToast('Failed to load conversations', 'error'); }
}

function renderConversations(convs) {
    if (!convs.length) {
        convList.innerHTML = '<div style="padding:40px 20px;text-align:center;color:var(--text-secondary)"><div style="font-size:40px;margin-bottom:12px">💬</div><p>No messages yet</p></div>';
        return;
    }
    convList.innerHTML = convs.map(c => {
        const av = c.profile_picture
            ? `<img src="${c.profile_picture}" alt="${c.username}">`
            : c.username[0].toUpperCase();
        const unread = c.unread_count > 0 ? `<div class="unread-badge">${c.unread_count}</div>` : '';

        return `
        <div class="conv-item" data-uid="${c.id}" data-username="${c.username}">
            <div class="conv-avatar">
                ${av}
                <div class="conv-online-indicator" data-online-user-id="${c.id}"></div>
            </div>
            <div class="conv-info">
                <div class="conv-name">@${c.username}</div>
                <div class="conv-preview">${c.message_text || ''}</div>
            </div>
            <div class="conv-meta">${unread}</div>
        </div>`;
    }).join('');


    convList.querySelectorAll('.conv-item').forEach(el => {
        el.addEventListener('click', () => openChat(el.dataset.uid, el.dataset.username));
        // Also check status for this user
        if (socket) socket.emit('check_status', el.dataset.uid);
    });
}

// ── Open chat ─────────────────────────────────────────────────
async function openChat(userId, username) {
    activeUserId = userId;
    window.__activeChatId = userId; // For the profile link in messages.html
    // Mark active
    convList.querySelectorAll('.conv-item').forEach(el => el.classList.remove('active'));
    convList.querySelector(`[data-uid="${userId}"]`)?.classList.add('active');

    // Update header
    chatHeader.style.display = 'flex';
    document.getElementById('chatHeaderName').textContent   = '@' + username;
    document.getElementById('chatHeaderAvatar').textContent = username[0].toUpperCase();
    const chatMain = document.getElementById('chatMain');
    if (chatMain) chatMain.style.display = 'flex';
    document.getElementById('noChatSelected')?.style && (document.getElementById('noChatSelected').style.display = 'none');

    // Mark as read
    apiRequest(`/messages/${userId}/read`, { method: 'PATCH' }).catch(() => {});

    // Load messages
    messagesArea.innerHTML = '<div style="display:flex;justify-content:center;padding:40px"><div class="spinner"></div></div>';
    try {
        const data = await apiRequest(`/messages/${userId}`);
        renderMessages(data.messages || []);
    } catch { showToast('Failed to load messages', 'error'); }

    // Socket.io room
    if (socket) {
        const room = [me.id, userId].sort().join('_');
        socket.emit('join_room', room);
        socket.emit('check_status', userId);
    }
}

function renderMessages(msgs) {
    if (!msgs.length) {
        messagesArea.innerHTML = '<div style="text-align:center;padding:60px 20px;color:var(--text-muted)">👋 Start the conversation!</div>';
        return;
    }
    messagesArea.innerHTML = msgs.map(m => {
        const isSent = parseInt(m.sender_id) === parseInt(me.id);
        return `<div class="msg-bubble ${isSent ? 'sent' : 'received'}">${m.message_text}<div class="msg-time">${fmtTime(m.created_at)}</div></div>`;
    }).join('');
    messagesArea.scrollTop = messagesArea.scrollHeight;
}

function appendMessage(text, sent) {
    const div = document.createElement('div');
    div.className = `msg-bubble ${sent ? 'sent' : 'received'}`;
    div.innerHTML = `${text}<div class="msg-time">${new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}</div>`;
    messagesArea.appendChild(div);
    messagesArea.scrollTop = messagesArea.scrollHeight;
}

// ── Send message ──────────────────────────────────────────────
async function sendMessage() {
    const text = chatInput?.value.trim();
    if (!text || !activeUserId) return;
    chatInput.value = '';
    appendMessage(text, true);
    try {
        await apiRequest(`/messages/${activeUserId}`, {
            method: 'POST',
            body:   JSON.stringify({ message_text: text })
        });
    } catch (err) { showToast(err.message, 'error'); }
}

sendBtn?.addEventListener('click', sendMessage);
chatInput?.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } });

// ── Search conversations ──────────────────────────────────────
convSearch?.addEventListener('input', function () {
    const q = this.value.toLowerCase();
    convList.querySelectorAll('.conv-item').forEach(el => {
        const name = el.dataset.username?.toLowerCase() || '';
        el.style.display = name.includes(q) ? '' : 'none';
    });
});

// ── New message modal ─────────────────────────────────────────
const newMsgModal    = document.getElementById('newMsgModal');
const newMsgInput    = document.getElementById('newMsgUsername');
const modalCancelBtn = document.getElementById('modalCancelBtn');
const modalStartBtn  = document.getElementById('modalStartBtn');

function openModal() {
    newMsgModal.classList.add('active');
    newMsgInput.value = '';
    setTimeout(() => newMsgInput.focus(), 100);
}

function closeModal() {
    newMsgModal.classList.remove('active');
}

document.getElementById('newMsgBtn')?.addEventListener('click', openModal);
modalCancelBtn?.addEventListener('click', closeModal);

newMsgModal?.addEventListener('click', (e) => {
    if (e.target === newMsgModal) closeModal();
});

async function startConversation(username) {
    if (!username) {
        showToast('Please enter a username', 'error');
        return;
    }
    
    try {
        modalStartBtn.disabled = true;
        modalStartBtn.textContent = 'Searching...';
        
        const data = await apiRequest(`/users/search?q=${encodeURIComponent(username)}`);
        const users = data.users || [];
        
        if (!users.length) { 
            showToast('User not found', 'error'); 
            return; 
        }
        
        const u = users[0];
        closeModal();
        openChat(u.id, u.username);
    } catch (err) { 
        showToast(err.message || 'Search failed', 'error'); 
    } finally {
        modalStartBtn.disabled = false;
        modalStartBtn.textContent = 'Start Chat';
    }
}

modalStartBtn?.addEventListener('click', () => {
    startConversation(newMsgInput.value.trim());
});


newMsgInput?.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
        e.preventDefault();
        modalStartBtn.click();
    }
    if (e.key === 'Escape') closeModal();
});



// ── Online Status UI Helper ───────────────────────────────────
function updateStatusUI(status) {
    const statusEl = document.querySelector('.chat-header-status');
    if (!statusEl) return;
    
    if (status === 'online') {
        statusEl.textContent = '● Online';
        statusEl.style.color = 'var(--green)';
    } else {
        statusEl.textContent = '● Offline';
        statusEl.style.color = 'var(--text-muted)';
    }
}

// ── Socket.io (real-time) ─────────────────────────────────────
async function setupSocket() {
    // Wait for the global socket to be initialized by auth.js
    let attempts = 0;
    while (!window.Blink.socket && attempts < 20) {
        await new Promise(r => setTimeout(r, 100));
        attempts++;
    }

    socket = window.Blink.socket;
    if (!socket) {
        console.error('[Messages] Global socket not found');
        return;
    }

    socket.on('receive_message', data => {
        if (parseInt(data.sender_id) === parseInt(activeUserId)) {
            appendMessage(data.message_text, false);
        }
        loadConversations();
    });

    // We also use the global status listener in auth.js, 
    // but if we want specific logic for the chat header:
    socket.on('user_status', data => {
        if (parseInt(data.userId) === parseInt(activeUserId)) {
            updateStatusUI(data.status);
        }
    });


    if (activeUserId) {
        const room = [me.id, activeUserId].sort().join('_');
        socket.emit('join_room', room);
        socket.emit('check_status', activeUserId);
    }

    // Check status for all listed conversations
    document.querySelectorAll('[data-online-user-id]').forEach(el => {
        socket.emit('check_status', el.dataset.onlineUserId);
    });
}

// ── Boot ──────────────────────────────────────────────────────
loadConversations();
setupSocket();

}); // end DOMContentLoaded

