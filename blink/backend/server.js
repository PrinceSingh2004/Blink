/**
 * Blink Social Platform – Production Backend v3.0
 * Express.js + Socket.IO + MySQL (Railway) + Cloudinary
 */

'use strict';
require('dotenv').config();

const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Server } = require('socket.io');
const path = require('path');

// ── Import Route Modules ────────────────────────────────────────
const authRoutes = require('./routes/auth');
const videoRoutes = require('./routes/videos');
const userRoutes = require('./routes/users');
const postRoutes = require('./routes/posts');
const storyRoutes = require('./routes/stories');
const notificationRoutes = require('./routes/notifications');
const messageRoutes = require('./routes/messages');
const liveRoutes = require('./routes/live');

// ── Import Socket Handler ───────────────────────────────────────
const initSocket = require('./socket/index');

// ── App Setup ──────────────────────────────────────────────────
const app = express();
const server = http.createServer(app);

// ── Socket.IO ─────────────────────────────────────────────────
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    },
    pingTimeout: 60000,
    pingInterval: 25000
});
initSocket(io);

// Make io accessible in controllers via req.app.get('io')
app.set('io', io);

// ── Security & CORS ────────────────────────────────────────────
app.use(helmet({
    crossOriginResourcePolicy: false,
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: false
}));

const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
    : ['*'];

app.use(cors({
    origin: (origin, cb) => cb(null, true),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// ── Rate Limiting ─────────────────────────────────────────────
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 300,
    message: { error: 'Too many requests. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { error: 'Too many authentication attempts. Please wait 15 minutes.' }
});

const uploadLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 50,
    message: { error: 'Upload limit reached. Please try again later.' }
});

app.use(generalLimiter);

// ── Body Parsers ───────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Health Check ───────────────────────────────────────────────
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        platform: 'Blink Social Platform',
        version: '3.0.0',
        time: new Date().toISOString(),
        uptime: Math.floor(process.uptime()) + 's'
    });
});

// ── API Routes ────────────────────────────────────────────────
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/videos', videoRoutes);
app.use('/api/users', userRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/stories', uploadLimiter, storyRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/live', liveRoutes);

// ── 404 Fallback ──────────────────────────────────────────────
app.use((req, res) => {
    res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
});

// ── Global Error Handler ──────────────────────────────────────
app.use((err, req, res, next) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || 'Internal server error';
    console.error(`[Error] ${status} – ${message}`, err.stack);
    res.status(status).json({ error: message });
});

// ── Start Server ──────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔═══════════════════════════════════╗
║   🚀 Blink API  – Port ${PORT}       ║  
║   ENV: ${(process.env.NODE_ENV || 'development').padEnd(26)}║
╚═══════════════════════════════════╝`);
});

module.exports = { app, server, io };
