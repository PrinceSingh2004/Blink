/**
 * server.js – Blink Platform v4.0 Production COMPLETE
 * ═══════════════════════════════════════════════════════════════════════════════
 * Features: Auto port fallback, graceful shutdown, rate limiting, Socket.io, Security
 * ═══════════════════════════════════════════════════════════════════════════════
 */
require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const net = require('net');

// ════════════════════════════════════════════════════════════════════════════════
// ROUTE IMPORTS
// ════════════════════════════════════════════════════════════════════════════════
const authRoutes = require('./routes/auth');
const postRoutes = require('./routes/postRoutes');
const userRoutes = require('./routes/userRoutes');
const messageRoutes = require('./routes/messageRoutes');
const liveRoutes = require('./routes/liveRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const { initSocket } = require('./socket/socketHandler');

const app = express();
const server = http.createServer(app);

// ════════════════════════════════════════════════════════════════════════════════
// SECURITY MIDDLEWARE
// ════════════════════════════════════════════════════════════════════════════════
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

// ════════════════════════════════════════════════════════════════════════════════
// ROOT ROUTE - Production Server Health Check
// ════════════════════════════════════════════════════════════════════════════════
app.get('/', (req, res) => {
    res.json({
        status: 'online',
        message: '🚀 Blink Backend is Live',
        version: '4.0.0',
        environment: process.env.NODE_ENV || 'production',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// ════════════════════════════════════════════════════════════════════════════════
// RATE LIMITING
// ════════════════════════════════════════════════════════════════════════════════

// Global Rate Limiter
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many requests, please try again later.'
});

// Auth Rate Limiter (Strict - protects against brute force)
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many authentication attempts. Try again in 15 minutes.',
    keyGenerator: (req) => {
        return (req.body.email || req.body.username) + '_' + req.ip;
    }
});

app.use('/api/', globalLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/signup', authLimiter);

// ════════════════════════════════════════════════════════════════════════════════
// TEMP DIRECTORIES
// ════════════════════════════════════════════════════════════════════════════════
const tempDir = path.join(__dirname, 'temp');
const uploadsDir = path.join(__dirname, 'uploads');

[tempDir, uploadsDir].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ════════════════════════════════════════════════════════════════════════════════
// ROUTES
// ════════════════════════════════════════════════════════════════════════════════
app.use('/api/auth', authRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/users', userRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/live', liveRoutes);
app.use('/api/upload', uploadRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// ════════════════════════════════════════════════════════════════════════════════
// SOCKET.IO - REAL-TIME FUNCTIONALITY
// ════════════════════════════════════════════════════════════════════════════════
const io = initSocket(server);
app.set('socketio', io);

// ════════════════════════════════════════════════════════════════════════════════
// ERROR HANDLING MIDDLEWARE
// ════════════════════════════════════════════════════════════════════════════════
app.use((err, req, res, next) => {
    console.error('❌ [ERROR]', err.message);
    
    if (req.file?.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
    }
    
    res.status(err.status || 500).json({
        error: err.message || 'Internal Server Error',
        code: err.code || 'INTERNAL_ERROR'
    });
});

// 404 Handler
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// ════════════════════════════════════════════════════════════════════════════════
// PORT CONFLICT RESOLUTION
// ════════════════════════════════════════════════════════════════════════════════
const findAvailablePort = (startPort = 5000) => {
    return new Promise((resolve) => {
        const testServer = net.createServer();
        testServer.listen(startPort, () => {
            const port = testServer.address().port;
            testServer.close(() => resolve(port));
        });
        testServer.on('error', () => {
            console.log(`⚠️  Port ${startPort} in use, trying ${startPort + 1}...`);
            resolve(findAvailablePort(startPort + 1));
        });
    });
};

// ════════════════════════════════════════════════════════════════════════════════
// START SERVER
// ════════════════════════════════════════════════════════════════════════════════
const startServer = async () => {
    try {
        const finalPort = await findAvailablePort(parseInt(process.env.PORT) || 5000);
        
        server.listen(finalPort, () => {
            console.log(`
╔════════════════════════════════════════════════════════════╗
║   🚀 BLINK v4.0 - PRODUCTION SERVER ONLINE                ║
║   Port: ${finalPort}                                        
║   Environment: ${process.env.NODE_ENV || 'development'}                ║
║   Time: ${new Date().toISOString()}   ║
╚════════════════════════════════════════════════════════════╝
            `);
        });
    } catch (e) {
        console.error('❌ Failed to start server:', e.message);
        process.exit(1);
    }
};

// ════════════════════════════════════════════════════════════════════════════════
// GRACEFUL SHUTDOWN
// ════════════════════════════════════════════════════════════════════════════════
process.on('SIGTERM', () => {
    console.log('\n🛑 SIGTERM received - Graceful shutdown initiated...');
    server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('\n🛑 SIGINT received - Graceful shutdown initiated...');
    server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
    });
});

// ════════════════════════════════════════════════════════════════════════════════
// INITIALIZATION
// ════════════════════════════════════════════════════════════════════════════════
startServer();
