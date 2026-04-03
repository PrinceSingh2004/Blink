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
            "img-src": ["'self'", "data:", "https://res.cloudinary.com"],
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
                bio TEXT,
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
                score DECIMAL(15,2) DEFAULT 0,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )`,
            `CREATE TABLE IF NOT EXISTS likes (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                video_id INT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY unique_like (user_id, video_id),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
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
                video_id INT NOT NULL,
                text TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
            )`,
            `CREATE TABLE IF NOT EXISTS live_streams (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                title VARCHAR(255),
                status ENUM('active', 'ended') DEFAULT 'active',
                is_live BOOLEAN DEFAULT TRUE,
                started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )`
        ];

        for (let q of baseQueries) await pool.query(q);

        // Migration Check: Precise column verification for advanced engagement
        console.log('👷 Synchronizing social media pulse (Migrations)...');
        const [columns] = await pool.query("SHOW COLUMNS FROM videos");
        const columnNames = columns.map(c => c.Field);

        const needed = {
            'score': 'DECIMAL(15,2) DEFAULT 0',
            'public_id': 'VARCHAR(255)',
            'thumbnail_url': 'TEXT',
            'caption': 'TEXT',
            'hashtags': 'TEXT',
            'duration': 'DECIMAL(10,2)',
            'views_count': 'INT DEFAULT 0',
            'likes_count': 'INT DEFAULT 0',
            'user_id': 'INT'
        };

        for (const [col, type] of Object.entries(needed)) {
            if (!columnNames.includes(col)) {
                console.log(`🛠️ Patching missing column: ${col}...`);
                await pool.query(`ALTER TABLE videos ADD COLUMN ${col} ${type}`);
            }
        }

        // --- User Profile Patch ---
        const [userCols] = await pool.query("SHOW COLUMNS FROM users");
        const userNames = userCols.map(c => c.Field);
        if (!userNames.includes('bio')) {
            console.log('🛠️ Patching users bio column...');
            await pool.query("ALTER TABLE users ADD COLUMN bio TEXT AFTER profile_pic");
        }

        // --- DATABASE INDEXING (PERFORMANCE) ---
        console.log('⚡ Optimizing indexes for high-speed engagement...');
        const indexQueries = [
            "CREATE INDEX IF NOT EXISTS idx_videos_user_id ON videos(user_id)",
            "CREATE INDEX IF NOT EXISTS idx_videos_created_at ON videos(created_at)",
            "CREATE INDEX IF NOT EXISTS idx_videos_score ON videos(score)",
            "CREATE INDEX IF NOT EXISTS idx_likes_user_video ON likes(user_id, video_id)",
            "CREATE INDEX IF NOT EXISTS idx_comments_video ON comments(video_id)"
        ];
        for (let idxQ of indexQueries) {
            try { await pool.query(idxQ); } catch (e) { /* MySQL 8.0 standard check */ }
        }

        console.log('✅ Blink Universe Database Schema Pulsating!');
    } catch (err) {
        console.error('❌ Database Pulse FAILURE:', err.message);
    }
};

// --- SIGNALING & REALTIME HUB ---
io.on('connection', (socket) => {
    console.log('🛸 Signal Hub: Connection established:', socket.id);

    socket.on('join-stream', (roomId) => {
        socket.join(roomId);
        console.log(`📡 Peer ${socket.id} joined room: ${roomId}`);
        socket.to(roomId).emit('user-joined', socket.id);
    });

    socket.on('offer', (payload) => {
        io.to(payload.target).emit('offer', { sdp: payload.sdp, sender: socket.id });
    });

    socket.on('answer', (payload) => {
        io.to(payload.target).emit('answer', { sdp: payload.sdp, sender: socket.id });
    });

    socket.on('ice-candidate', (payload) => {
        io.to(payload.target).emit('ice-candidate', { candidate: payload.candidate, sender: socket.id });
    });

    socket.on('send-message', (data) => {
        io.to(data.roomId).emit('receive-message', {
            username: data.username,
            text: data.text,
            time: new Date().toLocaleTimeString()
        });
    });

    socket.on('disconnect', () => {
        console.log('🔌 Signal Hub: Peer disconnected:', socket.id);
    });
});

// --- ROUTES ---
const postRoutes = require('./routes/postRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const engagementRoutes = require('./routes/engagementRoutes');

app.use('/api/posts', postRoutes);
app.use('/api/upload', uploadRoutes); // Dedicated upload routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/social', engagementRoutes); // New Engagement Engine

// ── MODULAR ROUTE ARCHITECTURE (Production Upgrade) ──────────
const authRoutes       = require('./routes/authRoutes');
const videoRoutes      = require('./routes/videos.js'); // Main Videos & Feed
const postRoutes       = require('./routes/postRoutes');
const uploadRoutes     = require('./routes/uploadRoutes');
const userRoutes       = require('./routes/userRoutes');
const engagementRoutes = require('./routes/engagementRoutes');

app.use('/api/auth',    authRoutes);
app.use('/api/videos',  videoRoutes); // Unified video & feed API
app.use('/api/posts',   postRoutes);
app.use('/api/upload',  uploadRoutes);
app.use('/api/users',   userRoutes);
app.use('/api/social',  engagementRoutes);

// Static Uploads & Frontend Assets
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, '../frontend')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// 404 Handler
app.use((req, res) => res.status(404).json({ error: "Route not found" }));

// --- STARTUP ---
const PORT = process.env.PORT || 5000;
server.listen(PORT, async () => {
    await initDB();
    console.log(`🚀 Blink Production Engine running on port ${PORT}`);
});
