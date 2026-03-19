const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const compression = require('compression');
const rateLimit  = require('express-rate-limit');
const path       = require('path');
const http       = require('http');
const fs         = require('fs');
const { Server } = require('socket.io');

// ── Load env FIRST ────────────────────────────────────────────
const { PORT, JWT_SECRET, CLIENT_URL } = require('./config/env');
const { initDatabase } = require('./config/initDB');

const app    = express();
const server = http.createServer(app);

// ── CORS config ───────────────────────────────────────────────
const allowedOrigins = [
    CLIENT_URL,
    'http://localhost:3000',
    'http://localhost:4000',
    'http://127.0.0.1:4000',
].filter(Boolean);

const corsOptions = {
    origin: function (origin, callback) {
        // Allow requests with no origin (mobile apps, curl, Postman)
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(null, true); // Keep open for now; tighten in production if needed
        }
    },
    credentials: true,
    optionsSuccessStatus: 200
};

// ── Socket.IO ─────────────────────────────────────────────────
const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] }
});

// ── Ensure upload directories exist ──────────────────────────
['uploads/videos', 'uploads/avatars'].forEach(dir => {
    const fullPath = path.join(__dirname, dir);
    if (!fs.existsSync(fullPath)) fs.mkdirSync(fullPath, { recursive: true });
});

// ── Security Middleware ───────────────────────────────────────
app.use(helmet({
    contentSecurityPolicy: false, // Allow inline scripts for frontend
    crossOriginEmbedderPolicy: false
}));
app.use(compression());
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// ── Rate Limiters ─────────────────────────────────────────────
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 500,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' }
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many auth attempts, please try again in 15 minutes.' }
});

app.use(globalLimiter);

// ── Body Parsers ──────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Health Check ──────────────────────────────────────────────
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString(), service: 'Blink API' });
});

// ── Static Files ──────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '../frontend'), {
    maxAge: '1h',
    etag: true
}));
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
    maxAge: '7d'
}));

// ── API Routes ────────────────────────────────────────────────
app.use('/api/auth',     authLimiter, require('./routes/authRoutes'));
app.use('/api/videos',   require('./routes/videoRoutes'));
app.use('/api/users',    require('./routes/userRoutes'));
app.use('/api/follow',   require('./routes/followRoutes'));
app.use('/api/comments', require('./routes/commentRoutes'));
app.use('/api/messages', require('./routes/messageRoutes'));
app.use('/api/live',     require('./routes/liveRoutes'));
app.use('/api/contact',  require('./routes/contactRoutes'));

// ── Convenience Short Redirects ───────────────────────────────
const PAGE_MAP = {
    '/login.html':        '/pages/login.html',
    '/register.html':     '/pages/register.html',
    '/index.html':        '/pages/index.html',
    '/profile.html':      '/pages/profile.html',
    '/edit-profile.html': '/pages/edit-profile.html',
    '/upload.html':       '/pages/upload.html',
    '/messages.html':     '/pages/messages.html',
    '/chat.html':         '/pages/messages.html',
    '/explore.html':      '/pages/index.html',
    '/live.html':         '/pages/live.html',
    '/contact.html':      '/pages/contact.html',
};
Object.entries(PAGE_MAP).forEach(([from, to]) => {
    app.get(from, (req, res) => res.redirect(302, to + (req._parsedUrl?.search || '')));
});

// ── Root Route ────────────────────────────────────────────────
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '../frontend/splash.html')));

// ── SPA Fallback – catches deep links to /pages/* ─────────────
app.get('/pages/*', (req, res, next) => {
    const page = path.basename(req.path);
    const filePath = path.join(__dirname, '../frontend/pages', page);
    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        res.status(404).sendFile(path.join(__dirname, '../frontend/splash.html'));
    }
});

// ── 404 handler ───────────────────────────────────────────────
app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: `API route not found: ${req.method} ${req.path}` });
    }
    res.status(404).sendFile(path.join(__dirname, '../frontend/splash.html'));
});

// ── Global Error Handler ──────────────────────────────────────
app.use((err, req, res, next) => {
    const status = err.status || err.statusCode || 500;
    const message = err.expose ? err.message : 'Internal Server Error';
    console.error(`[Error] ${status} ${req.method} ${req.path}:`, err.message);
    res.status(status).json({ error: message });
});

