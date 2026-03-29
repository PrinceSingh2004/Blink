/**
 * socket/index.js – Unified Socket.IO Handler
 * Handles: Real-time chat, notifications, live streaming (WebRTC signaling)
 */
const jwt = require('jsonwebtoken');
const { saveMessage } = require('../controllers/messageController');
const pool = require('../db/config');

// Online users map: userId -> socketId
const onlineUsers = new Map();

module.exports = (io) => {

    // ── AUTH MIDDLEWARE ─────────────────────────────────────────
    io.use((socket, next) => {
        const token = socket.handshake.auth?.token || socket.handshake.query?.token;
        if (token) {
            try {
                socket.user = jwt.verify(token, process.env.JWT_SECRET);
            } catch { /* unauth socket – still allow for public live */ }
        }
        next();
    });

    io.on('connection', (socket) => {
        console.log(`[Socket] Connected: ${socket.id}`);

        // ── IDENTIFY USER ──────────────────────────────────────
        socket.on('identify', (userId) => {
            socket.userId = parseInt(userId, 10);
            onlineUsers.set(socket.userId, socket.id);
            socket.join(`user_${socket.userId}`);
            io.emit('user_online', { userId: socket.userId });
            console.log(`[Socket] User ${socket.userId} identified`);
        });

        // ── JOIN CHAT ROOM ─────────────────────────────────────
        socket.on('joinRoom', (roomId) => {
            socket.join(roomId);
            console.log(`[Socket] ${socket.id} joined room ${roomId}`);
        });

        // ── SEND MESSAGE ───────────────────────────────────────
        socket.on('sendMessage', async (data) => {
            const { roomId, message, senderId, username, avatar } = data;
            if (!roomId || !message?.trim()) return;

            const msgId = await saveMessage(roomId, senderId, message.trim());

            const payload = {
                id:        msgId,
                roomId,
                senderId,
                username,
                avatar,
                message:   message.trim(),
                timestamp: new Date().toISOString()
            };

            // Broadcast to room
            io.to(roomId).emit('receiveMessage', payload);
        });

        // ── TYPING INDICATOR ───────────────────────────────────
        socket.on('typing', (data) => {
            socket.to(data.roomId).emit('userTyping', {
                username: data.username,
                typing:   data.isTyping
            });
        });

        // ── MARK SEEN ──────────────────────────────────────────
        socket.on('markSeen', async ({ roomId, userId }) => {
            try {
                await pool.query(
                    'UPDATE messages SET is_read = 1 WHERE room_id = ? AND sender_id != ?',
                    [roomId, userId]
                );
                socket.to(roomId).emit('msgSeen', { roomId, userId });
            } catch (e) {}
        });

        // ── LIVE STREAMING ─────────────────────────────────────
        socket.on('join_live', async (streamId) => {
            socket.join(`live_${streamId}`);
            // Increment viewer count
            try {
                await pool.query(
                    'UPDATE live_streams SET viewers = viewers + 1 WHERE id = ?',
                    [streamId]
                );
                const [[s]] = await pool.query('SELECT viewers FROM live_streams WHERE id = ?', [streamId]);
                io.to(`live_${streamId}`).emit('viewer_count', { count: s?.viewers || 0 });
            } catch (e) {}
        });

        socket.on('leave_live', async (streamId) => {
            socket.leave(`live_${streamId}`);
            try {
                await pool.query(
                    'UPDATE live_streams SET viewers = GREATEST(viewers - 1, 0) WHERE id = ?',
                    [streamId]
                );
                const [[s]] = await pool.query('SELECT viewers FROM live_streams WHERE id = ?', [streamId]);
                io.to(`live_${streamId}`).emit('viewer_count', { count: s?.viewers || 0 });
            } catch (e) {}
        });

        socket.on('live_chat', async (data) => {
            const { streamId, user, text } = data;
            // Save to DB
            try {
                await pool.query(
                    'INSERT INTO live_chat (stream_id, user_id, username, text) VALUES (?, ?, ?, ?)',
                    [streamId, user?.id || 0, user?.username || 'Guest', text]
                );
            } catch (e) {}
            io.to(`live_${streamId}`).emit('live_chat', {
                user,
                text,
                timestamp: new Date().toISOString()
            });
        });

        // WebRTC Signaling
        socket.on('offer', (data) => {
            socket.to(`live_${data.streamId}`).emit('offer', data);
        });

        socket.on('answer', (data) => {
            socket.to(`live_${data.streamId}`).emit('answer', data);
        });

        socket.on('ice_candidate', (data) => {
            socket.to(`live_${data.streamId}`).emit('ice_candidate', data);
        });

        // ── NOTIFICATION PUSH ──────────────────────────────────
        socket.on('notify', ({ targetUserId, notification }) => {
            io.to(`user_${targetUserId}`).emit('notification', notification);
        });

        // ── DISCONNECT ─────────────────────────────────────────
        socket.on('disconnect', async () => {
            if (socket.userId) {
                onlineUsers.delete(socket.userId);
                io.emit('user_offline', { userId: socket.userId });
                // Update last_seen
                try {
                    await pool.query('UPDATE users SET last_seen = NOW() WHERE id = ?', [socket.userId]);
                } catch (e) {}
            }
            console.log(`[Socket] Disconnected: ${socket.id}`);
        });
    });

    // Expose online users helper
    io.getOnlineUsers = () => Array.from(onlineUsers.keys());
};
