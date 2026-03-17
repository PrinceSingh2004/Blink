const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const http = require('http');
const fs = require('fs');
const { Server } = require('socket.io');
const { initDatabase } = require('./config/initDB');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// ── Ensure upload directories exist 
['uploads/videos', 'uploads/avatars'].forEach(dir => {
    const fullPath = path.join(__dirname, dir);
    if (!fs.existsSync(fullPath)) fs.mkdirSync(fullPath, { recursive: true });
});

// ── Middleware 
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Static Files 
app.use(express.static(path.join(__dirname, '../frontend')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── API Routes 
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/videos', require('./routes/videoRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/follow', require('./routes/followRoutes'));
app.use('/api/comments', require('./routes/commentRoutes'));
app.use('/api/messages', require('./routes/messageRoutes'));
app.use('/api/live', require('./routes/liveRoutes'));

// ── Convenience short redirects 
// Allows users to visit /login.html, /index.html, etc. directly
const PAGE_MAP = {
    '/login.html': '/pages/login.html',
    '/register.html': '/pages/register.html',
    '/index.html': '/pages/index.html',
    '/profile.html': '/pages/profile.html',
    '/edit-profile.html': '/pages/edit-profile.html',
    '/upload.html': '/pages/upload.html',
    '/messages.html': '/pages/messages.html',
    '/chat.html': '/pages/messages.html',
    '/explore.html': '/pages/index.html',
};
Object.entries(PAGE_MAP).forEach(([from, to]) => {
    app.get(from, (req, res) => res.redirect(302, to + (req.search || '')));
});

// ── Debug Route: Show All Data 
app.get('/api/debug/all-data', async (req, res) => {
    try {
        const db = require('./config/db');
        const [users] = await db.query('SELECT id, username, email, created_at FROM users');
        const [videos] = await db.query('SELECT * FROM videos');
        const [comments] = await db.query('SELECT * FROM comments');
        const [followers] = await db.query('SELECT * FROM followers');
        const [messages] = await db.query('SELECT * FROM messages');
        res.json({ users, videos, comments, followers, messages });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Root → Smart splash (checks JWT client-side, sends to feed or login) 

app.get('/', (req, res) => res.sendFile(path.join(__dirname, '../frontend/splash.html')));


// ── WebSocket (Real-time Messaging & Live Streaming) 
const db = require('./config/db');

// Track online users: Map<userId, socketId[]>
const ONLINE_USERS = new Map();

io.on('connection', (socket) => {
    
    // User Identity for Online Status
    socket.on('identify', (userId) => {
        if (!userId) return;
        socket.userId = userId;
        
        // Add to online map
        if (!ONLINE_USERS.has(userId)) {
            ONLINE_USERS.set(userId, new Set());
        }
        ONLINE_USERS.get(userId).add(socket.id);
        
        // Broadcast that user is online
        io.emit('user_status', { userId, status: 'online' });
        console.log(`[Socket] User ${userId} is online`);
    });

    // Request status of a specific user
    socket.on('check_status', (userId) => {
        const isOnline = ONLINE_USERS.has(userId) && ONLINE_USERS.get(userId).size > 0;
        socket.emit('user_status', { userId, status: isOnline ? 'online' : 'offline' });
    });

    // Standard Messaging
    socket.on('join_room', (room) => socket.join(room));
    socket.on('send_message', (data) => io.to(data.room).emit('receive_message', data));

    // Live Streaming LOGIC
    socket.on('join_live', async ({ streamId, userId, username, role }) => {
        const room = `live_${streamId}`;
        socket.join(room);
        socket.streamId = streamId;
        socket.userId = userId; // Note: this might overwrite the identity userId if not careful, but they should be the same
        socket.username = username;
        socket.isBroadcaster = (role === 'broadcaster');

        try {
            await db.query('INSERT IGNORE INTO live_viewers (stream_id, user_id) VALUES (?, ?)', [streamId, userId]);
            const [rows] = await db.query('SELECT COUNT(*) as count FROM live_viewers WHERE stream_id = ?', [streamId]);
            const count = rows[0].count;
            await db.query('UPDATE live_streams SET viewer_count = ? WHERE id = ?', [count, streamId]);
            io.to(room).emit('viewer_update', { count });
            io.to(room).emit('user_joined', {
                userId,
                username,
                socketId: socket.id,
                role: socket.isBroadcaster ? 'broadcaster' : 'viewer'
            });
            io.to(room).emit('system_message', { message: `${username} joined the stream` });
        } catch (err) { console.error('[Socket] join_live error:', err); }
    });

    socket.on('leave_live', async ({ streamId, userId }) => {
        const room = `live_${streamId}`;
        socket.leave(room);
        try {
            await db.query('DELETE FROM live_viewers WHERE stream_id = ? AND user_id = ?', [streamId, userId]);
            const [rows] = await db.query('SELECT COUNT(*) as count FROM live_viewers WHERE stream_id = ?', [streamId]);
            const count = rows[0].count;
            await db.query('UPDATE live_streams SET viewer_count = ? WHERE id = ?', [count, streamId]);
            io.to(room).emit('viewer_update', { count });
        } catch { }
    });

    socket.on('send_live_chat', async ({ streamId, userId, message, username }) => {
        const room = `live_${streamId}`;
        try {
            await db.query('INSERT INTO live_chat (stream_id, user_id, message) VALUES (?, ?, ?)', [streamId, userId, message]);
            io.to(room).emit('receive_live_chat', { username, message, created_at: new Date() });
        } catch (err) { console.error('[Socket] chat error:', err); }
    });

    socket.on('send_reaction', ({ streamId, emoji }) => {
        const room = `live_${streamId}`;
        io.to(room).emit('receive_reaction', { emoji });
    });

    // WebRTC Signaling
    socket.on('signal', (data) => {
        io.to(data.to).emit('signal', {
            from: socket.id,
            signal: data.signal
        });
    });

    socket.on('request_stream', (data) => {
        io.to(data.to).emit('request_stream', { from: socket.id });
    });

    socket.on('disconnect', async () => {
        // Handle Messaging Online Status
        if (socket.userId) {
            const userId = socket.userId;
            if (ONLINE_USERS.has(userId)) {
                ONLINE_USERS.get(userId).delete(socket.id);
                if (ONLINE_USERS.get(userId).size === 0) {
                    ONLINE_USERS.delete(userId);
                    io.emit('user_status', { userId, status: 'offline' });
                    console.log(`[Socket] User ${userId} is offline`);
                }
            }
        }

        // Handle Live Streaming Disconnect
        if (socket.streamId && socket.userId) {
            const sid = socket.streamId;
            const uid = socket.userId;
            const room = `live_${sid}`;
            try {
                await db.query('DELETE FROM live_viewers WHERE stream_id = ? AND user_id = ?', [sid, uid]);
                const [rows] = await db.query('SELECT COUNT(*) as count FROM live_viewers WHERE stream_id = ?', [sid]);
                const count = rows[0].count;
                await db.query('UPDATE live_streams SET viewer_count = ? WHERE id = ?', [count, sid]);
                io.to(room).emit('viewer_update', { count });
            } catch { }
        }
    });
});


// Make io available to routes
app.set('io', io);

// ── Start Server 
const PORT = process.env.PORT || 4000;

initDatabase().then(() => {
    server.listen(PORT, () => {
        console.log(`\n✅ Blink Server  → http://localhost:${PORT}`);
        console.log(`🚀 Open in browser → http://localhost:${PORT}`);
        console.log(`📊 API Debug Data → http://localhost:${PORT}/api/debug/all-data\n`);


    });
}).catch(err => {
    console.error('❌ Failed to init database:', err.message);
    process.exit(1);
});
