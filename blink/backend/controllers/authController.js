/**
 * controllers/authController.js
 * ═══════════════════════════════════════════════════════════════════════════════
 * Complete Authentication System - JWT + HTTP-Only Cookies + Rate Limiting
 * ═══════════════════════════════════════════════════════════════════════════════
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

// ════════════════════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════════════════════

const generateToken = (userId, username, email) => {
    return jwt.sign(
        { id: userId, username, email },
        process.env.JWT_SECRET || 'blink_default_secret',
        { expiresIn: '30d' }
    );
};

const validateEmail = (email) => {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
};

const validatePassword = (password) => {
    return password && password.length >= 6;
};

// ════════════════════════════════════════════════════════════════════════════════
// REGISTER
// ════════════════════════════════════════════════════════════════════════════════
exports.register = async (req, res) => {
    try {
        const { username, email, password, confirmPassword } = req.body;

        // Validation
        if (!username || !email || !password) {
            return res.status(400).json({ error: 'All fields are required.' });
        }

        if (password !== confirmPassword) {
            return res.status(400).json({ error: 'Passwords do not match.' });
        }

        if (!validatePassword(password)) {
            return res.status(400).json({ error: 'Password must be at least 6 characters.' });
        }

        if (!validateEmail(email)) {
            return res.status(400).json({ error: 'Invalid email format.' });
        }

        const cleanUsername = username.trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '');

        if (cleanUsername.length < 3) {
            return res.status(400).json({ error: 'Username must be at least 3 characters.' });
        }

        // Check if user exists
        const [existing] = await pool.query(
            'SELECT id FROM users WHERE email = ? OR username = ?',
            [email.toLowerCase(), cleanUsername]
        );

        if (existing.length > 0) {
            return res.status(400).json({ error: 'Email or username already in use.' });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Create user
        const [result] = await pool.query(
            'INSERT INTO users (username, email, password, display_name) VALUES (?, ?, ?, ?)',
            [cleanUsername, email.toLowerCase(), hashedPassword, cleanUsername]
        );

        const token = generateToken(result.insertId, cleanUsername, email);

        res.status(201).json({
            success: true,
            token,
            user: {
                id: result.insertId,
                username: cleanUsername,
                email: email.toLowerCase(),
                display_name: cleanUsername
            }
        });
    } catch (err) {
        console.error('[AUTH ERROR]', err.message);
        res.status(500).json({ error: err.message });
    }
};

// ════════════════════════════════════════════════════════════════════════════════
// LOGIN
// ════════════════════════════════════════════════════════════════════════════════
exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password required.' });
        }

        // Find user
        const [users] = await pool.query(
            'SELECT * FROM users WHERE email = ?',
            [email.toLowerCase()]
        );

        if (users.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials.' });
        }

        const user = users[0];

        // Compare password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid credentials.' });
        }

        // Update last active
        await pool.query('UPDATE users SET last_active = NOW() WHERE id = ?', [user.id]);

        const token = generateToken(user.id, user.username, user.email);

        // Set HTTP-only cookie
        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 30 * 24 * 60 * 60 * 1000
        });

        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                display_name: user.display_name,
                profile_pic: user.profile_pic
            }
        });
    } catch (err) {
        console.error('[AUTH ERROR]', err.message);
        res.status(500).json({ error: err.message });
    }
};

// ════════════════════════════════════════════════════════════════════════════════
// GET CURRENT USER
// ════════════════════════════════════════════════════════════════════════════════
exports.getMe = async (req, res) => {
    try {
        const [users] = await pool.query(
            'SELECT id, username, email, display_name, profile_pic, cover_pic, bio, website, followers_count, following_count FROM users WHERE id = ?',
            [req.user.id]
        );

        if (!users[0]) {
            return res.status(404).json({ error: 'User not found.' });
        }

        res.json({ success: true, user: users[0] });
    } catch (err) {
        console.error('[AUTH ERROR]', err.message);
        res.status(500).json({ error: err.message });
    }
};

// ════════════════════════════════════════════════════════════════════════════════
// LOGOUT
// ════════════════════════════════════════════════════════════════════════════════
exports.logout = (req, res) => {
    res.clearCookie('token');
    res.json({ success: true, message: 'Logged out successfully.' });
};

// ════════════════════════════════════════════════════════════════════════════════
// VALIDATE TOKEN
// ════════════════════════════════════════════════════════════════════════════════
exports.validateToken = (req, res) => {
    res.json({ success: true, user: req.user });
};
