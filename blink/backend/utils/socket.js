/**
 * utils/socket.js — Socket.IO Real-time Logic
 * ═══════════════════════════════════════════════════
 */

const { Server } = require('socket.io');

const userSockets = new Map(); // userId -> [socketIds]

let io;

const initSocket = (server) => {
    io = new Server(server, {
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
            socket.join(`user_${userId}`);
            
            // Broadcast online status
            io.emit('online_status', { userId, status: 'online' });
            console.log(`👤 User ${userId} joined room user_${userId}`);
        });

        socket.on('join_room', (convId) => {
            socket.join(`conv_${convId}`);
            console.log(`🏠 Socket ${socket.id} joined room conv_${convId}`);
        });

        socket.on('send_message', (data) => {
            // Data should have: conversationId, senderId, message, receiverId
            const { conversationId, senderId, message, receiverId } = data;
            
            const msgToEmit = { 
                conversationId, 
                sender_id: senderId, 
                receiver_id: receiverId,
                message, 
                created_at: new Date() 
            };

            // Emit to conversation room (for users currently in the chat)
            io.to(`conv_${conversationId}`).emit('receive_message', msgToEmit);

            // Emit notification/message to receiver's user room
            io.to(`user_${receiverId}`).emit('receive_message', msgToEmit);
            io.to(`user_${receiverId}`).emit('new_message_notification', msgToEmit);
        });

        socket.on('typing', (data) => {
            const { conversationId, userId, isTyping } = data;
            socket.to(`conv_${conversationId}`).emit('user_typing', { userId, isTyping });
        });

        socket.on('seen', (data) => {
            const { conversationId, userId } = data;
            socket.to(`conv_${conversationId}`).emit('message_seen', { conversationId, userId });
        });

        socket.on('disconnect', () => {
            if (socket.userId) {
                io.emit('online_status', { userId: socket.userId, status: 'offline' });
                console.log(`👤 User ${socket.userId} is offline`);
            }
            console.log('🔌 Socket disconnected:', socket.id);
        });
    });

    return io;
};

const getIO = () => io;

module.exports = { initSocket, getIO };
