/**
 * socket/socketHandler.js
 * ═══════════════════════════════════════════════════════════════════════════════
 * Real-time WebSocket Handler
 * Features: Direct messaging, Live streaming with WebRTC, Notifications, Presence
 * ═══════════════════════════════════════════════════════════════════════════════
 */

const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const pool = require('../config/db');

// Track online users and active streams
const onlineUsers = new Map(); // userId -> { socketId, username }
const liveStreams = new Map(); // streamId -> { userId, username, viewers: Set, rtcOffer }
const userConnections = new Map(); // userId -> Set of socketIds

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * SOCKET.IO INITIALIZATION
 * ═══════════════════════════════════════════════════════════════════════════════
 */
const initSocket = (server) => {
    const io = new Server(server, {
        cors: {
            origin: '*',
            methods: ['GET', 'POST'],
            credentials: false
        },
        transports: ['websocket', 'polling'],
        pingInterval: 25000,
        pingTimeout: 60000
    });

    /**
     * ═══════════════════════════════════════════════════════════════════════════
     * AUTHENTICATION MIDDLEWARE
     * ═══════════════════════════════════════════════════════════════════════════
     */
    io.use((socket, next) => {
        const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.split(' ')[1];

        if (!token) {
            return next(new Error('Authentication error'));
        }

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'blink_default_secret');
            socket.userId = decoded.id;
            socket.username = decoded.username;
            next();
        } catch (e) {
            next(new Error('Invalid token'));
        }
    });

    /**
     * ═══════════════════════════════════════════════════════════════════════════
     * CONNECTION & DISCONNECTION
     * ═══════════════════════════════════════════════════════════════════════════
     */
    io.on('connection', async (socket) => {
        const { userId, username } = socket;
        console.log(`✅ User connected: ${username} (${userId})`);

        // Add to online users
        onlineUsers.set(userId, { socketId: socket.id, username });

        // Track multiple connections
        if (!userConnections.has(userId)) {
            userConnections.set(userId, new Set());
        }
        userConnections.get(userId).add(socket.id);

        // Notify all users about presence
        io.emit('user-online', { userId, username });

        /**
         * ═══════════════════════════════════════════════════════════════════════
         * MESSAGING - Direct Chat
         * ═══════════════════════════════════════════════════════════════════════
         */
        socket.on('send-message', async (data) => {
            try {
                const { recipientId, message } = data;
                const sentAt = new Date();

                // Save to database
                await pool.query(
                    `INSERT INTO messages (sender_id, recipient_id, message, created_at)
                     VALUES (?, ?, ?, ?)`,
                    [userId, recipientId, message, sentAt]
                );

                // Send to specific recipient if online
                const recipientSocket = onlineUsers.get(recipientId);
                if (recipientSocket) {
                    io.to(recipientSocket.socketId).emit('receive-message', {
                        senderId: userId,
                        senderUsername: username,
                        message,
                        sentAt
                    });
                }

                // Confirmation to sender
                socket.emit('message-sent', { status: 'delivered', sentAt });

            } catch (error) {
                console.error('❌ Message error:', error.message);
                socket.emit('message-error', { error: error.message });
            }
        });

        /**
         * ═══════════════════════════════════════════════════════════════════════
         * LIVE STREAMING - Stream Management
         * ═══════════════════════════════════════════════════════════════════════
         */
        socket.on('start-stream', (data) => {
            try {
                const streamId = `stream_${userId}_${Date.now()}`;
                const roomName = `stream-${streamId}`;

                // Create stream record
                liveStreams.set(streamId, {
                    userId,
                    username,
                    startTime: new Date(),
                    viewers: new Set([userId]),
                    roomName
                });

                // Join stream room
                socket.join(roomName);

                // Notify all users about new stream
                io.emit('stream-started', {
                    streamId,
                    userId,
                    username,
                    roomName,
                    startTime: new Date()
                });

                socket.emit('stream-created', { streamId, roomName });
                console.log(`🔴 Stream started: ${username} (${streamId})`);

            } catch (error) {
                socket.emit('stream-error', { error: error.message });
            }
        });

        /**
         * JOIN LIVE STREAM
         */
        socket.on('join-stream', (data) => {
            try {
                const { streamId } = data;
                const stream = liveStreams.get(streamId);

                if (!stream) {
                    return socket.emit('stream-error', { error: 'Stream not found' });
                }

                // Add viewer
                stream.viewers.add(userId);
                const roomName = stream.roomName;
                socket.join(roomName);

                // Notify stream host about new viewer
                io.to(roomName).emit('viewer-joined', {
                    userId,
                    username,
                    viewerCount: stream.viewers.size
                });

                socket.emit('stream-joined', { streamId, roomName, viewerCount: stream.viewers.size });
                console.log(`👁️  Viewer joined: ${username} (${streamId}) - Total: ${stream.viewers.size}`);

            } catch (error) {
                socket.emit('stream-error', { error: error.message });
            }
        });

        /**
         * END LIVE STREAM
         */
        socket.on('end-stream', (data) => {
            try {
                const { streamId } = data;
                const stream = liveStreams.get(streamId);

                if (!stream) {
                    return socket.emit('stream-error', { error: 'Stream not found' });
                }

                const roomName = stream.roomName;
                const duration = Math.floor((new Date() - stream.startTime) / 1000);

                // Notify viewers
                io.to(roomName).emit('stream-ended', { streamId, duration });

                // Save stream record to DB
                pool.query(
                    `INSERT INTO live_streams (user_id, duration_seconds, viewer_count)
                     VALUES (?, ?, ?)`,
                    [userId, duration, stream.viewers.size]
                ).catch(e => console.error('DB error:', e.message));

                // Cleanup
                liveStreams.delete(streamId);
                socket.leave(roomName);

                console.log(`⚫ Stream ended: ${username} (${streamId})`);

            } catch (error) {
                socket.emit('stream-error', { error: error.message });
            }
        });

        /**
         * ═══════════════════════════════════════════════════════════════════════
         * WEBRTC SIGNALING - Peer-to-Peer Video
         * ═══════════════════════════════════════════════════════════════════════
         */
        socket.on('webrtc-offer', (data) => {
            try {
                const { targetUserId, offer } = data;
                const targetSocket = onlineUsers.get(targetUserId);

                if (!targetSocket) {
                    return socket.emit('webrtc-error', { error: 'Target user not online' });
                }

                // Send offer to target
                io.to(targetSocket.socketId).emit('webrtc-offer', {
                    fromUserId: userId,
                    fromUsername: username,
                    offer
                });

            } catch (error) {
                socket.emit('webrtc-error', { error: error.message });
            }
        });

        /**
         * WEBRTC ANSWER
         */
        socket.on('webrtc-answer', (data) => {
            try {
                const { targetUserId, answer } = data;
                const targetSocket = onlineUsers.get(targetUserId);

                if (!targetSocket) {
                    return socket.emit('webrtc-error', { error: 'Target user not online' });
                }

                io.to(targetSocket.socketId).emit('webrtc-answer', {
                    fromUserId: userId,
                    answer
                });

            } catch (error) {
                socket.emit('webrtc-error', { error: error.message });
            }
        });

        /**
         * ICE CANDIDATE EXCHANGE
         */
        socket.on('webrtc-ice-candidate', (data) => {
            try {
                const { targetUserId, candidate } = data;
                const targetSocket = onlineUsers.get(targetUserId);

                if (targetSocket) {
                    io.to(targetSocket.socketId).emit('webrtc-ice-candidate', {
                        fromUserId: userId,
                        candidate
                    });
                }

            } catch (error) {
                console.error('ICE candidate error:', error.message);
            }
        });

        /**
         * ═══════════════════════════════════════════════════════════════════════
         * NOTIFICATIONS
         * ═══════════════════════════════════════════════════════════════════════
         */
        socket.on('send-notification', (data) => {
            try {
                const { recipientId, type, message } = data;
                const recipientSocket = onlineUsers.get(recipientId);

                if (recipientSocket) {
                    io.to(recipientSocket.socketId).emit('receive-notification', {
                        type, // 'like', 'comment', 'follow', etc.
                        fromUserId: userId,
                        fromUsername: username,
                        message,
                        timestamp: new Date()
                    });
                }

                // Save to DB
                pool.query(
                    `INSERT INTO notifications (user_id, from_user_id, type, message)
                     VALUES (?, ?, ?, ?)`,
                    [recipientId, userId, type, message]
                ).catch(e => console.error('Notification DB error:', e));

            } catch (error) {
                console.error('Notification error:', error.message);
            }
        });

        /**
         * ═══════════════════════════════════════════════════════════════════════
         * TYPING INDICATOR
         * ═══════════════════════════════════════════════════════════════════════
         */
        socket.on('typing', (data) => {
            try {
                const { conversationId } = data;
                io.emit('user-typing', {
                    userId,
                    username,
                    conversationId
                });
            } catch (error) {
                console.error('Typing error:', error.message);
            }
        });

        socket.on('stop-typing', (data) => {
            try {
                const { conversationId } = data;
                io.emit('user-stop-typing', {
                    userId,
                    conversationId
                });
            } catch (error) {
                console.error('Stop typing error:', error.message);
            }
        });

        /**
         * ═══════════════════════════════════════════════════════════════════════
         * CONNECTION CLOSE
         * ═══════════════════════════════════════════════════════════════════════
         */
        socket.on('disconnect', () => {
            console.log(`❌ User disconnected: ${username} (${userId})`);

            // Remove from online users
            const connections = userConnections.get(userId);
            if (connections) {
                connections.delete(socket.id);
                if (connections.size === 0) {
                    userConnections.delete(userId);
                    onlineUsers.delete(userId);
                    io.emit('user-offline', { userId, username });
                }
            }

            // Cleanup streams if user was streaming
            for (const [streamId, stream] of liveStreams.entries()) {
                if (stream.userId === userId) {
                    io.to(stream.roomName).emit('stream-ended', {
                        streamId,
                        reason: 'Host disconnected'
                    });
                    liveStreams.delete(streamId);
                }
            }
        });

        /**
         * ═══════════════════════════════════════════════════════════════════════
         * HEARTBEAT / PING
         * ═══════════════════════════════════════════════════════════════════════
         */
        socket.on('ping', () => {
            socket.emit('pong', { timestamp: Date.now() });
        });
    });

    return io;
};

module.exports = { initSocket };
