require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const http = require('http'); // Required for Socket.IO
const { Server } = require('socket.io'); // Socket.IO Server
const app = express();
const server = http.createServer(app);
const pool = require('./config/db');

// --- SOCKET.IO SETUP ---
const io = new Server(server, {
  cors: {
    origin: ["https://blink-yzoo.onrender.com", "http://localhost:3000", "http://localhost:5000"],
    methods: ["GET", "POST"]
  }
});

// --- SECURITY & MIDDLEWARE ---
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            ...helmet.contentSecurityPolicy.getDefaultDirectives(),
            "script-src": ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
            "connect-src": ["'self'", "https://blink-yzoo.onrender.com", "http://localhost:5000", "wss://blink-yzoo.onrender.com"],
            "img-src": ["'self'", "data:", "https://res.cloudinary.com"],
        },
    },
}));

// ── TASK 5: FIX CORS ───────────────────────────────────────────
app.use(cors({
  origin: [
    'https://blink-yzoo.onrender.com',
    'http://localhost:3000',
    'http://localhost:5000'
  ],
  credentials: true,
  methods: ['GET','POST','PUT','DELETE','PATCH','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization']
}));
app.options('*', cors());

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
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )`,
            `CREATE TABLE IF NOT EXISTS live_streams (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                title VARCHAR(255),
                is_live BOOLEAN DEFAULT TRUE,
                started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )`
        ];

        for (let q of baseQueries) await pool.query(q);

        // Migration Check: Fix missing columns or renamed ones
        console.log('👷 Checking table migrations...');
        const [columns] = await pool.query("SHOW COLUMNS FROM videos");
        const columnNames = columns.map(c => c.Field);

        // Check for missing metadata columns
        const needed = {
            'video_url': 'TEXT',
            'public_id': 'VARCHAR(255)',
            'thumbnail_url': 'TEXT',
            'caption': 'TEXT',
            'hashtags': 'TEXT',
            'duration': 'DECIMAL(10,2)',
            'views_count': 'INT DEFAULT 0',
            'likes_count': 'INT DEFAULT 0',
            'is_active': 'BOOLEAN DEFAULT TRUE'
        };

        if (columnNames.includes('url') && !columnNames.includes('video_url')) {
            console.log('🛠️ Renaming legacy "url" to "video_url"...');
            await pool.query("ALTER TABLE videos CHANGE COLUMN url video_url TEXT NOT NULL");
        }
        if (!columnNames.includes('user_id')) {
            console.log('🛠️ Patching missing user_id...');
            await pool.query("ALTER TABLE videos ADD COLUMN user_id INT AFTER id");
        }
        for (const [col, type] of Object.entries(needed)) {
            if (!columnNames.includes(col)) {
                console.log(`🛠️ Patching missing column: ${col}...`);
                await pool.query(`ALTER TABLE videos ADD COLUMN ${col} ${type}`);
            }
        }

        console.log('✅ Production Database Schema Verified!');
    } catch (err) {
        console.error('❌ Database Initialization FAILED:', err.message);
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
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/posts', require('./routes/postRoutes'));
app.use('/api/upload', require('./routes/uploadRoutes'));

// ── FEED API ────────────────────────────────────────────────
app.get("/api/videos", async (req, res) => {
    try {
        const [videos] = await pool.query(
            "SELECT v.*, u.username, u.profile_pic FROM videos v JOIN users u ON v.user_id = u.id ORDER BY v.created_at DESC"
        );
        res.json({ success: true, videos });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── PROFILE VIDEO API ──────────────────
app.get("/api/videos/user/:identifier", async (req, res) => {
    const { identifier } = req.params;
    try {
        let user;
        if (isNaN(identifier)) {
            const [users] = await pool.query("SELECT id FROM users WHERE username = ?", [identifier]);
            user = users[0];
        } else {
            const [users] = await pool.query("SELECT id FROM users WHERE id = ?", [identifier]);
            user = users[0];
        }
        if (!user) return res.status(404).json({ success: false, error: "User not found" });
        const [videos] = await pool.query(
            "SELECT * FROM videos WHERE user_id = ? ORDER BY created_at DESC", [user.id]
        );
        res.json({ success: true, videos: videos.map(v => ({ id: v.id, video_url: v.video_url, created_at: v.created_at, user_id: v.user_id })) });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── LIVE STREAMING APIs ──────────────────────────────────────
app.post('/api/live/start', async (req, res) => {
    try {
        const { userId, title } = req.body;
        const [result] = await pool.query(
            'INSERT INTO live_streams (user_id, title, is_live) VALUES (?, ?, TRUE)',
            [userId, title]
        );
        res.json({ success: true, streamId: result.insertId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/live/stop', async (req, res) => {
    try {
        const { streamId } = req.body;
        await pool.query('UPDATE live_streams SET is_live = FALSE WHERE id = ?', [streamId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/live', async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT ls.*, u.username, u.profile_pic FROM live_streams ls JOIN users u ON ls.user_id = u.id WHERE ls.is_live = TRUE'
        );
        res.json({ success: true, streams: rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Static Frontend
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
