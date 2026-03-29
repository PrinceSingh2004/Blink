/**
 * frontend/js/messages_realtime.js
 * ═══════════════════════════════════════════════════════════════════════════════
 * Real-time Direct Messaging with Socket.io
 * ═══════════════════════════════════════════════════════════════════════════════
 */

class BlinkMessenger {
    constructor() {
        this.socket = null;
        this.currentConversation = null;
        this.messageHistory = [];
        this.onlineUsers = new Set();
        this.init();
    }

    /**
     * Initialize Socket.io connection
     */
    async init() {
        try {
            const token = window.BlinkConfig.getToken();
            if (!token) {
                console.log('Not authenticated - messaging disabled');
                return;
            }

            const IO = (typeof io !== 'undefined') ? io : null;
            if (!IO) {
                console.error('Socket.io not loaded');
                return;
            }

            this.socket = IO(window.BlinkConfig.SOCKET_URL, {
                auth: { token },
                transports: ['websocket', 'polling'],
                reconnection: true,
                reconnectionDelay: 1000,
                reconnectionDelayMax: 5000,
                reconnectionAttempts: 5
            });

            this.setupEvents();
            console.log('✅ Real-time messaging initialized');

        } catch (error) {
            console.error('❌ Messenger init error:', error);
        }
    }

    /**
     * Setup Socket.io event listeners
     */
    setupEvents() {
        this.socket.on('connect', () => {
            console.log('✅ Connected to messaging server');
        });

        this.socket.on('user-online', (data) => {
            this.onlineUsers.add(data.userId);
            this.updateOnlineStatus(data.userId, true);
            console.log(`✅ ${data.username} is online`);
        });

        this.socket.on('user-offline', (data) => {
            this.onlineUsers.delete(data.userId);
            this.updateOnlineStatus(data.userId, false);
            console.log(`❌ ${data.username} is offline`);
        });

        this.socket.on('receive-message', (data) => {
            this.handleIncomingMessage(data);
        });

        this.socket.on('message-sent', (data) => {
            console.log('✅ Message delivered:', data);
            this.updateMessageStatus();
        });

        this.socket.on('message-error', (data) => {
            console.error('❌ Message error:', data.error);
            alert('Failed to send message');
        });

        this.socket.on('user-typing', (data) => {
            this.showTypingIndicator(data);
        });

        this.socket.on('user-stop-typing', (data) => {
            this.hideTypingIndicator(data);
        });

        this.socket.on('receive-notification', (data) => {
            this.handleNotification(data);
        });
    }

    /**
     * Send direct message
     */
    async sendMessage(recipientId, message) {
        try {
            if (!this.socket || !message.trim()) {
                return;
            }

            console.log(`📤 Sending to ${recipientId}:`, message);

            this.socket.emit('send-message', {
                recipientId,
                message: message.trim()
            });

            // Add to local history
            this.messageHistory.push({
                senderId: window.BlinkConfig.getUser().id,
                recipientId,
                message,
                sentAt: new Date(),
                delivered: false
            });

            // Update UI
            this.displayMessage({
                senderId: window.BlinkConfig.getUser().id,
                senderUsername: window.BlinkConfig.getUser().username,
                message,
                sentAt: new Date()
            });

        } catch (error) {
            console.error('❌ Send error:', error);
        }
    }

    /**
     * Handle incoming message
     */
    handleIncomingMessage(data) {
        console.log('📥 Received message:', data);

        this.messageHistory.push({
            senderId: data.senderId,
            senderUsername: data.senderUsername,
            message: data.message,
            sentAt: data.sentAt,
            delivered: true
        });

        // Play notification sound
        this.playNotificationSound();

        // Update UI
        this.displayMessage(data);

        // Show notification
        if (document.hidden) {
            this.showNotification(
                `New message from ${data.senderUsername}`,
                data.message
            );
        }
    }

