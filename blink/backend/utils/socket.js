/**
 * utils/socket.js — Socket.IO Real-time Logic
 * ═══════════════════════════════════════════════════
 */

const { Server } = require('socket.io');

const userSockets = new Map(); // userId -> [socketIds]

const initSocket = (server) => {
    const io = new Server(server, {
        cors: {
            origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
            methods: ["GET", "POST"]
        }
    });

    io.on('connection', (socket) => {
        console.log('🔌 Socket connected:', socket.id);

        socket.on('join', (userId) => {
            if (!userId) return;
            socket.userId = userId;
            
            // Register socket
            if (userSockets.has(userId)) {
                userSockets.get(userId).add(socket.id);
            } else {
                userSockets.set(userId, new Set([socket.id]));
            }
            
            // Broadcast online status
            io.emit('online_status', { userId, status: 'online' });
            console.log(`👤 User ${userId} is online`);
        });

        socket.on('join_room', (convId) => {
            socket.join(`conv_${convId}`);
            console.log(`🏠 Socket ${socket.id} joined room conv_${convId}`);
        });

        socket.on('send_message', (data) => {
            // Data should have: conversationId, senderId, text, receiverId
            const { conversationId, senderId, text, receiverId } = data;
            
            // Emit to room
            io.to(`conv_${conversationId}`).emit('receive_message', { 
                conversationId, senderId, text, created_at: new Date() 
            });

            // Emit notification if receiver is not in room
            if (userSockets.has(receiverId)) {
                userSockets.get(receiverId).forEach(sid => {
                    io.to(sid).emit('new_message_notification', { conversationId, senderId, text });
                });
            }
        });

        socket.on('typing', (data) => {
            const { conversationId, userId, isTyping } = data;
            socket.to(`conv_${conversationId}`).emit('user_typing', { userId, isTyping });
        });

        socket.on('seen', (data) => {
            const { conversationId, messageId, userId } = data;
            socket.to(`conv_${conversationId}`).emit('message_seen', { conversationId, messageId });
        });

        socket.on('disconnect', () => {
            if (socket.userId) {
                const sids = userSockets.get(socket.userId);
                if (sids) {
                    sids.delete(socket.id);
                    if (sids.size === 0) {
                        userSockets.delete(socket.userId);
                        io.emit('online_status', { userId: socket.userId, status: 'offline' });
                        console.log(`👤 User ${socket.userId} is offline`);
                    }
                }
            }
            console.log('🔌 Socket disconnected:', socket.id);
        });
    });

    return io;
};

module.exports = { initSocket };
