const express = require('express');
const cors = require('cors');
const path = require('path');
const { PORT, JWT_SECRET } = require('./config/env');
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
app.use('/api/contact', require('./routes/contactRoutes'));

// ── Convenience short redirects 
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

// ── Debug Route 
app.get('/api/debug/all-data', async (req, res) => {
    try {
        const db = require('./config/db');
        const [users] = await db.query('SELECT id, username, email, created_at FROM users');
        const [videos] = await db.query('SELECT * FROM videos');
        res.json({ users, videos });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, '../frontend/splash.html')));

// ── WebSocket Logic 
const db = require('./config/db');
const ONLINE_USERS = new Map();

async function endLiveStream(streamId, userId, username) {
    if (!streamId) return;
    const room = `live_${streamId}`;
    try {
        await db.query('UPDATE live_streams SET status = "offline", viewer_count = 0 WHERE id = ?', [streamId]);
        if (userId) await db.query('UPDATE users SET is_live = 0 WHERE id = ?', [userId]);
        await db.query('DELETE FROM live_viewers WHERE stream_id = ?', [streamId]);
        io.to(room).emit('live_ended', { by: username || 'host' });
        io.to(room).emit('viewer_update', { count: 0 });
    } catch (err) {
        console.error('[Socket] end_live_stream error:', err);
    }
}

io.on('connection', (socket) => {
    socket.on('identify', (userId) => {
        if (!userId) return;
        socket.userId = userId;
        if (!ONLINE_USERS.has(userId)) ONLINE_USERS.set(userId, new Set());
        ONLINE_USERS.get(userId).add(socket.id);
        io.emit('user_status', { userId, status: 'online' });
    });

    socket.on('join_room', (room) => socket.join(room));
    socket.on('send_message', (data) => io.to(data.room).emit('receive_message', data));

    socket.on('join_live', async ({ streamId, userId, username, role }) => {
        if (!streamId || !userId) return;
        const room = `live_${streamId}`;
        socket.join(room);
        socket.streamId = streamId;
        socket.userId = userId;
        socket.username = username;
        socket.isBroadcaster = (role === 'broadcaster');

        try {
            if (role === 'viewer') {
                await db.query('INSERT IGNORE INTO live_viewers (stream_id, user_id) VALUES (?, ?)', [streamId, userId]);
            }
            const [rows] = await db.query('SELECT COUNT(*) as count FROM live_viewers WHERE stream_id = ?', [streamId]);
            const count = rows[0].count;
            await db.query('UPDATE live_streams SET viewer_count = ? WHERE id = ?', [count, streamId]);
            io.to(room).emit('viewer_update', { count });
            io.to(room).emit('user_joined', { userId, username, socketId: socket.id, role });
        } catch (err) { console.error('[Socket] join_live error:', err); }
    });

    socket.on('leave_live', async ({ streamId, userId }) => {
        const room = `live_${streamId}`;
        socket.leave(room);
        try {
            await db.query('DELETE FROM live_viewers WHERE stream_id = ? AND user_id = ?', [streamId, userId]);
            const [rows] = await db.query('SELECT COUNT(*) as count FROM live_viewers WHERE stream_id = ?', [streamId]);
            const count = rows[0].count;
            io.to(room).emit('viewer_update', { count });
        } catch (e) {}
    });

    socket.on('send_live_chat', async ({ streamId, userId, message, username }) => {
        const room = `live_${streamId}`;
        if (!message || !streamId) return;
        try {
            await db.query('INSERT INTO live_chat (stream_id, user_id, message) VALUES (?, ?, ?)', [streamId, userId, message]);
            io.to(room).emit('receive_live_chat', { username, message, created_at: new Date() });
        } catch (err) {}
    });

    socket.on('send_reaction', ({ streamId, emoji }) => {
        io.to(`live_${streamId}`).emit('receive_reaction', { emoji });
    });

    socket.on('end_live_stream', async ({ streamId, username }) => {
        if (socket.endedStream) return;
        socket.endedStream = true;
        await endLiveStream(streamId || socket.streamId, socket.userId, username || socket.username);
    });

    socket.on('signal', (data) => {
        if (data.to) io.to(data.to).emit('signal', { from: socket.id, signal: data.signal });
    });

    socket.on('offer', (data) => {
        if (data.to) io.to(data.to).emit('offer', { from: socket.id, offer: data.offer });
    });

    socket.on('answer', (data) => {
        if (data.to) io.to(data.to).emit('answer', { from: socket.id, answer: data.answer });
    });

    socket.on('ice-candidate', (data) => {
        if (data.to) io.to(data.to).emit('ice-candidate', { from: socket.id, candidate: data.candidate });
    });

    socket.on('disconnect', async () => {
        if (socket.userId && ONLINE_USERS.has(socket.userId)) {
            ONLINE_USERS.get(socket.userId).delete(socket.id);
            if (ONLINE_USERS.get(socket.userId).size === 0) {
                ONLINE_USERS.delete(socket.userId);
                io.emit('user_status', { userId: socket.userId, status: 'offline' });
            }
        }
        if (socket.streamId && socket.userId) {
            if (socket.isBroadcaster && !socket.endedStream) {
                socket.endedStream = true;
                await endLiveStream(socket.streamId, socket.userId, socket.username);
            }
        }
    });

});

app.set('io', io);

initDatabase().then(() => {
    server.listen(PORT, () => {
        console.log(`✅ Blink Server -> http://localhost:${PORT}`);
    });
});
