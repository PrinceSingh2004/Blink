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

// ════════════════════════════════════════════════════════════════════════════════
// DATABASE HEALTH CHECK ENDPOINT
// ════════════════════════════════════════════════════════════════════════════════
const pool = require('./config/db');

app.get('/health', async (req, res) => {
    try {
        const dbHealth = pool.getHealthStatus();
        const dbTest = await pool.testConnection();

        res.json({
            status: dbTest.success ? 'OK' : 'ERROR',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            database: dbTest.success ? {
                status: 'connected',
                version: dbTest.mysqlVersion,
                database: dbTest.database,
                responseTime: dbTest.responseTime,
                poolSize: dbHealth.poolConfig.connectionLimit,
                ssl: dbHealth.poolConfig.ssl
            } : {
                status: 'disconnected',
                error: dbTest.message
            },
            memory: {
                rss: `${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`,
                heapUsed: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
                heapTotal: `${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)}MB`
            }
        });
    } catch (err) {
        res.status(500).json({
            status: 'ERROR',
            timestamp: new Date().toISOString(),
            error: err.message
        });
    }
});

// ════════════════════════════════════════════════════════════════════════════════
// SOCKET.IO - REAL-TIME FUNCTIONALITY
// ════════════════════════════════════════════════════════════════════════════════
const io = initSocket(server);
app.set('socketio', io);

// ════════════════════════════════════════════════════════════════════════════════
// ERROR HANDLING MIDDLEWARE
// ════════════════════════════════════════════════════════════════════════════════
const { errorHandler, notFoundHandler, requestTimeout } = require('./middleware/errorMiddleware');

// Request timeout middleware (30 seconds)
app.use(requestTimeout(30000));

// ════════════════════════════════════════════════════════════════════════════════
// ERROR HANDLING MIDDLEWARE (MUST BE LAST)
// ════════════════════════════════════════════════════════════════════════════════
app.use(notFoundHandler);
app.use(errorHandler);

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
// START SERVER WITH DATABASE INITIALIZATION
// ════════════════════════════════════════════════════════════════════════════════
const startServer = async () => {
    try {
        console.log('🚀 [STARTUP] Initializing Blink Backend v4.0...');

        // Step 1: Test database connection
        console.log('🔍 [STARTUP] Testing database connection...');
        const dbTest = await pool.testConnection();

        if (!dbTest.success) {
            throw new Error(`Database connection failed: ${dbTest.message}`);
        }

        console.log('✅ [STARTUP] Database connection established');

        // Step 2: Find available port
        const finalPort = await findAvailablePort(parseInt(process.env.PORT) || 5000);
        console.log(`📡 [STARTUP] Using port: ${finalPort}`);

        // Step 3: Start server
        server.listen(finalPort, () => {
            console.log(`
╔════════════════════════════════════════════════════════════╗
║   🚀 BLINK v4.0 - PRODUCTION SERVER ONLINE                ║
║   Port: ${finalPort}                                        
║   Environment: ${process.env.NODE_ENV || 'development'}                ║
║   Database: ✅ Connected (${dbTest.database})              ║
║   SSL: ✅ Enabled                                          ║
║   Keep-Alive: ✅ Active (30s intervals)                    ║
║   Time: ${new Date().toISOString()}   ║
╚════════════════════════════════════════════════════════════╝
            `);
        });

    } catch (err) {
        console.error('❌ [STARTUP ERROR]', err.message);
        console.error('💡 [STARTUP] Check your environment variables and database configuration');
        process.exit(1);
    }
};

// ════════════════════════════════════════════════════════════════════════════════
// GLOBAL ERROR HANDLERS (PREVENT APP CRASH)
// ════════════════════════════════════════════════════════════════════════════════
process.on('uncaughtException', (err) => {
    console.error('❌ [CRITICAL] Uncaught Exception:', err.message);
    console.error(err.stack);

    // Log to file if in production
    if (process.env.NODE_ENV === 'production') {
        const fs = require('fs');
        const logEntry = `[${new Date().toISOString()}] UNCAUGHT EXCEPTION: ${err.message}\n${err.stack}\n\n`;
        fs.appendFileSync('error.log', logEntry);
    }

    // Don't exit in production - let the app continue
    if (process.env.NODE_ENV !== 'production') {
        process.exit(1);
    }
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ [CRITICAL] Unhandled Rejection at:', promise, 'reason:', reason);

    // Log to file if in production
    if (process.env.NODE_ENV === 'production') {
        const fs = require('fs');
        const logEntry = `[${new Date().toISOString()}] UNHANDLED REJECTION: ${reason}\n\n`;
        fs.appendFileSync('error.log', logEntry);
    }

    // Don't exit in production - let the app continue
    if (process.env.NODE_ENV !== 'production') {
        process.exit(1);
    }
});

// ════════════════════════════════════════════════════════════════════════════════
// GRACEFUL SHUTDOWN WITH DATABASE CLEANUP
// ════════════════════════════════════════════════════════════════════════════════
const gracefulShutdown = async (signal) => {
    console.log(`\n🛑 ${signal} received - Graceful shutdown initiated...`);

    try {
        // Close database pool first
        await pool.gracefulShutdown();

        // Close server
        server.close(() => {
            console.log('✅ Server closed successfully');
            process.exit(0);
        });

        // Force exit after 10 seconds
        setTimeout(() => {
            console.error('❌ Forced shutdown after timeout');
            process.exit(1);
        }, 10000);

    } catch (err) {
        console.error('❌ Error during shutdown:', err.message);
        process.exit(1);
    }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// ════════════════════════════════════════════════════════════════════════════════
// INITIALIZATION
// ════════════════════════════════════════════════════════════════════════════════
startServer();
