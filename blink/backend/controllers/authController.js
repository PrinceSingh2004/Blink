/**
 * controllers/authController.js — Authentication
 * ═══════════════════════════════════════════════════
 * Register, Login, GetMe
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');

/**
 * POST /api/auth/register
 */
exports.register = async (req, res) => {
    try {
        const { username, email, password } = req.body;

        // Input validation
        if (!username || !email || !password) {
            return res.status(400).json({ error: 'Username, email, and password are required' });
        }
        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ error: 'Invalid email format' });
        }
        if (username.length < 3 || username.length > 30) {
            return res.status(400).json({ error: 'Username must be 3-30 characters' });
        }

        const hashedPassword = await bcrypt.hash(password, 12);
        const [result] = await pool.query(
            'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
            [username.trim(), email.trim().toLowerCase(), hashedPassword]
        );

        const token = jwt.sign({ id: result.insertId }, process.env.JWT_SECRET, { expiresIn: '7d' });

        res.status(201).json({
            success: true,
            token,
            user: {
                id: result.insertId,
                username: username.trim(),
                email: email.trim().toLowerCase(),
                profile_photo: null
            }
        });

    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'Username or email already exists' });
        }
        console.error('Register error:', err.message);
        res.status(500).json({ error: 'Registration failed' });
    }
};

/**
 * POST /api/auth/login
 * Accepts: { identifier, password } — identifier can be email OR username
 */
exports.login = async (req, res) => {
    try {
        const { identifier, email, password } = req.body;
        const loginId = (identifier || email || '').trim();

        if (!loginId || !password) {
            return res.status(400).json({ error: 'Email/username and password are required' });
        }

        // Search by email OR username
        const [users] = await pool.query(
            'SELECT * FROM users WHERE email = ? OR username = ?',
            [loginId.toLowerCase(), loginId]
        );

        if (users.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const user = users[0];
        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });

        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                profile_photo: user.profile_photo
            }
        });

    } catch (err) {
        console.error('Login error:', err.message);
        res.status(500).json({ error: 'Login failed' });
    }
};

/**
 * GET /api/auth/me
 */
exports.getMe = async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT id, username, email, profile_photo, bio, created_at FROM users WHERE id = ?',
            [req.user.id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ success: true, user: rows[0] });
    } catch (err) {
        console.error('GetMe error:', err.message);
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
};
