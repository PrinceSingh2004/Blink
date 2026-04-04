/* ═══════════════════════════════════════════════════════════════════════════════
    BLINK v5.0 - REAL-TIME MESSAGING ENGINE
    Fixed alignment | Timestamps | Auto-scroll | Responsive Sidebar
    ═══════════════════════════════════════════════════════════════════════════════ */

class RealtimeMessenger {
    constructor() {
        this.currentConversation = null;
        this.socket = window.Blink?.socket || null;
        this.conversations = [];
        this.init();
    }

    init() {
        if (!window.api.isAuthenticated()) return;
        
        // Global access
        window.messenger = this;

        // Initialize UI components
        this.setupSocket();
        this.loadConversations();
        this.setupEventListeners();
    }

    setupSocket() {
        if (!this.socket) {
            console.warn('[Blink] Waiting for socket frequency...');
            setTimeout(() => {
                this.socket = window.Blink?.socket;
                if(this.socket) this.setupSocketListeners();
            }, 1000);
            return;
        }
        this.setupSocketListeners();
    }

    setupSocketListeners() {
        this.socket.on('receive-message', (data) => {
            this.handleNewMessage(data);
        });

        this.socket.on('typing', (data) => {
            if (this.currentConversation?.user.id == data.userId) {
                this.showTyping(true);
            }
        });

        this.socket.on('user-status', (data) => {
            this.updateUserStatusUI(data.userId, data.status);
        });
    }

    async loadConversations() {
        try {
            const data = await window.api.request('/messages/list');
            this.conversations = Array.isArray(data) ? data : (data.conversations || []);
            this.renderConversationList();
        } catch (err) {
            console.error("Messages list error:", err);
        }
    }

    renderConversationList() {
        const list = document.querySelector('.messages-list');
        if (!list) return;

        if (this.conversations.length === 0) {
            list.innerHTML = `
                <div class="empty-state">
                    <i class="bi bi-chat-heart"></i>
                    <p>Universe is quiet. Start a conversation!</p>
                </div>
            `;
            return;
        }

        list.innerHTML = this.conversations.map(conv => {
            const u = conv.user;
            const isOnline = conv.is_online;
            return `
                <div class="message-item ${this.currentConversation?.user.id == u.id ? 'active' : ''}" 
                     onclick="window.messenger.openChat(${u.id}, '${u.username}', '${u.profile_pic || ''}')">
                    <div class="message-avatar">
                        <img src="${u.profile_pic || u.profile_photo || window.profile.getFallbackAvatar(u.username)}" alt="${u.username}">
                        ${isOnline ? '<span class="status-dot"></span>' : ''}
                    </div>
                    <div class="message-preview">
                        <div class="message-username">${u.username}</div>
                        <div class="message-text">${conv.last_message || 'New conversation'}</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    async openChat(userId, username, avatar) {
        try {
            // UI Transition for Mobile
            document.querySelector('.messages-list').classList.add('hidden');
            document.querySelector('.message-thread').classList.add('active');

            window.app.showLoading();
            const data = await window.api.request(`/messages/conversation/${userId}`);
            
            this.currentConversation = {
                user: { id: userId, username, avatar },
                messages: Array.isArray(data) ? data : (data.messages || [])
            };

            this.renderThread();
            this.scrollToBottom();
            
            // Mark active in list
            this.renderConversationList();
        } catch (err) {
            window.app.showError("Failed to open frequency.");
        } finally {
            window.app.hideLoading();
        }
    }

    renderThread() {
        const c = this.currentConversation;
        if (!c) return;

        // Header
        const header = document.querySelector('.thread-header');
        header.innerHTML = `
            <button class="back-btn" onclick="window.messenger.closeChat()">
                <i class="bi bi-arrow-left"></i>
            </button>
            <div class="message-avatar" style="width:36px; height:36px;">
                <img src="${c.user.avatar || window.profile.getFallbackAvatar(c.user.username)}">
            </div>
            <div class="user-info">
                <div class="username">${c.user.username}</div>
                <div class="status-text">Active in the blink universe</div>
            </div>
        `;

        // Body
        const body = document.querySelector('.messages-scroll');
        const myId = window.api.getCurrentUser()?.id;
        
        body.innerHTML = c.messages.map(m => {
            const isOwn = m.sender_id == myId;
            return `
                <div class="message-bubble ${isOwn ? 'own' : ''}">
                    <div class="message-content">${m.text || m.content}</div>
                    <div class="message-time">
                        ${new Date(m.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </div>
                </div>
            `;
        }).join('');

        // Show Input
        document.querySelector('.message-input-area').style.display = 'flex';
    }

    async sendMessage() {
        const input = document.getElementById('messageInput');
        const text = input.value.trim();
        if(!text || !this.currentConversation) return;

        const uId = this.currentConversation.user.id;
        input.value = '';

        try {
            // Optimistic UI
            this.currentConversation.messages.push({
                sender_id: window.api.getCurrentUser()?.id,
                text: text,
                created_at: new Date().toISOString()
            });
            this.renderThread();
            this.scrollToBottom();

            // Emit via Socket
            if (this.socket) {
                this.socket.emit('send-message', {
                    recipientId: uId,
                    text: text
                });
            } else {
                // Fallback to API
                await window.api.request('/messages/send', {
                    method: 'POST',
                    body: JSON.stringify({ recipient_id: uId, text: text })
                });
            }
        } catch (err) {
            console.error("Transmission failed:", err);
            window.app.showError("Message lost in space.");
        }
    }

    handleNewMessage(data) {
        if (this.currentConversation?.user.id == data.sender_id) {
            this.currentConversation.messages.push(data);
            this.renderThread();
            this.scrollToBottom();
        } else {
            // Show notification if not in current chat
            window.app.showSuccess(`New message from ${data.sender_username || 'a user'}`);
        }
        this.loadConversations();
    }

    scrollToBottom() {
        const body = document.querySelector('.messages-scroll');
        if (body) {
            body.scrollTop = body.scrollHeight;
        }
    }

    closeChat() {
        this.currentConversation = null;
        document.querySelector('.messages-list').classList.remove('hidden');
        document.querySelector('.message-thread').classList.remove('active');
    }

    showTyping(isTyping) {
        // Implementation for typing indicator
    }

    setupEventListeners() {
        const input = document.getElementById('messageInput');
        if (input) {
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.sendMessage();
            });
        }
    }
}

// Global initialization
window.messenger = new RealtimeMessenger();
