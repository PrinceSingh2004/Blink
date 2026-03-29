/* ═══════════════════════════════════════════════════════════════════════════════
   BLINK v4.0 - REAL-TIME MESSAGING MODULE
   Socket.io chat, message history, typing indicators
   ═══════════════════════════════════════════════════════════════════════════════ */

class RealtimeMessenger {
    constructor() {
        this.currentConversation = null;
        this.socket = window.Blink?.socket || null;
        this.conversations = [];
        this.isTyping = false;
        this.typingTimeout = null;
    }

    /**
     * Initialize messaging page
     */
    init() {
        if (!window.auth?.requireAuth?.()) return;

        this.setupSocket();
        this.setupEventListeners();
        this.loadConversations();
    }

    /**
     * Setup Socket.io connection
     */
    setupSocket() {
        if (!this.socket) {
            console.warn('Socket.io not connected');
            return;
        }

        // Receive message
        this.socket.on('receive-message', (data) => {
            this.handleNewMessage(data);
        });

        // Message sent confirmation
        this.socket.on('message-sent', (data) => {
            this.updateMessageStatus(data);
        });

        // Typing indicator
        this.socket.on('typing', (data) => {
            this.showTypingIndicator(data);
        });

        // User online/offline
        this.socket.on('user-online', (data) => {
            this.updateUserStatus(data.userId, 'online');
        });

        this.socket.on('user-offline', (data) => {
            this.updateUserStatus(data.userId, 'offline');
        });
    }

    /**
     * Load conversations
     */
    async loadConversations() {
        try {
            const response = await window.api?.getConversations?.(1);
            if (response?.conversations) {
                this.conversations = response.conversations;
                this.displayConversations();
            }
        } catch (error) {
            console.error('Failed to load conversations:', error);
        }
    }

