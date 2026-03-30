/**
 * server.js – Blink Platform v4.5 (Production Ready)
 * ═══════════════════════════════════════════════════════════════════════════════
 */

require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
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
// SECURITY & BASIC MIDDLEWARE
// ════════════════════════════════════════════════════════════════════════════════
app.use(helmet({
    contentSecurityPolicy: false, // Required for media streaming
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
// STATIC FILE SERVING
// ════════════════════════════════════════════════════════════════════════════════
// Serve frontend static files
const frontendPath = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendPath));

// ════════════════════════════════════════════════════════════════════════════════
// ROOT ROUTE (Serves frontend homepage)
// ════════════════════════════════════════════════════════════════════════════════
app.get('/', (req, res) => {
    // Priority: Serve index.html if it exists, otherwise fall back to JSON success
    const indexFile = path.join(frontendPath, 'index.html');
    if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
    } else {
        res.json({
            status: 'online',
            message: '🚀 Blink Backend is Live (Homepage missing)',
            timestamp: new Date().toISOString()
        });
    }
});

// ════════════════════════════════════════════════════════════════════════════════
// API ROUTES
// ════════════════════════════════════════════════════════════════════════════════
app.use('/api/auth', authRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/users', userRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/live', liveRoutes);
app.use('/api/upload', uploadRoutes);

// Health check endpoint
const pool = require('./config/db');
app.get('/api/health', async (req, res) => {
    try {
        const dbTest = await pool.testConnection();
        res.json({
            status: dbTest.success ? 'healthy' : 'degraded',
            database: dbTest.success ? 'connected' : 'disconnected',
            version: '4.5.0'
        });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// ════════════════════════════════════════════════════════════════════════════════
// SOCKET.IO INITIALIZATION
// ════════════════════════════════════════════════════════════════════════════════
const io = initSocket(server);
app.set('socketio', io);

// ════════════════════════════════════════════════════════════════════════════════
// ERROR HANDLING MIDDLEWARE (MUST BE LAST)
// ════════════════════════════════════════════════════════════════════════════════
const { errorHandler, notFoundHandler } = require('./middleware/errorMiddleware');

app.use(notFoundHandler); // Catch all undefined routes
app.use(errorHandler);    // Final error response

// ════════════════════════════════════════════════════════════════════════════════
// SERVER STARTUP LOGIC
// ════════════════════════════════════════════════════════════════════════════════
const PORT = process.env.PORT || 5000;

const startServer = async () => {
    try {
        await pool.testConnection();
        server.listen(PORT, () => {
            console.log(`
╔════════════════════════════════════════════════════════════╗
║   🚀 BLINK v4.5 ONLINE - PORT: ${PORT}                      ║
║   Homepage: Serving from /frontend/index.html              ║
║   API: Routes active under /api/...                        ║
╚════════════════════════════════════════════════════════════╝
            `);
        });
    } catch (err) {
        console.error('❌ [CRITICAL] Startup failed:', err.message);
        process.exit(1);
    }
};

startServer();

// GRACEFUL SHUTDOWN
process.on('SIGTERM', () => pool.gracefulShutdown().then(() => process.exit(0)));
process.on('SIGINT', () => pool.gracefulShutdown().then(() => process.exit(0)));