// ── WebSocket Logic ───────────────────────────────────────────
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
        console.error('[Socket] end_live_stream error:', err.message);
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

    socket.on('join_room',    (room) => socket.join(room));
    socket.on('send_message', (data) => io.to(data.room).emit('receive_message', data));

    socket.on('join_live', async ({ streamId, userId, username, role }) => {
        if (!streamId || !userId) return;
        const room = `live_${streamId}`;
        socket.join(room);
        socket.streamId   = streamId;
        socket.userId     = userId;
        socket.username   = username;
        socket.isBroadcaster = (role === 'broadcaster');
        try {
            if (role === 'viewer') {
                await db.query('INSERT IGNORE INTO live_viewers (stream_id, user_id) VALUES (?, ?)', [streamId, userId]);
            }
            const [rows] = await db.query('SELECT COUNT(*) as count FROM live_viewers WHERE stream_id = ?', [streamId]);
            const count  = rows[0].count;
            await db.query('UPDATE live_streams SET viewer_count = ? WHERE id = ?', [count, streamId]);
            io.to(room).emit('viewer_update', { count });
            io.to(room).emit('user_joined', { userId, username, socketId: socket.id, role });
        } catch (err) { console.error('[Socket] join_live error:', err.message); }
    });

    socket.on('leave_live', async ({ streamId, userId }) => {
        socket.leave(`live_${streamId}`);
        try {
            await db.query('DELETE FROM live_viewers WHERE stream_id = ? AND user_id = ?', [streamId, userId]);
            const [rows] = await db.query('SELECT COUNT(*) as count FROM live_viewers WHERE stream_id = ?', [streamId]);
            io.to(`live_${streamId}`).emit('viewer_update', { count: rows[0].count });
        } catch {}
    });

    socket.on('send_live_chat', async ({ streamId, userId, message, username }) => {
        if (!message?.trim() || !streamId) return;
        const room = `live_${streamId}`;
        try {
            await db.query('INSERT INTO live_chat (stream_id, user_id, message) VALUES (?, ?, ?)', [streamId, userId, message]);
            io.to(room).emit('receive_live_chat', { username, message, created_at: new Date() });
        } catch {}
    });

    socket.on('send_reaction', ({ streamId, emoji }) => {
        io.to(`live_${streamId}`).emit('receive_reaction', { emoji });
    });

    socket.on('end_live_stream', async ({ streamId, username }) => {
        if (socket.endedStream) return;
        socket.endedStream = true;
        await endLiveStream(streamId || socket.streamId, socket.userId, username || socket.username);
    });

    socket.on('signal',        (data) => { if (data.to) io.to(data.to).emit('signal',        { from: socket.id, signal: data.signal }); });
    socket.on('offer',         (data) => { if (data.to) io.to(data.to).emit('offer',          { from: socket.id, offer: data.offer });   });
    socket.on('answer',        (data) => { if (data.to) io.to(data.to).emit('answer',         { from: socket.id, answer: data.answer }); });
    socket.on('ice-candidate', (data) => { if (data.to) io.to(data.to).emit('ice-candidate',  { from: socket.id, candidate: data.candidate }); });

    socket.on('profile_updated', (data) => {
        socket.broadcast.emit('profile_updated', data);
    });

    socket.on('disconnect', async () => {
        if (socket.userId && ONLINE_USERS.has(socket.userId)) {
            ONLINE_USERS.get(socket.userId).delete(socket.id);
            if (ONLINE_USERS.get(socket.userId).size === 0) {
                ONLINE_USERS.delete(socket.userId);
                io.emit('user_status', { userId: socket.userId, status: 'offline' });
            }
        }
        if (socket.streamId && socket.userId && socket.isBroadcaster && !socket.endedStream) {
            socket.endedStream = true;
            await endLiveStream(socket.streamId, socket.userId, socket.username);
        }
    });
});

app.set('io', io);

// ── Start Server ──────────────────────────────────────────────
initDatabase()
    .then(() => {
        const HOST = process.env.NODE_ENV === 'production' ? '0.0.0.0' : 'localhost';
        server.listen(PORT, HOST, () => {
            console.log(`✅ Blink Server → http://${HOST}:${PORT}`);
            console.log(`   Environment : ${process.env.NODE_ENV || 'development'}`);
        });
    })
    .catch(err => {
        console.error('[Fatal] Could not initialize database:', err.message);
        process.exit(1);
    });

// ── Graceful Shutdown ─────────────────────────────────────────
process.on('SIGTERM', () => {
    console.log('[Server] SIGTERM received. Shutting down gracefully...');
    server.close(() => { console.log('[Server] Closed.'); process.exit(0); });
});
process.on('SIGINT', () => {
    server.close(() => { process.exit(0); });
});
