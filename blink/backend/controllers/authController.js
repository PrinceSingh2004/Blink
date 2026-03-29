/**
 * controllers/authController.js – JWT Auth v3
 * Login, Register, Me, Logout
 */
const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const pool   = require('../db/config');

const signToken = (id) =>
    jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '7d' });

// ── REGISTER ─────────────────────────────────────────────────────
exports.register = async (req, res) => {
    try {
        const { username, email, password } = req.body;

        if (!username || !email || !password)
            return res.status(400).json({ error: 'All fields are required' });
        if (password.length < 6)
            return res.status(400).json({ error: 'Password must be at least 6 characters' });

        const usernameClean = username.trim().toLowerCase().replace(/[^a-z0-9_.]/g, '');
        if (usernameClean.length < 3)
            return res.status(400).json({ error: 'Username must be at least 3 characters' });

        // Check duplicates
        const [existing] = await pool.query(
            'SELECT id FROM users WHERE email = ? OR username = ? LIMIT 1',
            [email.toLowerCase(), usernameClean]
        );
        if (existing.length > 0)
            return res.status(409).json({ error: 'Email or username already in use' });

        const hash = await bcrypt.hash(password, 12);
        const [result] = await pool.query(
            'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
            [usernameClean, email.toLowerCase(), hash]
        );

        const userId = result.insertId;
        const token  = signToken(userId);
        const user   = { id: userId, username: usernameClean, email: email.toLowerCase(), profile_pic: null };

        res.status(201).json({ token, user });
    } catch (e) {
        console.error('[Auth] register error:', e.message);
        res.status(500).json({ error: 'Registration failed. Please try again.' });
    }
};

// ── LOGIN ─────────────────────────────────────────────────────────
exports.login = async (req, res) => {
    try {
        const { identifier, email, password } = req.body;
        const loginId = (identifier || email || '').trim().toLowerCase();

        if (!loginId || !password)
            return res.status(400).json({ error: 'Email and password are required' });

        const [users] = await pool.query(
            'SELECT * FROM users WHERE email = ? OR username = ? LIMIT 1',
            [loginId, loginId]
        );

        if (!users.length)
            return res.status(401).json({ error: 'Invalid email or password' });

        const user = users[0];
        const valid = await bcrypt.compare(password, user.password);
        if (!valid)
            return res.status(401).json({ error: 'Invalid email or password' });

        // Update last_seen
        await pool.query('UPDATE users SET last_seen = NOW() WHERE id = ?', [user.id]);

        const token = signToken(user.id);
        const profile_pic = user.profile_pic || user.avatar_url || user.profile_photo || null;

        res.json({
            token,
            user: {
                id:          user.id,
                username:    user.username,
                email:       user.email,
                display_name: user.display_name,
                bio:         user.bio,
                profile_pic,
                is_verified: user.is_verified,
                followers_count: user.followers_count || 0,
                following_count: user.following_count || 0
            }
        });
    } catch (e) {
        console.error('[Auth] login error:', e.message);
        res.status(500).json({ error: 'Login failed. Please try again.' });
    }
};

// ── GET ME ────────────────────────────────────────────────────────
exports.getMe = async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT id, username, email, display_name, bio,
                    COALESCE(profile_pic, avatar_url, profile_photo) AS profile_pic,
                    is_verified, followers_count, following_count, posts_count, is_live
             FROM users WHERE id = ? LIMIT 1`,
            [req.user.id]
        );

        if (!rows.length)
            return res.status(404).json({ error: 'User not found' });

        res.json({ user: rows[0] });
    } catch (e) {
        console.error('[Auth] getMe error:', e.message);
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
};

// ── SIGNUP ALIAS ─────────────────────────────────────────────────
exports.signup = exports.register;
