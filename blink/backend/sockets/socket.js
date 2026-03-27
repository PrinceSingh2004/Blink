const db = require('../config/db');

module.exports = function(io) {
    const rooms = new Map(); // Global state: { roomId: { broadcaster: socketId, viewers: Set(socketIds) } }

    io.on('connection', (socket) => {
        console.log(`[Socket] New connection: ${socket.id}`);

        // ── 1. JOIN LIVE ROOM ──────────────────────────────────────
        socket.on('join_live', async ({ streamId, userId, username, role }) => {
            if (!streamId) return;

            const roomId = `live_${streamId}`;
            socket.join(roomId);
            socket.roomId = roomId;
            socket.streamId = streamId;
            socket.userId = userId;
            socket.username = username;
            socket.role = role || 'viewer';

            if (!rooms.has(roomId)) {
                rooms.set(roomId, { broadcaster: null, viewers: new Set() });
            }
            const roomState = rooms.get(roomId);

            if (socket.role === 'broadcaster') {
                roomState.broadcaster = socket.id;
                console.log(`[Socket] Broadcaster ${username} joined ${roomId}`);
                // Notify waiting viewers if any
                socket.emit('broadcaster-ready', { viewers: Array.from(roomState.viewers) });
            } else {
                roomState.viewers.add(socket.id);
                console.log(`[Socket] Viewer ${username} joined ${roomId}`);
                
                // Track viewer in DB
                await db.query('INSERT IGNORE INTO live_viewers (stream_id, user_id) VALUES (?, ?)', [streamId, userId || 0]).catch(()=>{});
                // Increment viewer count
                await db.query('UPDATE live_streams SET viewer_count = viewer_count + 1, peak_viewers = GREATEST(peak_viewers, viewer_count + 1) WHERE id = ?', [streamId]).catch(()=>{});
            }

            // Notify broadcasters of the new viewer
            if (socket.role === 'viewer' && roomState.broadcaster) {
                io.to(roomState.broadcaster).emit('viewer-joined', { viewerId: socket.id });
            }

            // Update all viewers in the room about the new status
            io.to(roomId).emit('viewer_update', { count: roomState.viewers.size });
        });

        // ── 2. REAL-TIME CHAT ───────────────────────────────────────
        socket.on('send_live_chat', async (data) => {
            const { streamId, userId, username, message } = data;
            if (!message || !streamId) return;

            console.log(`[Chat] ${username} in ${streamId}: ${message}`);

            const roomId = `live_${streamId}`;
            
            // Broadcast instantly to the room (to EVERYONE including sender for sync if needed, 
            // but the frontend handles self-append locally too).
            // Usually io.to(roomId) is better for chat.
            socket.to(roomId).emit('receive_live_chat', {
                username,
                message,
                userId,
                timestamp: new Date()
            });

            // Persist to DB asynchronously
            try {
                await db.query(
                    'INSERT INTO live_chat (stream_id, user_id, message) VALUES (?, ?, ?)',
                    [streamId, userId || null, message]
                );
            } catch (err) {
                console.error('[Socket] Chat persistence error:', err.message);
            }
        });

        // ── 3. REACTIONS ───────────────────────────────────────────
        socket.on('send_reaction', ({ streamId, emoji }) => {
            if (!streamId || !emoji) return;
            socket.to(`live_${streamId}`).emit('receive_reaction', { emoji });
        });

        // ── 4. WebRTC SIGNALING ─────────────────────────────────────
        socket.on('request_offer', (data) => {
            const roomId = `live_${data.streamId}`;
            const roomState = rooms.get(roomId);
            if (roomState?.broadcaster) {
                io.to(roomState.broadcaster).emit('request_offer', { from: socket.id });
            }
        });

        socket.on('offer', (data) => {
            io.to(data.to).emit('offer', { from: socket.id, offer: data.offer });
        });

        socket.on('answer', (data) => {
            io.to(data.to).emit('answer', { from: socket.id, answer: data.answer });
        });

        socket.on('ice-candidate', (data) => {
            io.to(data.to).emit('ice-candidate', { from: socket.id, candidate: data.candidate });
        });

        // ── 5. DISCONNECT / LEAVE ──────────────────────────────────
        const handleLeave = async () => {
            if (!socket.roomId) return;
            const roomId = socket.roomId;
            const roomState = rooms.get(roomId);
            if (!roomState) return;

            if (socket.role === 'broadcaster') {
                roomState.broadcaster = null;
                io.to(roomId).emit('live_ended');
                console.log(`[Socket] Stream ended in ${roomId}`);
            } else if (socket.role === 'viewer') {
                roomState.viewers.delete(socket.id);
                // Decrement viewer count in DB
                if (socket.streamId) {
                    await db.query('DELETE FROM live_viewers WHERE stream_id = ? AND user_id = ?', [socket.streamId, socket.userId || 0]).catch(()=>{});
                    await db.query('UPDATE live_streams SET viewer_count = GREATEST(0, viewer_count - 1) WHERE id = ?', [socket.streamId]).catch(()=>{});
                }
                io.to(roomId).emit('viewer_update', { count: roomState.viewers.size });
                
                // Notify broadcaster if still present
                if (roomState.broadcaster) {
                    io.to(roomState.broadcaster).emit('viewer-disconnected', { viewerId: socket.id });
                }
            }

            if (!roomState.broadcaster && roomState.viewers.size === 0) {
                rooms.delete(roomId);
            }

            // Notify everyone of general discovery refresh
            io.emit('live_discovery_update');
        };

        socket.on('leave_live', handleLeave);
        socket.on('disconnect', handleLeave);
    });
};
