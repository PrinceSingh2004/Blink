/**
 * server.js — Blink Backend (Production)
 * ═══════════════════════════════════════
 * Express + Railway MySQL + Cloudinary
 * Clean MVC Architecture
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const { initDB, testConnection } = require('./config/db');

// ── Express App ────────────────────────────────────────
const app = express();
app.set('trust proxy', 1); // For Render deployment

// ── Security ───────────────────────────────────────────
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));

// ── CORS ───────────────────────────────────────────────
app.set('trust proxy', 1); // Fix for Render proxy
app.use(cors({
    origin: ['https://blink-yzoo.onrender.com', 'http://localhost:3000'],
    credentials: true
}));

// ── Body Parsing ───────────────────────────────────────
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ── Rate Limiting ──────────────────────────────────────
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 min
    max: 200,
    message: { error: 'Too many requests. Try again later.' },
    standardHeaders: true,
    legacyHeaders: false
});
app.use('/api/', apiLimiter);

// ── Health Check ───────────────────────────────────────
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── DB Health Check ────────────────────────────────────
app.get('/health/db', async (req, res) => {
    const { testConnection } = require('./config/db');
    const result = await testConnection();
    res.status(result.success ? 200 : 503).json({
        status: result.success ? 'ok' : 'error',
        db: result.message,
        timestamp: new Date().toISOString()
    });
});

// ── API Routes ─────────────────────────────────────────
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/videos', require('./routes/videoRoutes'));
app.use('/api/upload', require('./routes/uploadRoutes'));
app.use('/api/users', require('./routes/userRoutes'));

// Comment delete (separate from video-scoped routes)
const { deleteComment } = require('./controllers/videoController');
const { protect: authProtect } = require('./middleware/auth');
app.delete('/api/comments/:id', authProtect, deleteComment);

// ── Static Frontend ────────────────────────────────────
app.use(express.static(path.join(__dirname, '../frontend')));

// SPA catch-all: serve index.html for non-API, non-file routes
app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.includes('.')) return next();
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// ── Global Error Handler ───────────────────────────────
app.use((err, req, res, next) => {
    console.error('Server error:', err.message);

    // Multer file size error
    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'File too large. Max 100MB.' });
    }

    res.status(err.status || 500).json({
        error: err.message || 'Internal server error'
    });
});

// ── Startup ────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

const start = async () => {
    await testConnection();
    await initDB();

    app.listen(PORT, () => {
        console.log(`🚀 Blink server running on port ${PORT}`);
        console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
    });
};

start().catch(err => {
    console.error('❌ Failed to start server:', err.message);
    process.exit(1);
});
