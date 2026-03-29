const pool = require('../db/config');

module.exports = (io) => {
    io.on('connection', (socket) => {
        console.log('Socket connected:', socket.id);

        socket.on('join_live', (streamId) => {
            socket.join(streamId);
            console.log(`Socket ${socket.id} joined live ${streamId}`);
        });

        // Chat
        socket.on('live_chat', (data) => {
            // data: { streamId, user, text }
            io.to(data.streamId).emit('live_chat', data);
        });

        // WebRTC Signaling
        socket.on('offer', (data) => {
            socket.to(data.streamId).emit('offer', data);
        });

        socket.on('answer', (data) => {
            socket.to(data.streamId).emit('answer', data);
        });

        socket.on('ice_candidate', (data) => {
            socket.to(data.streamId).emit('ice_candidate', data);
        });

        socket.on('disconnect', () => {
            console.log('Socket disconnected', socket.id);
        });
    });
};