    /**
     * Display message in chat
     */
    displayMessage(data) {
        const messagesContainer = document.getElementById('messages-container');
        if (!messagesContainer) return;

        const isOwn = data.senderId === window.BlinkConfig.getUser().id;

        const messageEl = document.createElement('div');
        messageEl.className = `message ${isOwn ? 'own' : 'other'}`;
        messageEl.innerHTML = `
            <div class="message-content">
                <p class="message-text">${this.escapeHTML(data.message)}</p>
                <span class="message-time">${this.formatTime(data.sentAt)}</span>
            </div>
        `;

        messagesContainer.appendChild(messageEl);

        // Auto-scroll to bottom
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    /**
     * Load previous message history
     */
    async loadMessageHistory(userId, limit = 50) {
        try {
            const response = await window.BlinkConfig.fetch(`/messages/conversation/${userId}?limit=${limit}`);
            const data = await response.json();

            if (data.messages) {
                this.messageHistory = data.messages;
                this.renderMessageHistory();
            }

        } catch (error) {
            console.error('❌ Load history error:', error);
        }
    }

    /**
     * Render message history
     */
    renderMessageHistory() {
        const messagesContainer = document.getElementById('messages-container');
        if (!messagesContainer) return;

        messagesContainer.innerHTML = '';

        this.messageHistory.forEach(msg => {
            this.displayMessage(msg);
        });
    }

    /**
     * Show typing indicator
     */
    showTypingIndicator(data) {
        const typingEl = document.getElementById('typing-indicator');
        if (typingEl) {
            typingEl.innerHTML = `<i>${data.username} is typing...</i>`;
            typingEl.style.display = 'block';
        }
    }

    /**
     * Hide typing indicator
     */
    hideTypingIndicator(data) {
        const typingEl = document.getElementById('typing-indicator');
        if (typingEl) {
            typingEl.style.display = 'none';
        }
    }

    /**
     * Handle notifications
     */
    handleNotification(data) {
        console.log('🔔 Notification:', data);

        const message = `${data.fromUsername} ${data.message}`;
        this.showNotification(message, data.type);

        // Show in-app notification
        const notifEl = document.createElement('div');
        notifEl.className = 'notification in-app-notification';
        notifEl.innerHTML = `
            <div class="notification-content">
                <strong>${data.fromUsername}</strong>
                <p>${data.message}</p>
            </div>
        `;

        document.body.appendChild(notifEl);

        setTimeout(() => {
            notifEl.remove();
        }, 5000);
    }

    /**
     * Update online status display
     */
    updateOnlineStatus(userId, isOnline) {
        const statusEl = document.querySelector(`[data-user-id="${userId}"] .status-indicator`);
        if (statusEl) {
            statusEl.className = `status-indicator ${isOnline ? 'online' : 'offline'}`;
        }
    }

    /**
     * Update message status (delivered, seen)
     */
    updateMessageStatus() {
        const messages = document.querySelectorAll('.message.own');
        messages.forEach(msg => {
            const statusEl = msg.querySelector('.status');
            if (statusEl) {
                statusEl.textContent = '✓✓';
                statusEl.title = 'Delivered';
            }
        });
    }

    /**
     * Play notification sound
     */
    playNotificationSound() {
        const audio = new Audio('data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAAB9AAACABAAZGF0YQIAAAAAAA==');
        audio.play().catch(() => {
            // Sound not available or blocked
        });
    }

    /**
     * Show browser notification
     */
    showNotification(title, message) {
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(title, {
                body: message,
                icon: '/favicon.ico'
            });
        }
    }

    /**
     * Format time
     */
    formatTime(date) {
        const d = new Date(date);
        return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    }

    /**
     * Escape HTML
     */
    escapeHTML(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Request notification permission
     */
    static requestNotificationPermission() {
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }
}

// Initialize messenger
document.addEventListener('DOMContentLoaded', () => {
    window.BlinkMessenger = new BlinkMessenger();

    // Request notification permission
    BlinkMessenger.requestNotificationPermission();

    // Setup message input
    const messageInput = document.getElementById('message-input');
    const sendBtn = document.getElementById('send-btn');

    if (messageInput && sendBtn) {
        sendBtn.addEventListener('click', () => {
            const recipientId = document.querySelector('[data-current-recipient-id]')?.dataset.currentRecipientId;
            if (recipientId) {
                window.BlinkMessenger.sendMessage(recipientId, messageInput.value);
                messageInput.value = '';
            }
        });

        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendBtn.click();
            }
        });
    }

    console.log('✅ Real-time messaging module loaded');
});
