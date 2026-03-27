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
const socketHandler = require('./sockets/socket');
const app    = express();
const server = http.createServer(app);

// ── Production Security (Part 1) ─────────────────────────────
app.set('trust proxy', 1);

// Force HTTPS in production
app.use((req, res, next) => {
    if (req.headers['x-forwarded-proto'] !== 'https' && process.env.NODE_ENV === 'production') {
        return res.redirect(301, 'https://' + req.headers.host + req.url);
    }
    next();
});

// Helmet with HSTS and CSP refinements
app.use(helmet({ contentSecurityPolicy: false }));
app.use(helmet.hsts({
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
}));

// ── CORS config ───────────────────────────────────────────────
const allowedOrigins = [
    CLIENT_URL,
    'http://localhost:3000',
    'http://localhost:4000',
    'http://127.0.0.1:4000',
].filter(Boolean);

const corsOptions = {
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(null, true);
        }
    },
    credentials: true,
    optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// ── Socket.IO ─────────────────────────────────────────────────
const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    pingTimeout: 60000,
    pingInterval: 25000,
    maxHttpBufferSize: 1e6
});
socketHandler(io); // Initialize new one-to-many live streaming signaling

// ── Environment ───────────────────────────────────────────────
['uploads/videos', 'uploads/avatars'].forEach(dir => {
    const fullPath = path.join(__dirname, dir);
    if (!fs.existsSync(fullPath)) fs.mkdirSync(fullPath, { recursive: true });
});

// Using JWT-based authentication (No express-session needed)
app.use(compression());

// ── Rate Limiters ─────────────────────────────────────────────
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
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

// ── Specific Requested Endpoints (Redirect/Alias) ─────────────
const { requireAuth } = require('./middleware/authMiddleware');
const { uploadAvatar } = require('./middleware/uploadMiddleware');
const uc = require('./controllers/userController');

app.post('/api/upload-profile', authLimiter, requireAuth, uploadAvatar, uc.updateAvatar);
app.post('/api/upload-avatar',  authLimiter, requireAuth, uploadAvatar, uc.updateAvatar); // Requested alias
app.get('/api/user', requireAuth, uc.getCurrentUser);
app.get('/api/user/:id', uc.getProfile); // Requested profile fetch
app.get('/api/user/profile', requireAuth, (req,res) => { req.params.id = req.user.id; uc.getProfile(req,res); });


// ── Static Files ──────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '../frontend'), {
    maxAge: '1h',
    etag: true
}));

// ── Video Streaming with Range Support ────────────────────────
// This enables seeking, buffering, and partial content delivery
app.get('/uploads/videos/:filename', (req, res) => {
    const filePath = path.join(__dirname, 'uploads/videos', req.params.filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Video not found' });

    const stat  = fs.statSync(filePath);
    const total = stat.size;
    const ext   = path.extname(filePath).toLowerCase();
    const mimeTypes = { '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.avi': 'video/x-msvideo' };
    const contentType = mimeTypes[ext] || 'video/mp4';

    // Range request (browser sends Range header for seeking/buffering)
    const range = req.headers.range;
    if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end   = parts[1] ? parseInt(parts[1], 10) : Math.min(start + 1024 * 1024, total - 1); // 1MB chunks
        const chunkSize = end - start + 1;
        const stream = fs.createReadStream(filePath, { start, end });

        res.writeHead(206, {
            'Content-Range':  `bytes ${start}-${end}/${total}`,
            'Accept-Ranges':  'bytes',
            'Content-Length':  chunkSize,
            'Content-Type':   contentType,
            'Cache-Control':  'public, max-age=604800', // 7 days
        });
        stream.pipe(res);
    } else {
        // No range — send entire file
        res.writeHead(200, {
            'Content-Length': total,
            'Content-Type':  contentType,
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'public, max-age=604800',
        });
        fs.createReadStream(filePath).pipe(res);
    }
});

// Other uploads (avatars, etc.)
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

// Requested fix for User Videos endpoint
app.get('/api/user/:id/videos', async (req, res) => {
    const userId = req.params.id;
    try {
        const db = require('./config/db');
        const [videos] = await db.query(
            "SELECT * FROM videos WHERE user_id = ? ORDER BY created_at DESC",
            [userId]
        );
        res.json({
            videos,
            count: videos.length
        });
    } catch (err) {
        console.error('[Video API] error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

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
    '/broadcaster.html':  '/pages/broadcaster.html',
    '/viewer.html':       '/pages/viewer.html',
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

// ══════════════════════════════════════════════════════════════
// ── Core App DB Logic ─────────────────────────────────────────
// ══════════════════════════════════════════════════════════════
const db = require('./config/db');
// The live streaming Socket.io endpoints are completely handled by
// ./sockets/socket.js now based on the requested refactoring.


app.set('io', io);

// ── Boot ──────────────────────────────────────────────────────
initDatabase()
    .then(() => {
        // Always bind 0.0.0.0 — required by Railway/Render and also works locally
        const HOST = '0.0.0.0';
        server.listen(PORT, HOST, () => {
            console.log(`\n✅ Blink Server Running → http://localhost:${PORT}`);
            console.log(`   Bound to:    ${HOST}:${PORT}`);
            console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
            console.log(`   WebSocket:   Ready`);
            console.log(`   WebRTC:      Signaling Active\n`);
        });
    })
    .catch(err => {
        console.error('[Fatal] Database Error:', err.message);
        process.exit(1);
    });

// ── Graceful error handling ───────────────────────────────────
server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`\n❌ Port ${PORT} is already in use!`);
        console.error(`   Fix: Run "taskkill /F /IM node.exe" (Windows) or "pkill -f node" (Mac/Linux)`);
        console.error(`   Or change PORT in .env\n`);
    } else {
        console.error('[Server Error]', err.message);
    }
    process.exit(1);
});

process.on('SIGTERM', () => { server.close(() => process.exit(0)); });
process.on('SIGINT',  () => { server.close(() => process.exit(0)); });
