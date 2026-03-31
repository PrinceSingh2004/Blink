require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const app = express();
const pool = require('./config/db');

// --- SECURITY & MIDDLEWARE ---
// Making CSP more permissive to allow your frontend inline scripts and Cloudinary images
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            ...helmet.contentSecurityPolicy.getDefaultDirectives(),
            "script-src": ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
            "connect-src": ["'self'", "https://blink-yzoo.onrender.com", "http://localhost:5000"],
            "img-src": ["'self'", "data:", "https://res.cloudinary.com"],
        },
    },
}));
app.use(cors());
app.use(express.json());

// --- DATABASE INITIALIZATION ---
const initDB = async () => {
    try {
        console.log('🔄 Initializing Database Tables...');
        const queries = [
            `CREATE TABLE IF NOT EXISTS users (id INT AUTO_INCREMENT PRIMARY KEY, username VARCHAR(50) UNIQUE, email VARCHAR(100) UNIQUE, password VARCHAR(255), profile_pic TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
            `CREATE TABLE IF NOT EXISTS posts (id INT AUTO_INCREMENT PRIMARY KEY, user_id INT, media_url TEXT, caption TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)`,
            `CREATE TABLE IF NOT EXISTS videos (id INT AUTO_INCREMENT PRIMARY KEY, url TEXT, user_id INT, caption TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)`,
            `CREATE TABLE IF NOT EXISTS likes (id INT AUTO_INCREMENT PRIMARY KEY, user_id INT, post_id INT, UNIQUE KEY unique_like (user_id, post_id), FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE)`,
            `CREATE TABLE IF NOT EXISTS comments (id INT AUTO_INCREMENT PRIMARY KEY, user_id INT, post_id INT, comment TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE)`
        ];

        for (let query of queries) {
            await pool.query(query);
        }
        console.log('✅ Database Tables Verified/Created!');
    } catch (err) {
        console.error('❌ Failed to Initialize DB:', err.message);
    }
};

// --- ROUTES ---
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/posts', require('./routes/postRoutes'));
app.use('/api/upload', require('./routes/uploadRoutes'));
app.use('/api', require('./routes/healthRoutes'));

// ── TASK 1 & 5: FEED API ─────────────────────────────────────
app.get("/api/videos", async (req, res) => {
    try {
        console.log("Fetching videos...");

        const [videos] = await pool.query(
            "SELECT v.*, u.username, u.profile_pic FROM videos v JOIN users u ON v.user_id = u.id ORDER BY v.created_at DESC"
        );

        console.log(`Fetched ${videos.length} videos`);

        res.json({ success: true, videos });

    } catch (err) {
        console.error("❌ ERROR in /api/videos:", err);
        res.status(500).json({
            success: false,
            error: err.message
        });
    }
});

// ── TASK 4: TEST DB ROUTE ─────────────────────────────────────
app.get("/api/test-db", async (req, res) => {
    try {
        const [rows] = await pool.query("SELECT 1");
        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

// ── PROFILE VIDEO API ──────────────────
app.get("/api/videos/user/:identifier", async (req, res) => {
    const { identifier } = req.params;
    console.log("Fetching universe content for identity:", identifier);

    try {
        let user;
        if (isNaN(identifier)) {
            // Find by username
            const [users] = await pool.query("SELECT id FROM users WHERE username = ?", [identifier]);
            user = users[0];
        } else {
            // Find by userId
            const [users] = await pool.query("SELECT id FROM users WHERE id = ?", [identifier]);
            user = users[0];
        }

        if (!user) {
            console.warn("User exploration failed (404):", identifier);
            return res.status(404).json({ success: false, error: "User vision not found" });
        }

        // Step 2: Fetch videos (Task 3)
        const [videos] = await pool.query(
            "SELECT * FROM videos WHERE user_id = ? ORDER BY created_at DESC",
            [user.id]
        );

        // Task 4 & 6: Return formatted list or empty array
        return res.status(200).json({
            success: true,
            videos: videos.map(v => ({
                id: v.id,
                videoUrl: v.url,
                created_at: v.created_at,
                user_id: v.user_id
            }))
        });

    } catch (err) {
        console.error("❌ PROFILE API ERROR:", err);
        return res.status(500).json({ success: false, error: "Internal universe error" });
    }
});

// Enable CORS (Task 7)
app.use(cors({
    origin: "*",
    credentials: true
}));

// Static Frontend
app.use(express.static(path.join(__dirname, '../frontend')));

// Root Route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});


// 404 Handler
app.use((req, res) => res.status(404).json({ error: "Route not found" }));

// --- STARTUP ---
const PORT = process.env.PORT || 5000;
app.listen(PORT, async () => {
    await initDB();
    console.log(`🚀 Blink Backend running on port ${PORT}`);
});
