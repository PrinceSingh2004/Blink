/**
 * server.js
 * ═══════════════════════════════════════════════════════════
 * Blink Platform – Next.js + Express + Custom Server Engine
 * ═══════════════════════════════════════════════════════════
 * Full production-ready backend supporting Next.js frontend,
 * Real-Time WebRTC, Socket.IO Chat, Cloudinary Storage, and
 * MySQL DB connection pooling.
 * ═══════════════════════════════════════════════════════════
 */

require('dotenv').config();
const express = require('express');
const next = require('next');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const mysql = require('mysql2/promise');
const multer = require('multer');
const { v2: cloudinary } = require('cloudinary');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');

const dev = process.env.NODE_ENV !== 'production';
const nextApp = next({ dev });
const handle = nextApp.getRequestHandler();

const PORT = process.env.PORT || 4000;
const FRONTEND_URL = process.env.FRONTEND_URL || "*";

// 1. Database Connection (MySQL Pool with SSL for Railway)
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: parseInt(process.env.DB_PORT) || 3306,
    ssl: { rejectUnauthorized: false },
    waitForConnections: true,
    connectionLimit: 15,
    queueLimit: 0,
    connectTimeout: 20000
});

// Auto-initialize DB Tables (Production-Safe)
const initDB = async () => {
    try {
        const conn = await pool.getConnection();
        console.log('[DB] ✅ Connected to MySQL');
        
        await conn.query(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                profile_pic VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await conn.query(`
            CREATE TABLE IF NOT EXISTS posts (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                image_url VARCHAR(255),
                caption TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);
        await conn.query(`
            CREATE TABLE IF NOT EXISTS chats (
                id INT AUTO_INCREMENT PRIMARY KEY,
                room_id VARCHAR(100) NOT NULL,
                sender_id INT NOT NULL,
                message TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);
        await conn.query(`
            CREATE TABLE IF NOT EXISTS streams (
                id INT AUTO_INCREMENT PRIMARY KEY,
                stream_id VARCHAR(100) UNIQUE NOT NULL,
                user_id INT NOT NULL,
                title VARCHAR(100),
                is_live BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);
        conn.release();
    } catch (err) {
        console.error('[DB ERROR] ❌ Auto-init failed:', err.message);
    }
};

// 2. Cloudinary Config & Storage Ordinance
cloudinary.config({
    cloudinary_url: process.env.CLOUDINARY_URL
});

const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'blink-profiles',
        allowed_formats: ['jpg', 'png', 'jpeg']
    }
});
const upload = multer({ storage });

// 3. Authentication Middleware
const requireAuth = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    const token = authHeader.split(' ')[1];
    try {
        req.user = jwt.verify(token, process.env.JWT_SECRET || 'secret');
        next();
    } catch (err) {
        return res.status(401).json({ success: false, error: 'Invalid Token' });
    }
};

// 4. Initialize Next.js & Express Application
nextApp.prepare().then(() => {
    initDB();

    const app = express();
    const server = http.createServer(app);
    const io = socketIo(server, {
        cors: { origin: FRONTEND_URL, methods: ["GET", "POST"] }
    });

    // Security & Parsing Middleware
    app.use(helmet({ contentSecurityPolicy: false })); // Excluded CSP for Next.js hydration
    app.use(cors({ origin: FRONTEND_URL }));
    app.use(compression());
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // API Rate Limiting (Abuse Prevention)
    const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 150 });
    app.use('/api/', limiter);

    // ─── API Routes ──────────────────────────────────────────────

    // User Creation
    app.post('/api/auth/register', async (req, res) => {
        try {
            const { username, password } = req.body;
            const hash = await bcrypt.hash(password, 12);
            const [result] = await pool.query('INSERT INTO users (username, password_hash) VALUES (?, ?)', [username, hash]);
            const token = jwt.sign({ id: result.insertId, username }, process.env.JWT_SECRET || 'secret', { expiresIn: '7d' });
            res.json({ success: true, token });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // Login & JWT Delivery
    app.post('/api/auth/login', async (req, res) => {
        try {
            const { username, password } = req.body;
            const [users] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);
            if (!users.length) return res.status(401).json({ success: false, error: 'Invalid credentials' });
            
            const valid = await bcrypt.compare(password, users[0].password_hash);
            if (!valid) return res.status(401).json({ success: false, error: 'Invalid credentials' });

            const token = jwt.sign({ id: users[0].id, username }, process.env.JWT_SECRET || 'secret', { expiresIn: '7d' });
            res.json({ success: true, token });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // Cloudinary Persistent Profile Uploads
    app.post('/api/user/profile-photo', requireAuth, upload.single('profile_pic'), async (req, res) => {
        try {
            if (!req.file) return res.status(400).json({ success: false, error: 'No image uploaded' });
            // Cloudinary returns full persistent URL in req.file.path
            const profilePicUrl = req.file.path;
            await pool.query('UPDATE users SET profile_pic = ? WHERE id = ?', [profilePicUrl, req.user.id]);
            res.json({ success: true, profile_pic: profilePicUrl });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // ─── WebRTC & Real-Time Socket.IO Hub ────────────────────────────
    io.on('connection', (socket) => {
        console.log('[Socket] Connected:', socket.id);

        // Room Subscriptions (Live Streams & Chat)
        socket.on('joinRoom', (roomId) => {
            socket.join(roomId);
            console.log(`[Socket] ${socket.id} joined ${roomId}`);
        });

        // Instant DB-Persistent Chat Messaging
        socket.on('sendMessage', async (data) => {
            try {
                // Permanently log to MySQL 
                await pool.query(
                    'INSERT INTO chats (room_id, sender_id, message) VALUES (?, ?, ?)',
                    [data.roomId, data.senderId, data.message]
                );
                // Broadcast to active room instantly
                io.to(data.roomId).emit('receiveMessage', {
                    ...data, timestamp: new Date()
                });
            } catch (err) {
                console.error('[Socket Error] Chat save failed:', err.message);
            }
        });

        // WebRTC Deep Signaling Architecture (Offers, Answers, STUN/TURN ICE)
        socket.on('stream_offer', (data) => {
            socket.to(data.room).emit('stream_offer', { offer: data.offer, from: socket.id });
        });

        socket.on('stream_answer', (data) => {
            socket.to(data.to).emit('stream_answer', { answer: data.answer, from: socket.id });
        });

        socket.on('stream_ice_candidate', (data) => {
            socket.to(data.room).emit('stream_ice_candidate', { candidate: data.candidate, from: socket.id });
        });
        
        // Live Stream State Management
        socket.on('start_stream', async (data) => {
            const streamId = data.streamId;
            socket.join(`live_${streamId}`);
            await pool.query('INSERT IGNORE INTO streams (stream_id, user_id, title) VALUES (?, ?, ?)', [streamId, data.userId, data.title]);
            socket.broadcast.emit('stream_started', { streamId, title: data.title });
        });

        socket.on('stop_stream', async (data) => {
            await pool.query('UPDATE streams SET is_live = FALSE WHERE stream_id = ?', [data.streamId]);
            socket.to(`live_${data.streamId}`).emit('stream_ended', { streamId: data.streamId });
        });

        socket.on('disconnect', () => {
            console.log('[Socket] Disconnected:', socket.id);
        });
    });

    // ─── Next.js Fallback Engine ─────────────────────────────────────
    // Passes all non-API requests natively to Next.js
    app.all('*', (req, res) => {
        return handle(req, res);
    });

    // Start Gateway
    server.listen(PORT, () => {
        console.log(`🚀 Blink Platform (Next.js Hybrid Runtime) active on port ${PORT}`);
    });
});
