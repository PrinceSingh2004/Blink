const bcrypt = require('bcrypt');
const jwt    = require('jsonwebtoken');
const db     = require('../config/db');

const JWT_SECRET = process.env.JWT_SECRET || 'blink_jwt_super_secret_key_2024';
const SALT       = 12;

function signToken(user) {
    return jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
}

// ─── REGISTER ─────────────────────────────────────────────────
exports.register = async (req, res) => {
    try {
        const { username, email, password } = req.body;

        if (!username || !email || !password)
            return res.status(400).json({ error: 'username, email and password are required' });

        if (username.length < 3 || username.length > 30)
            return res.status(400).json({ error: 'Username must be 3–30 characters' });

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
            return res.status(400).json({ error: 'Invalid email address' });

        if (password.length < 6)
            return res.status(400).json({ error: 'Password must be at least 6 characters' });

        const [existing] = await db.query(
            'SELECT id FROM users WHERE username = ? OR email = ?',
            [username.toLowerCase(), email.toLowerCase()]
        );
        if (existing.length > 0)
            return res.status(409).json({ error: 'Username or email already taken' });

        const password_hash = await bcrypt.hash(password, SALT);

        const [result] = await db.query(
            `INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)`,
            [username.toLowerCase(), email.toLowerCase(), password_hash]
        );

        const user = { id: result.insertId, username: username.toLowerCase(), email: email.toLowerCase() };
        res.status(201).json({ message: 'Account created successfully', token: signToken(user), user });

    } catch (err) {
        console.error('[Auth] Register:', err.message);
        res.status(500).json({ error: 'Server error during registration' });
    }
};

// ─── LOGIN ────────────────────────────────────────────────────
exports.login = async (req, res) => {
    try {
        const { identifier, password } = req.body;

        if (!identifier || !password)
            return res.status(400).json({ error: 'Email/username and password are required' });

        const [rows] = await db.query(
            'SELECT * FROM users WHERE username = ? OR email = ?',
            [identifier.toLowerCase(), identifier.toLowerCase()]
        );

        if (rows.length === 0)
            return res.status(404).json({ error: 'No account found with that email or username' });

        const user = rows[0];
        const valid = await bcrypt.compare(password, user.password_hash);

        if (!valid)
            return res.status(401).json({ error: 'Incorrect password' });

        const { password_hash, ...safeUser } = user;
        res.json({ message: 'Login successful', token: signToken(user), user: safeUser });

    } catch (err) {
        console.error('[Auth] Login:', err.message);
        res.status(500).json({ error: 'Server error during login' });
    }
};

// ─── GET CURRENT USER ─────────────────────────────────────────
exports.getMe = async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT id, username, email, profile_picture, bio, followers_count, following_count, total_likes, created_at FROM users WHERE id = ?',
            [req.user.id]
        );
        if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
        res.json({ user: rows[0] });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
};
