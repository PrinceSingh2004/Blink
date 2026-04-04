const express = require('express');
const path = require('path');
const cors = require('cors');
const dotenv = require('dotenv');
const helmet = require('helmet');

dotenv.config();

const http = require('http'); // Required for Socket.IO
const { Server } = require('socket.io'); // Socket.IO Server
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const jwt = require('jsonwebtoken');
const pool = require('./config/db');

// --- SECURITY & MIDDLEWARE ---
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            ...helmet.contentSecurityPolicy.getDefaultDirectives(),
            "script-src": ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
            "connect-src": ["'self'", "*"],
            "img-src": ["'self'", "data:", "https://res.cloudinary.com", "https://via.placeholder.com"],
            "media-src": ["'self'", "https://res.cloudinary.com", "http://localhost:5000", "https://blink-yzoo.onrender.com", "blob:", "data:"],
        },
    },
}));

// ── TASK 5: FIX CORS ───────────────────────────────────────────
app.use(cors({
  origin: '*',
  methods: ['GET','POST','PUT','DELETE','PATCH','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization']
}));
app.options('*', cors());

// Add Headers for streaming just in case 
app.use((req, res, next) => {
    res.setHeader('Accept-Ranges', 'bytes');
    if (req.path.endsWith('.mp4')) res.setHeader('Content-Type', 'video/mp4');
    next();
});

// ── TASK 4: ROUTE DEBUGGING ──────────────────────────────────
app.use('/api', (req, res, next) => {
  console.log(`[API] ${req.method} ${req.path}`, 
    'Auth:', !!req.headers.authorization);
  next();
});

app.use(express.json());

// ── PRIORITY STATIC ASSETS ──
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, '../frontend')));

