const bcrypt = require('bcrypt');
const jwt    = require('jsonwebtoken');
const db     = require('../config/db');

const { JWT_SECRET } = require('../config/env');
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

        const gmailPattern = /^[a-zA-Z0-9._%+-]+@gmail\.com$/;
        if (!gmailPattern.test(email))
            return res.status(400).json({ error: 'Please enter a valid Gmail address' });

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
            'SELECT id, username, email, profile_photo, bio, followers_count, following_count, total_likes, created_at FROM users WHERE id = ?',
            [req.user.id]
        );
        if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
        res.json({ user: rows[0] });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
};
// ─── FORGOT PASSWORD: SEND OTP ─────────────────────────────────
exports.sendOTP = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: 'Email is required' });

        const [users] = await db.query('SELECT id FROM users WHERE email = ?', [email.toLowerCase()]);
        if (users.length === 0) return res.status(404).json({ error: 'No user found with this email' });

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 mins

        await db.query('DELETE FROM password_resets WHERE email = ?', [email.toLowerCase()]);
        await db.query('INSERT INTO password_resets (email, otp, expires_at) VALUES (?, ?, ?)', 
            [email.toLowerCase(), otp, expiresAt]);

        const mailer = require('../config/mailer');
        const sent = await mailer.sendMail(email, "OTP for Password Reset - Blink", `Your OTP is ${otp}. It expires in 5 minutes.`);

        if (sent) res.json({ message: 'OTP sent to your email' });
        else res.status(500).json({ error: 'Failed to send email' });

    } catch (err) {
        console.error('[Auth] sendOTP:', err.message);
        res.status(500).json({ error: 'Server error' });
    }
};

// ─── FORGOT PASSWORD: VERIFY OTP ───────────────────────────────
exports.verifyOTP = async (req, res) => {
    try {
        const { email, otp } = req.body;
        if (!email || !otp) return res.status(400).json({ error: 'Email and OTP are required' });

        const [rows] = await db.query('SELECT * FROM password_resets WHERE email = ?', [email.toLowerCase()]);
        if (rows.length === 0) return res.status(400).json({ error: 'No OTP requested for this email' });

        const reset = rows[0];
        if (new Date() > new Date(reset.expires_at)) {
            await db.query('DELETE FROM password_resets WHERE email = ?', [email.toLowerCase()]);
            return res.status(400).json({ error: 'OTP has expired' });
        }

        if (reset.attempts >= 5) {
            return res.status(400).json({ error: 'Too many failed attempts' });
        }

        if (reset.otp !== otp) {
            await db.query('UPDATE password_resets SET attempts = attempts + 1 WHERE email = ?', [email.toLowerCase()]);
            return res.status(400).json({ error: 'Invalid OTP' });
        }

        res.json({ message: 'OTP verified successfully' });

    } catch (err) {
        console.error('[Auth] verifyOTP:', err.message);
        res.status(500).json({ error: 'Server error' });
    }
};

// ─── FORGOT PASSWORD: RESET PASSWORD ───────────────────────────
exports.resetPassword = async (req, res) => {
    try {
        const { email, otp, newPassword } = req.body;
        if (!email || !otp || !newPassword) return res.status(400).json({ error: 'All fields are required' });

        const [rows] = await db.query('SELECT * FROM password_resets WHERE email = ? AND otp = ?', [email.toLowerCase(), otp]);
        if (rows.length === 0) return res.status(400).json({ error: 'Invalid or expired magic link' });

        const reset = rows[0];
        if (new Date() > new Date(reset.expires_at)) return res.status(400).json({ error: 'Link expired' });

        if (newPassword.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

        const password_hash = await bcrypt.hash(newPassword, SALT);
        await db.query('UPDATE users SET password_hash = ? WHERE email = ?', [password_hash, email.toLowerCase()]);
        await db.query('DELETE FROM password_resets WHERE email = ?', [email.toLowerCase()]);

        res.json({ message: 'Password reset successful. You can now login.' });

    } catch (err) {
        console.error('[Auth] resetPassword:', err.message);
        res.status(500).json({ error: 'Server error' });
    }
};
