/**
 * controllers/authController.js
 * ═══════════════════════════════════════════════════════════════════════════════
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

// Helper to generate JWT
const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET || 'blink_secret', { expiresIn: '30d' });
};

// REGISTER
exports.register = async (req, res) => {
    try {
        const { username, email, password } = req.body;
        if (!username || !email || !password) {
            return res.status(400).json({ error: 'All fields are required.' });
        }

        const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
        if (existing.length > 0) return res.status(400).json({ error: 'User already exists.' });

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const [result] = await pool.execute(
            'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
            [username, email, hashedPassword]
        );

        const token = generateToken(result.insertId);
        res.status(201).json({ success: true, token, userId: result.insertId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// LOGIN
exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        if (users.length === 0) return res.status(401).json({ error: 'Invalid credentials.' });

        const isMatch = await bcrypt.compare(password, users[0].password);
        if (!isMatch) return res.status(401).json({ error: 'Invalid credentials.' });

        const token = generateToken(users[0].id);
        res.json({ success: true, token, user: { id: users[0].id, username: users[0].username } });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// GET ME
exports.getMe = async (req, res) => {
    try {
        const [users] = await pool.query('SELECT id, username, email FROM users WHERE id = ?', [req.user.id]);
        res.json({ success: true, user: users[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// LOGOUT
exports.logout = (req, res) => {
    res.json({ success: true, message: 'Logged out successfully' });
};