// --- DATABASE INITIALIZATION & MIGRATION ---
const initDB = async () => {
    console.log('🔄 Initializing Production Database Schema...');
    try {
        const baseQueries = [
            `CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY, 
                username VARCHAR(50) UNIQUE NOT NULL, 
                email VARCHAR(100) UNIQUE NOT NULL, 
                password VARCHAR(255) NOT NULL, 
                profile_pic TEXT, 
                avatar_url TEXT,
                profile_photo TEXT,
                bio TEXT,
                is_verified BOOLEAN DEFAULT FALSE,
                posts_count INT DEFAULT 0,
                followers_count INT DEFAULT 0,
                following_count INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,
            `CREATE TABLE IF NOT EXISTS videos (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                video_url TEXT NOT NULL,
                public_id VARCHAR(255),
                thumbnail_url TEXT,
                caption TEXT,
                hashtags TEXT,
                duration DECIMAL(10,2),
                views_count INT DEFAULT 0,
                likes_count INT DEFAULT 0,
                comments_count INT DEFAULT 0,
                shares_count INT DEFAULT 0,
                score DECIMAL(15,2) DEFAULT 0,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )`,
            `CREATE TABLE IF NOT EXISTS likes (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                post_id INT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY unique_like (user_id, post_id),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (post_id) REFERENCES videos(id) ON DELETE CASCADE
            )`,
            `CREATE TABLE IF NOT EXISTS followers (
                id INT AUTO_INCREMENT PRIMARY KEY,
                follower_id INT NOT NULL,
                following_id INT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY unique_follow (follower_id, following_id),
                FOREIGN KEY (follower_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (following_id) REFERENCES users(id) ON DELETE CASCADE
            )`,
            `CREATE TABLE IF NOT EXISTS comments (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                post_id INT NOT NULL,
                comment TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (post_id) REFERENCES videos(id) ON DELETE CASCADE
            )`,
            `CREATE TABLE IF NOT EXISTS live_streams (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                title VARCHAR(255),
                status ENUM('active', 'ended') DEFAULT 'active',
                is_live BOOLEAN DEFAULT TRUE,
                started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )`,
            `CREATE TABLE IF NOT EXISTS notifications (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                actor_id INT,
                type ENUM('like', 'comment', 'follow', 'mention') NOT NULL,
                entity_type ENUM('video', 'user', 'comment'),
                entity_id INT,
                message TEXT,
                is_read BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )`,
            `CREATE TABLE IF NOT EXISTS messages (
                id INT AUTO_INCREMENT PRIMARY KEY,
                sender_id INT NOT NULL,
                receiver_id INT NOT NULL,
                text TEXT NOT NULL,
                is_read BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
            )`
        ];

        for (let q of baseQueries) await pool.query(q);

        // Migration Check
        const [columns] = await pool.query("SHOW COLUMNS FROM videos");
        const columnNames = columns.map(c => c.Field);
        const needed = { 'score': 'DECIMAL(15,2) DEFAULT 0', 'public_id': 'VARCHAR(255)', 'thumbnail_url': 'TEXT', 'caption': 'TEXT', 'hashtags': 'TEXT', 'duration': 'DECIMAL(10,2)', 'views_count': 'INT DEFAULT 0', 'likes_count': 'INT DEFAULT 0', 'comments_count': 'INT DEFAULT 0', 'shares_count': 'INT DEFAULT 0', 'user_id': 'INT' };
        for (const [col, type] of Object.entries(needed)) { if (!columnNames.includes(col)) await pool.query(`ALTER TABLE videos ADD COLUMN ${col} ${type}`); }

        const [userCols] = await pool.query("SHOW COLUMNS FROM users");
        const userNames = userCols.map(c => c.Field);
        const userNeeded = { 'bio': 'TEXT', 'is_verified': 'BOOLEAN DEFAULT FALSE', 'posts_count': 'INT DEFAULT 0', 'followers_count': 'INT DEFAULT 0', 'following_count': 'INT DEFAULT 0', 'avatar_url': 'TEXT', 'profile_photo': 'TEXT' };
        for (const [col, type] of Object.entries(userNeeded)) { if (!userNames.includes(col)) await pool.query(`ALTER TABLE users ADD COLUMN ${col} ${type}`); }

        console.log('✅ Blink Universe Database Schema Pulsating!');
    } catch (err) {
        console.error('❌ Database Pulse FAILURE:', err.message);
    }
};

// --- SIGNALING & REALTIME HUB ---
io.on('connection', (socket) => {
    socket.on('disconnect', () => console.log('🔌 Signal Hub: Peer disconnected'));
});

// ── MODULAR ROUTE ARCHITECTURE ──
const authRoutes       = require('./routes/authRoutes');
const videoRoutes      = require('./routes/videos.js');
const postRoutes       = require('./routes/postRoutes');
const uploadRoutes     = require('./routes/uploadRoutes');
const userRoutes       = require('./routes/userRoutes');
const engagementRoutes = require('./routes/engagementRoutes');
const searchRoutes     = require('./routes/searchRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const messageRoutes      = require('./routes/messageRoutes');
const liveRoutes         = require('./routes/live');

app.use('/api/auth',    authRoutes);
app.use('/api/videos',  videoRoutes);
app.use('/api/posts',   postRoutes);
app.use('/api/upload',  uploadRoutes);
app.use('/api/users',   userRoutes);
app.use('/api/social',  engagementRoutes);
app.use('/api/search',  searchRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/live', liveRoutes);

// SPA Routing Priority
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index_responsive.html'));
});

// Catch-all for SPA (excluding file extensions and API)
app.get(/^[^\.]*$/, (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(__dirname, '../frontend/index_responsive.html'));
});

// Global Error Handler
app.use((err, req, res, next) => {
    console.error('🔥 ERROR:', err.stack);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
});

// 404 Handler for API & missing files
app.use((req, res) => {
    if (req.path.startsWith('/api')) return res.status(404).json({ error: "API Route not found" });
    res.status(404).send("File not found");
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, async () => {
    await initDB();
    console.log(`🚀 Blink Production Engine running on port ${PORT}`);
});
