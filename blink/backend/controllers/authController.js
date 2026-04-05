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
        if (!username) return res.status(400).json({ success: false, field: 'username', message: 'Username is required' });
        if (!email) return res.status(400).json({ success: false, field: 'email', message: 'Email is required' });
        if (!password) return res.status(400).json({ success: false, field: 'password', message: 'Password is required' });

        if (password.length < 6) {
            return res.status(400).json({ success: false, field: 'password', message: 'Password must be at least 6 characters' });
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ success: false, field: 'email', message: 'Invalid email format' });
        }
        if (username.length < 3 || username.length > 30) {
            return res.status(400).json({ success: false, field: 'username', message: 'Username must be 3-30 characters' });
        }

        const hashedPassword = await bcrypt.hash(password, 12);
        const [result] = await pool.query(
            'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
            [username.trim(), email.trim().toLowerCase(), hashedPassword]
        );

        const token = jwt.sign({ id: result.insertId }, process.env.JWT_SECRET, { expiresIn: '7d' });

        // Phase 2: Register session in DB
        await pool.query('INSERT INTO sessions (user_id, token) VALUES (?, ?)', [result.insertId, token]);

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
            const field = err.message.includes('email') ? 'email' : 'username';
            return res.status(409).json({ success: false, field, message: `${field.charAt(0).toUpperCase() + field.slice(1)} already taken` });
        }
        console.error('Register error:', err.message);
        res.status(500).json({ success: false, message: 'Registration failed' });
    }
};

/**
 * POST /api/auth/login
 * Accepts: { identifier, password } — identifier can be email OR username
 */
exports.login = async (req, res) => {
    try {
        const { identifier, password } = req.body;
        const loginId = (identifier || '').trim();

        if (!loginId) {
            return res.status(400).json({ success: false, field: 'identifier', message: 'Email or username is required' });
        }
        if (!password) {
            return res.status(400).json({ success: false, field: 'password', message: 'Password is required' });
        }

        // Search by email OR username
        const [users] = await pool.query(
            'SELECT * FROM users WHERE email = ? OR username = ?',
            [loginId.toLowerCase(), loginId]
        );

        if (users.length === 0) {
            return res.status(404).json({ success: false, field: 'identifier', message: 'User not found' });
        }

        const user = users[0];
        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.status(401).json({ success: false, field: 'password', message: 'Incorrect password' });
        }

        const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });

        // Phase 2: Register session in DB
        await pool.query('INSERT INTO sessions (user_id, token) VALUES (?, ?)', [user.id, token]);

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
        res.status(500).json({ success: false, message: 'Login failed server-side' });
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
/**
 * POST /api/auth/logout — Delete current session
 */
exports.logout = async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        const token = authHeader.split(' ')[1];

        await pool.query('DELETE FROM sessions WHERE token = ?', [token]);
        res.json({ success: true, message: 'Logged out successfully' });
    } catch (err) {
        console.error('Logout error:', err.message);
        res.status(500).json({ error: 'Logout failed' });
    }
};

/**
 * POST /api/auth/logout-all — Delete all user sessions
 */
exports.logoutAll = async (req, res) => {
    try {
        await pool.query('DELETE FROM sessions WHERE user_id = ?', [req.user.id]);
        res.json({ success: true, message: 'Logged out from all devices' });
    } catch (err) {
        console.error('Logout-all error:', err.message);
        res.status(500).json({ error: 'Logout-all failed' });
    }
};
