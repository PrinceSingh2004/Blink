/* ═══════════════════════════════════════════════════════════════════════════════
    BLINK v7.0 - UNIFIED BACKEND CORE
    Unified | SQL-Integrated | Professional | SPA-Ready
    ═══════════════════════════════════════════════════════════════════════════════ */

const express = require('express');
const cors = require('cors');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// --- 1. DATABASE POOL ---
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
    ssl: { rejectUnauthorized: false }
});

const initDB = async () => {
    try {
        await pool.query(`CREATE TABLE IF NOT EXISTS users (id INT AUTO_INCREMENT PRIMARY KEY, username VARCHAR(255) UNIQUE, email VARCHAR(255) UNIQUE, password VARCHAR(255), profile_photo TEXT, bio TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
        await pool.query(`CREATE TABLE IF NOT EXISTS videos (id INT AUTO_INCREMENT PRIMARY KEY, user_id INT, video_url TEXT NOT NULL, caption TEXT, likes_count INT DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)`);
        await pool.query(`CREATE TABLE IF NOT EXISTS likes (id INT AUTO_INCREMENT PRIMARY KEY, user_id INT, video_id INT, UNIQUE KEY unique_like (user_id, video_id))`);
        console.log('✅ Blink Schema Sync Complete.');
    } catch (e) { console.error('DB Sync Error:', e.message); }
};
initDB();

// --- 2. AUTH MIDDLEWARE ---
const protect = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ error: "Access denied" });
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
        const [users] = await pool.query('SELECT id, username FROM users WHERE id = ?', [decoded.id]);
        if (!users[0]) return res.status(401).json({ error: "User frequencies lost" });
        req.user = users[0];
        next();
    } catch (e) { res.status(401).json({ error: "Invalid identity" }); }
};

// --- 3. APIs ---

// ── Auth ──
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        const hashed = await bcrypt.hash(password, 10);
        const [reslt] = await pool.query('INSERT INTO users (username, email, password) VALUES (?, ?, ?)', [username, email, hashed]);
        res.status(201).json({ success: true, userId: reslt.insertId });
    } catch (e) { res.status(400).json({ error: "Identity already exists" }); }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        if (!users[0] || !await bcrypt.compare(password, users[0].password)) return res.status(401).json({ error: "Invalid frequency" });
        const token = jwt.sign({ id: users[0].id }, process.env.JWT_SECRET || 'secret', { expiresIn: '7d' });
        res.json({ success: true, token, user: users[0] });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Videos ──
app.get('/api/videos', async (req, res) => {
    try {
        const [vids] = await pool.query('SELECT v.*, u.username, u.profile_photo as profile_pic FROM videos v JOIN users u ON v.user_id = u.id ORDER BY created_at DESC LIMIT 20');
        res.json({ success: true, data: vids });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/videos/upload', protect, async (req, res) => {
    try {
        const { video_url, caption } = req.body;
        await pool.query('INSERT INTO videos (user_id, video_url, caption) VALUES (?, ?, ?)', [req.user.id, video_url, caption]);
        res.status(201).json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/videos/:id/like', protect, async (req, res) => {
    try {
        await pool.query('INSERT IGNORE INTO likes (user_id, video_id) VALUES (?, ?)', [req.user.id, req.params.id]);
        await pool.query('UPDATE videos SET likes_count = likes_count + 1 WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Search ──
app.get('/api/search', async (req, res) => {
    try {
        const [users] = await pool.query('SELECT id, username, profile_photo, bio FROM users WHERE username LIKE ?', [`%${req.query.q}%`]);
        res.json({ success: true, users });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- 4. STATIC & SPA ---
app.use(express.static(path.join(__dirname, '../frontend')));
app.get('*', (req, res) => {
    if (req.path.startsWith('/api') || req.path.includes('.')) return res.status(404).send('Not Found');
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// --- 5. STARTUP ---
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Unified Engine Online: http://localhost:${PORT}`));
