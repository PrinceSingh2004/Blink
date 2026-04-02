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
    origin: "*",
    methods: ["GET", "POST"]
  }
});

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
app.use('/api/videos', postRoutes); // Legacy feed alias

app.get("/api/videos", async (req, res) => {
    try {
        const [videos] = await pool.query(`
            SELECT v.*, u.username, u.profile_pic 
            FROM videos v
            JOIN users u ON v.user_id = u.id
            WHERE v.is_active = TRUE
            ORDER BY v.created_at DESC
        `);
        res.json(videos);
    } catch (err) {
        console.error("ERROR:", err);
        res.status(500).json({ error: "Failed to fetch videos" });
    }
});

// ── VIEW TRACKING API (NON-CRITICAL) ────────────────────────
app.post('/api/posts/view', async (req, res) => {
    try {
        const { id, videoId } = req.body;
        const targetId = id || videoId;

        if (targetId) {
            await pool.execute(
                `UPDATE videos SET views_count = COALESCE(views_count, 0) + 1 WHERE id = ?`,
                [targetId]
            );
        }
        res.json({ success: true }); // Always return success for metrics
    } catch (err) {
        res.status(200).json({ success: true }); // Silent fail
    }
});

// ── NEW APP REQUIREMENTS: LIKE, COMMENT, SHARE ─────────────

// POST /api/like
app.post('/api/like', async (req, res) => {
    try {
        const { user_id, video_id } = req.body;
        if (!user_id || !video_id) return res.status(400).json({ error: "Missing parameters" });

        // Check if already liked
        const [existing] = await pool.query(
            "SELECT id FROM likes WHERE user_id = ? AND video_id = ?",
            [user_id, video_id]
        );

        let liked = false;
        if (existing.length > 0) {
            // Unlike
            await pool.execute("DELETE FROM likes WHERE user_id = ? AND video_id = ?", [user_id, video_id]);
            await pool.execute("UPDATE videos SET likes_count = GREATEST(0, likes_count - 1) WHERE id = ?", [video_id]);
        } else {
            // Like
            await pool.execute("INSERT INTO likes (user_id, video_id) VALUES (?, ?)", [user_id, video_id]);
            await pool.execute("UPDATE videos SET likes_count = likes_count + 1 WHERE id = ?", [video_id]);
            liked = true;
        }

        // Get total likes
        const [video] = await pool.query("SELECT likes_count FROM videos WHERE id = ?", [video_id]);
        const totalLikes = video[0] ? video[0].likes_count : 0;

        res.json({ liked, totalLikes });
    } catch (err) {
        res.status(500).json({ error: "Internal server error liking video." });
    }
});

// GET /api/likes/:video_id
app.get('/api/likes/:video_id', async (req, res) => {
    try {
        const { video_id } = req.params;
        const [video] = await pool.query("SELECT likes_count FROM videos WHERE id = ?", [video_id]);
        res.json({ totalLikes: video[0] ? video[0].likes_count : 0 });
    } catch (err) {
        res.status(500).json({ error: "Failed to get likes count." });
    }
});

// POST /api/comment
app.post('/api/comment', async (req, res) => {
    try {
        const { user_id, video_id, text } = req.body;
        if (!user_id || !video_id || !text) return res.status(400).json({ error: "Missing parameters" });

        const [result] = await pool.execute(
            "INSERT INTO comments (user_id, video_id, text) VALUES (?, ?, ?)",
            [user_id, video_id, text]
        );

        const newCommentId = result.insertId;
        const [newComment] = await pool.query(
            "SELECT c.*, u.username, u.profile_pic FROM comments c JOIN users u ON c.user_id = u.id WHERE c.id = ?",
            [newCommentId]
        );

        res.json({ success: true, comment: newComment[0] });
    } catch (err) {
        res.status(500).json({ error: "Internal server error adding comment." });
    }
});

// GET /api/comments/:video_id
app.get('/api/comments/:video_id', async (req, res) => {
    try {
        const { video_id } = req.params;
        const [comments] = await pool.query(
            `SELECT c.*, u.username, u.profile_pic 
             FROM comments c 
             JOIN users u ON c.user_id = u.id 
             WHERE c.video_id = ? 
             ORDER BY c.created_at DESC`,
            [video_id]
        );
        res.json(comments);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch comments." });
    }
});

// GET /api/video/:id
app.get('/api/video/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const [video] = await pool.query(
            `SELECT v.*, u.username, u.profile_pic 
             FROM videos v JOIN users u ON v.user_id = u.id 
             WHERE v.id = ?`,
            [id]
        );
        if (video.length > 0) {
            res.json({ video: video[0], shareUrl: `${req.protocol}://${req.get('host')}/?v=${id}` });
        } else {
            res.status(404).json({ error: "Video not found" });
        }
    } catch (err) {
        res.status(500).json({ error: "Failed to get video" });
    }
});

// GET /api/search
app.get('/api/search', async (req, res) => {
    try {
        const query = req.query.q;
        if (!query) return res.json([]);

        // Unified Search Query
        const [results] = await pool.query(`
            SELECT 'user' AS type, id, username AS title, profile_pic AS image
            FROM users
            WHERE username LIKE ?
            UNION
            SELECT 'video' AS type, id, caption AS title, thumbnail_url AS image
            FROM videos
            WHERE caption LIKE ?
            LIMIT 20
        `, [`%${query}%`, `%${query}%`]);

        res.json(results);
    } catch (err) {
        console.error('Search error:', err);
        res.status(500).json({ error: "Search system fault." });
    }
});

// ── LIVE STREAMING APIs ──────────────────────────────────────
app.post('/api/live/start', async (req, res) => {
    try {
        const { userId, title } = req.body;
        const [result] = await pool.query(
            'INSERT INTO live_streams (user_id, title, status, is_live) VALUES (?, ?, "active", TRUE)',
            [userId, title || "Live Pulse"]
        );
        res.json({ success: true, streamId: result.insertId });
    } catch (err) {
        res.status(500).json({ error: "Failed to initialize live pulse." });
    }
});

app.post('/api/live/stop', async (req, res) => {
    try {
        const { streamId, userId } = req.body;
        
        // Security: Ensure owner identity
        const [stream] = await pool.query("SELECT user_id FROM live_streams WHERE id = ?", [streamId]);
        if (!stream.length || stream[0].user_id != userId) {
            return res.status(403).json({ error: "Unauthorized stream termination attempted." });
        }

        await pool.query(
            'UPDATE live_streams SET status = "ended", is_live = FALSE WHERE id = ?',
            [streamId]
        );

        // Real-time Pulse: Notify all observers
        io.to(`stream-${streamId}`).emit('stream-ended');
        
        res.json({ success: true, message: "Universe broadcast terminated." });
    } catch (err) {
        res.status(500).json({ error: "Failed to terminate broadcast." });
    }
});

app.get('/api/live', async (req, res) => {
    try {
        const [streams] = await pool.query(
            `SELECT l.*, u.username, u.profile_pic 
             FROM live_streams l 
             JOIN users u ON l.user_id = u.id 
             WHERE l.is_live = TRUE AND l.status = "active" 
             ORDER BY l.started_at DESC`
        );
        res.json({ success: true, streams });
    } catch (err) {
        res.status(500).json({ error: "Failed to load active broadcasts." });
    }
});

// Static Uploads & Frontend
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
