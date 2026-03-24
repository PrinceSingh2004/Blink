// backend/sockets/socket.js
/**
 * Socket.io Signaling Server
 * One-to-many model: Broadcaster to multiple viewers
 */

module.exports = function(io) {
    const rooms = new Map(); // Global state for rooms

    io.on('connection', (socket) => {
        console.log(`[Socket] New connection: ${socket.id}`);

        socket.on('join-room', ({ roomId, role }) => {
            if (!roomId || !role) return;

            socket.join(roomId);
            socket.roomId = roomId;
            socket.role = role; // "broadcaster" or "viewer"

            if (!rooms.has(roomId)) {
                // max viewers could be configured here, currently tracking state
                rooms.set(roomId, { broadcaster: null, viewers: new Set() });
            }

            const roomState = rooms.get(roomId);

            if (role === 'broadcaster') {
                // Prevent duplicate broadcasters
                if (roomState.broadcaster && roomState.broadcaster !== socket.id) {
                    console.log(`[Socket] Multiple broadcasters attempted in room ${roomId}. Rejecting.`);
                    socket.emit('error', 'A broadcaster is already in this room.');
                    return;
                }
                roomState.broadcaster = socket.id;
                console.log(`[Socket] Broadcaster joined room: ${roomId}`);
                
                // If there are already viewers waiting, notify them
                socket.emit('broadcaster-ready', { viewers: Array.from(roomState.viewers) });
            } else if (role === 'viewer') {
                if (roomState.viewers.size >= 50) { // Configurable limits
                    socket.emit('error', 'Room is full (max 50 viewers).');
                    return;
                }
                
                roomState.viewers.add(socket.id);
                console.log(`[Socket] Viewer joined room: ${roomId} (${roomState.viewers.size} viewers total)`);

                // Notify broadcaster to create an offer for this specific viewer
                if (roomState.broadcaster) {
                    io.to(roomState.broadcaster).emit('viewer-joined', { viewerId: socket.id });
                }
            }

            // Provide counts to all users in the room
            io.to(roomId).emit('room-update', { 
                viewersCount: roomState.viewers.size,
                broadcasterConnected: !!roomState.broadcaster 
            });
        });

        // ── Signaling Exchange ───────────────────────────────────────
        socket.on('offer', ({ viewerId, offer }) => {
            // Forward offer from broadcaster to specific viewer
            console.log(`[Socket] Forwarding offer from ${socket.id} to viewer ${viewerId}`);
            io.to(viewerId).emit('offer', { broadcasterId: socket.id, offer });
        });

        socket.on('answer', ({ broadcasterId, answer }) => {
            // Forward answer from viewer to broadcaster
            console.log(`[Socket] Forwarding answer from viewer ${socket.id} to broadcaster ${broadcasterId}`);
            io.to(broadcasterId).emit('answer', { viewerId: socket.id, answer });
        });

        socket.on('ice-candidate', ({ targetId, candidate }) => {
            // Forward ICE candidate to the specific peer (broadcaster or viewer)
            // console.log(`[Socket] Forwarding ICE candidate from ${socket.id} to ${targetId}`);
            io.to(targetId).emit('ice-candidate', { senderId: socket.id, candidate });
        });

        // ── Disconnection Handling ───────────────────────────────────
        socket.on('disconnect', () => {
            console.log(`[Socket] Disconnected: ${socket.id}`);
            if (!socket.roomId) return;

            const roomState = rooms.get(socket.roomId);
            if (!roomState) return;

            if (socket.role === 'broadcaster') {
                roomState.broadcaster = null;
                console.log(`[Socket] Broadcaster left room: ${socket.roomId}`);
                io.to(socket.roomId).emit('broadcaster-disconnected');
            } else if (socket.role === 'viewer') {
                roomState.viewers.delete(socket.id);
                console.log(`[Socket] Viewer ${socket.id} left room: ${socket.roomId}`);
                
                // Let broadcaster know to clean up peer connection
                if (roomState.broadcaster) {
                    io.to(roomState.broadcaster).emit('viewer-disconnected', { viewerId: socket.id });
                }
            }

            // Cleanup empty rooms
            if (!roomState.broadcaster && roomState.viewers.size === 0) {
                rooms.delete(socket.roomId);
                console.log(`[Socket] Room ${socket.roomId} cleaned up.`);
            } else {
                // Update viewer counts
                io.to(socket.roomId).emit('room-update', { 
                    viewersCount: roomState.viewers.size,
                    broadcasterConnected: !!roomState.broadcaster 
                });
            }
        });
    });
};
