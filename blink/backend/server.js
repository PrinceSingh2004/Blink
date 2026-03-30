require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const app = express();
const pool = require('./config/db');

// --- SECURITY & MIDDLEWARE ---
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            ...helmet.contentSecurityPolicy.getDefaultDirectives(),
            "script-src": ["'self'", "'unsafe-inline'"], // Allows your frontend scripts to run
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
app.use('/api', require('./routes/healthRoutes')); // Test endpoint: /api/health

// Static Frontend
app.use(express.static(path.join(__dirname, '../frontend')));

// Root Route
app.get('/', (req, res) => res.json({ message: "Blink API online 🚀" }));

// 404 Handler
app.use((req, res) => res.status(404).json({ error: "Route not found" }));

// --- STARTUP ---
const PORT = process.env.PORT || 5000;
app.listen(PORT, async () => {
    await initDB(); // Run DB setup on serve start
    console.log(`🚀 Blink Backend running on port ${PORT}`);
});
