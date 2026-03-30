/**
 * controllers/authController.js
 * ═══════════════════════════════════════════════════════════════════════════════
 * Authentication: Register, Login, GetMe, Logout, ValidateToken
 * ═══════════════════════════════════════════════════════════════════════════════
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

// ════════════════════════════════════════════════════════════════════════════════
// HELPER — Generate JWT
// ════════════════════════════════════════════════════════════════════════════════
const generateToken = (userId, username, email) => {
    return jwt.sign(
        { id: userId, username, email },
        process.env.JWT_SECRET || 'blink_default_secret',
        { expiresIn: '30d' }
    );
};

// ════════════════════════════════════════════════════════════════════════════════
// REGISTER
// ════════════════════════════════════════════════════════════════════════════════
exports.register = async (req, res) => {
    try {
        const { username, email, password, confirmPassword } = req.body;

        if (!username || !email || !password) {
            return res.status(400).json({ error: 'All fields are required.' });
        }

        if (confirmPassword !== undefined && password !== confirmPassword) {
            return res.status(400).json({ error: 'Passwords do not match.' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters.' });
        }

        const cleanUsername = username.trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '');
        if (cleanUsername.length < 3) {
            return res.status(400).json({ error: 'Username must be at least 3 characters.' });
        }

        // Check existing user
        const [existing] = await pool.query(
            'SELECT id FROM users WHERE email = ? OR username = ?',
            [email.toLowerCase(), cleanUsername]
        );
        if (existing.length > 0) {
            return res.status(400).json({ error: 'Email or username already in use.' });
        }

        // Hash password & create user
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const [result] = await pool.execute(
            'INSERT INTO users (username, email, password, display_name) VALUES (?, ?, ?, ?)',
            [cleanUsername, email.toLowerCase(), hashedPassword, cleanUsername]
        );

        const token = generateToken(result.insertId, cleanUsername, email.toLowerCase());

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
        console.error('[AUTH] register error:', err.message);
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: 'Email or username already in use.' });
        }
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
            return res.status(400).json({ error: 'Email and password are required.' });
        }

        // Check if database is alive
        if (!pool) {
            return res.status(503).json({ error: 'Database service is starting up. Please try again in a moment.' });
        }

        const [users] = await pool.query(
            'SELECT * FROM users WHERE email = ?',
            [email.toLowerCase()]
        ).catch(err => {
            console.error('❌ [DB QUERY ERROR] Login failed:', err.message);
            throw new Error('Database connection issue. Please try again.');
        });

        if (users.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials.' });
        }

        const user = users[0];
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid credentials.' });
        }

        // Update last active (don't let this failure block login)
        pool.query('UPDATE users SET last_active = NOW() WHERE id = ?', [user.id]).catch(() => {});

        const token = generateToken(user.id, user.username, user.email);

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
        console.error('[AUTH] login error:', err.message);
        res.status(500).json({ 
            error: err.message.includes('Database') ? err.message : 'An internal server error occurred.' 
        });
    }
};

// ════════════════════════════════════════════════════════════════════════════════
// GET ME (current authenticated user)
// ════════════════════════════════════════════════════════════════════════════════
exports.getMe = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const [users] = await pool.query(
            `SELECT id, username, email, display_name, bio, website, location,
                    COALESCE(profile_pic, avatar_url) AS profile_pic,
                    cover_pic, is_verified, followers_count, following_count, posts_count,
                    created_at
             FROM users WHERE id = ?`,
            [userId]
        ).catch(err => {
            console.error('❌ [DB QUERY ERROR] getMe failed:', err.message);
            throw new Error('Database query failed.');
        });

        if (!users[0]) {
            return res.status(404).json({ error: 'User not found.' });
        }

        res.json({ success: true, user: users[0] });
    } catch (err) {
        console.error('[AUTH] getMe error:', err.message);
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
// VALIDATE TOKEN (returns current user if token is valid)
// ════════════════════════════════════════════════════════════════════════════════
exports.validateToken = (req, res) => {
    res.json({ success: true, user: req.user });
};