    /**
     * Display conversations in list
     */
    displayConversations() {
        const messagesList = document.querySelector('.messages-list');
        if (!messagesList) return;

        if (this.conversations.length === 0) {
            messagesList.innerHTML = `
                <div class="empty-state" style="height: 100%;">
                    <i class="bi bi-chat"></i>
                    <p>No conversations yet</p>
                </div>
            `;
            return;
        }

        messagesList.innerHTML = this.conversations.map(conv => `
            <div class="message-item" data-user-id="${conv.user.id}" onclick="window.messenger.openConversation('${conv.user.id}')">
                <div class="message-avatar">
                    ${conv.user.profile_photo 
                        ? `<img src="${conv.user.profile_photo}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`
                        : conv.user.username[0].toUpperCase()
                    }
                </div>
                <div class="message-preview">
                    <div class="message-username">${conv.user.username}</div>
                    <div class="message-text">${conv.last_message || 'No messages'}</div>
                </div>
            </div>
        `).join('');
    }

    /**
     * Open conversation with user
     */
    async openConversation(userId) {
        try {
            window.app?.showLoading?.();

            const response = await window.api?.getMessages?.(userId);
            if (response?.messages) {
                this.currentConversation = {
                    userId,
                    messages: response.messages,
                    user: response.user
                };

                this.displayConversation();
                this.updateMessageItemUI(userId);
            }

            window.app?.hideLoading?.();
        } catch (error) {
            window.app?.hideLoading?.();
            window.app?.showError?.('Failed to load conversation');
        }
    }

    /**
     * Display conversation thread
     */
    displayConversation() {
        if (!this.currentConversation) return;

        const threadHeader = document.querySelector('.thread-header');
        const messagesScroll = document.querySelector('.messages-scroll');

        if (threadHeader && this.currentConversation.user) {
            threadHeader.innerHTML = `
                <button class="back-btn" onclick="window.messenger.closeConversation()">
                    <i class="bi bi-chevron-left"></i>
                </button>
                <div style="flex: 1;">
                    <div style="font-weight: 600;">${this.currentConversation.user.username}</div>
                    <div style="font-size: 0.85rem; color: var(--text-secondary);" id="userStatus">Online</div>
                </div>
            `;
        }

        if (messagesScroll) {
            messagesScroll.innerHTML = this.currentConversation.messages.map(msg => `
                <div class="message-bubble ${msg.sender_id === window.auth?.getUser?.()?.id ? 'own' : ''}">
                    <div class="message-content">${msg.text}</div>
                    <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.25rem;">
                        ${new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                </div>
            `).join('');

            // Scroll to bottom
            messagesScroll.scrollTop = messagesScroll.scrollHeight;
        }

        // Show message input
        const inputArea = document.querySelector('.message-input-area');
        if (inputArea) {
            inputArea.style.display = 'flex';
        }
    }

    /**
     * Close conversation
     */
    closeConversation() {
        this.currentConversation = null;
        const inputArea = document.querySelector('.message-input-area');
        if (inputArea) {
            inputArea.style.display = 'none';
        }
    }

    /**
     * Send message
     */
    async sendMessage(text) {
        if (!text.trim() || !this.currentConversation) return;

        const input = document.querySelector('.message-input-area input');
        if (input) input.value = '';

        // Emit to Socket.io
        this.socket?.emit('send-message', {
            recipientId: this.currentConversation.userId,
            text: text.trim()
        });
    }

    /**
     * Handle new incoming message
     */
    handleNewMessage(data) {
        const message = {
            id: data.id || Date.now(),
            sender_id: data.senderId,
            text: data.text,
            created_at: new Date().toISOString()
        };

        // Add to current conversation if it's from this user
        if (this.currentConversation?.userId === data.senderId) {
            this.currentConversation.messages.push(message);
            this.displayConversation();
        }

        // Update conversation list
        this.loadConversations();

        // Show notification
        window.app?.showSuccess?.(`New message from ${data.senderUsername}`);
    }

    /**
     * Update message delivery status
     */
    updateMessageStatus(data) {
        const messageElements = document.querySelectorAll('.message-bubble.own');
        if (messageElements.length > 0) {
            const lastBubble = messageElements[messageElements.length - 1];
            if (lastBubble) {
                lastBubble.classList.add('sent');
            }
        }
    }

    /**
     * Show typing indicator
     */
    showTypingIndicator(data) {
        const messagesScroll = document.querySelector('.messages-scroll');
        if (!messagesScroll || data.userId === window.auth?.getUser?.()?.id) return;

        // Check if typing indicator already exists
        let indicator = messagesScroll.querySelector('.typing-indicator');
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.className = 'typing-indicator';
            indicator.innerHTML = `
                <div style="color: var(--text-secondary); font-size: 0.85rem;">
                    <span>${data.username} is typing</span>
                    <span style="animation: blink 1.4s infinite;">.</span>
                    <span style="animation: blink 1.4s infinite 0.2s;">.</span>
                    <span style="animation: blink 1.4s infinite 0.4s;">.</span>
                </div>
            `;
            messagesScroll.appendChild(indicator);
        }

        // Clear timeout if exists
        if (this.typingTimeout) {
            clearTimeout(this.typingTimeout);
        }

        // Remove after 3 seconds of inactivity
        this.typingTimeout = setTimeout(() => {
            indicator?.remove();
        }, 3000);
    }

    /**
     * Update user status
     */
    updateUserStatus(userId, status) {
        if (this.currentConversation?.userId === userId) {
            const statusEl = document.getElementById('userStatus');
            if (statusEl) {
                statusEl.textContent = status === 'online' ? '🟢 Online' : '⚫ Offline';
            }
        }
    }

    /**
     * Update message item UI
     */
    updateMessageItemUI(userId) {
        document.querySelectorAll('.message-item').forEach(item => {
            if (item.dataset.userId === userId) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        const messageInput = document.querySelector('.message-input-area input');
        const sendBtn = document.querySelector('.message-input-area button');

        if (messageInput) {
            messageInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendMessage(messageInput.value);
                }

                // Send typing indicator
                this.socket?.emit('typing', {
                    recipientId: this.currentConversation?.userId,
                    username: window.auth?.getUser?.()?.username
                });
            });
        }

        if (sendBtn) {
            sendBtn.addEventListener('click', () => {
                const text = messageInput?.value || '';
                this.sendMessage(text);
            });
        }
    }
}

// Create global instance
window.messenger = new RealtimeMessenger();

export default window.messenger;
