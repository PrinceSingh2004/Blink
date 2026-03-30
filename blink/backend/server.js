/**
 * server.js – Blink Platform v5.0 (Production Ready)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Safe module loading, route validation, graceful error handling
 * ═══════════════════════════════════════════════════════════════════════════════
 */

require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');

// ════════════════════════════════════════════════════════════════════════════════
// ENV VARIABLE WARNINGS
// ════════════════════════════════════════════════════════════════════════════════
['JWT_SECRET', 'DB_HOST', 'DB_USER', 'DB_NAME'].forEach(key => {
    if (!process.env[key]) {
        console.warn(`⚠️  Missing env var: ${key}`);
    }
});

// ════════════════════════════════════════════════════════════════════════════════
// SAFE REQUIRE — If a route file crashes, the server still starts
// ════════════════════════════════════════════════════════════════════════════════
function safeRequire(modulePath, label) {
    try {
        const mod = require(modulePath);
        console.log(`✅ Loaded: ${label}`);
        return mod;
    } catch (err) {
        console.error(`❌ Failed to load: ${label} — ${err.message}`);
        // Return a fallback router that returns 503 for this module's routes
        const fallback = express.Router();
        fallback.use((req, res) => {
            res.status(503).json({
                error: true,
                message: `${label} module is temporarily unavailable`,
                detail: process.env.NODE_ENV === 'development' ? err.message : undefined
            });
        });
        return fallback;
    }
}

// ════════════════════════════════════════════════════════════════════════════════
// ROUTE IMPORTS (safe — won't crash server if one fails)
// ════════════════════════════════════════════════════════════════════════════════
const authRoutes    = safeRequire('./routes/auth',          'Auth Routes');
const postRoutes    = safeRequire('./routes/postRoutes',    'Post Routes');
const userRoutes    = safeRequire('./routes/userRoutes',    'User Routes');
const messageRoutes = safeRequire('./routes/messageRoutes', 'Message Routes');
const liveRoutes    = safeRequire('./routes/liveRoutes',    'Live Routes');
const uploadRoutes  = safeRequire('./routes/uploadRoutes',  'Upload Routes');

// ════════════════════════════════════════════════════════════════════════════════
// SOCKET.IO (safe import)
// ════════════════════════════════════════════════════════════════════════════════
let initSocket;
try {
    initSocket = require('./socket/socketHandler').initSocket;
    console.log('✅ Loaded: Socket Handler');
} catch (err) {
    console.warn('⚠️  Socket handler not available:', err.message);
    initSocket = (server) => ({
        to: () => ({ emit: () => {} }),
        emit: () => {}
    });
}

// ════════════════════════════════════════════════════════════════════════════════
// EXPRESS APP
// ════════════════════════════════════════════════════════════════════════════════
const app = express();
const server = http.createServer(app);

// ════════════════════════════════════════════════════════════════════════════════
// SECURITY
// ════════════════════════════════════════════════════════════════════════════════
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

// ════════════════════════════════════════════════════════════════════════════════
// CORS
// ════════════════════════════════════════════════════════════════════════════════
const allowedOrigins = [
    process.env.CORS_ORIGIN,
    'https://blink-yzoo.onrender.com',
    'http://localhost:3000',
    'http://localhost:5000',
    'http://127.0.0.1:5000'
].filter(Boolean);

app.use(cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.options('*', cors()); // Handle preflight

// ════════════════════════════════════════════════════════════════════════════════
// BODY PARSING (10mb limit — not 100mb, to prevent memory exhaustion)
// ════════════════════════════════════════════════════════════════════════════════
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// ════════════════════════════════════════════════════════════════════════════════
// STATIC FILE SERVING
// ════════════════════════════════════════════════════════════════════════════════
const frontendPath = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendPath));

// ════════════════════════════════════════════════════════════════════════════════
// ROOT ROUTE
// ════════════════════════════════════════════════════════════════════════════════
app.get('/', (req, res) => {
    const indexFile = path.join(frontendPath, 'index.html');
    if (fs.existsSync(indexFile)) {
        return res.sendFile(indexFile);
    }
    res.json({
        status: 'online',
        message: 'Blink Backend API v5.0',
        timestamp: new Date().toISOString()
    });
});

// ════════════════════════════════════════════════════════════════════════════════
// API ROUTES
// ════════════════════════════════════════════════════════════════════════════════
app.use('/api/auth',     authRoutes);
app.use('/api/posts',    postRoutes);
app.use('/api/users',    userRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/live',     liveRoutes);
app.use('/api/upload',   uploadRoutes);

// ════════════════════════════════════════════════════════════════════════════════
// HEALTH CHECK (safe — works even if pool.testConnection doesn't exist)
// ════════════════════════════════════════════════════════════════════════════════
const pool = require('./config/db');

app.get('/api/health', async (req, res) => {
    try {
        let dbStatus = 'unknown';
        if (typeof pool.testConnection === 'function') {
            const dbTest = await pool.testConnection();
            dbStatus = dbTest.success ? 'connected' : 'disconnected';
        } else {
            await pool.query('SELECT 1');
            dbStatus = 'connected';
        }
        res.json({
            status: 'healthy',
            database: dbStatus,
            version: '5.0.0',
            uptime: process.uptime()
        });
    } catch (err) {
        res.status(500).json({ status: 'error', database: 'disconnected', message: err.message });
    }
});

// ════════════════════════════════════════════════════════════════════════════════
// SOCKET.IO
// ════════════════════════════════════════════════════════════════════════════════
const io = initSocket(server);
app.set('socketio', io);

// ════════════════════════════════════════════════════════════════════════════════
// ERROR HANDLING (safe import — server won't crash if errorMiddleware is broken)
// ════════════════════════════════════════════════════════════════════════════════
let notFoundHandler, errorHandler;
try {
    const errorMiddleware = require('./middleware/errorMiddleware');
    notFoundHandler = errorMiddleware.notFoundHandler;
    errorHandler = errorMiddleware.errorHandler;
    console.log('✅ Loaded: Error Middleware');
} catch (err) {
    console.warn('⚠️  Error middleware not available, using fallbacks:', err.message);
    notFoundHandler = (req, res) => {
        res.status(404).json({
            error: true,
            message: `Route not found: ${req.method} ${req.originalUrl}`
        });
    };
    errorHandler = (err, req, res, next) => {
        console.error('Server error:', err.message);
        if (!res.headersSent) {
            res.status(err.status || 500).json({
                error: true,
                message: err.message || 'Internal server error'
            });
        }
    };
}

app.use(notFoundHandler);
app.use(errorHandler);

// ════════════════════════════════════════════════════════════════════════════════
// ROUTE VALIDATION (runs before listen — catches undefined handlers)
// ════════════════════════════════════════════════════════════════════════════════
function validateRoutes(app) {
    const issues = [];
    if (app._router && app._router.stack) {
        app._router.stack.forEach(layer => {
            if (layer.handle && layer.handle.stack) {
                layer.handle.stack.forEach(route => {
                    if (route.route) {
                        route.route.stack.forEach(handler => {
                            if (typeof handler.handle !== 'function') {
                                issues.push(`Route ${route.route.path} has undefined handler`);
                            }
                        });
                    }
                });
            }
        });
    }

    if (issues.length > 0) {
        console.error('❌ Route validation FAILED:');
        issues.forEach(issue => console.error('  -', issue));
        process.exit(1); // Stop deploy immediately — don't serve broken routes
    } else {
        console.log('✅ All routes validated — no undefined handlers');
    }
}

validateRoutes(app);

// ════════════════════════════════════════════════════════════════════════════════
// SERVER STARTUP
// ════════════════════════════════════════════════════════════════════════════════
const PORT = process.env.PORT || 5000;

const startServer = async () => {
    // Test DB connection (warn only — don't crash if DB is temporarily down)
    try {
        if (typeof pool.testConnection === 'function') {
            const result = await pool.testConnection();
            if (!result.success) {
                console.warn('⚠️  Database connection test failed:', result.message);
            }
        } else {
            await pool.query('SELECT 1');
            console.log('✅ Database connected');
        }
    } catch (err) {
        console.warn('⚠️  Database not reachable at startup:', err.message);
        // Don't exit — the server can still serve static files and retry DB later
    }

    server.listen(PORT, () => {
        console.log(`
╔══════════════════════════════════════════════════════════╗
║   🚀 BLINK v5.0 — ONLINE                                ║
║   Port:     ${PORT}                                          ║
║   Frontend: ${frontendPath}   ║
║   API:      /api/auth, /api/posts, /api/users            ║
║   Health:   /api/health                                  ║
╚══════════════════════════════════════════════════════════╝
        `);
    });
};

startServer();

// ════════════════════════════════════════════════════════════════════════════════
// GRACEFUL SHUTDOWN (safe — checks method exists before calling)
// ════════════════════════════════════════════════════════════════════════════════
const shutdown = async (signal) => {
    console.log(`\n🔄 ${signal} received — shutting down gracefully...`);
    try {
        if (typeof pool.gracefulShutdown === 'function') {
            await pool.gracefulShutdown();
        } else if (typeof pool.end === 'function') {
            await pool.end();
        }
    } catch (err) {
        console.error('Shutdown error:', err.message);
    }
    process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// ════════════════════════════════════════════════════════════════════════════════
// UNHANDLED ERROR CATCHERS (prevents silent crashes on Render)
// ════════════════════════════════════════════════════════════════════════════════
process.on('unhandledRejection', (reason) => {
    console.error('❌ Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception:', err.message);
    process.exit(1);
});
