const bcrypt = require('bcrypt');
const jwt    = require('jsonwebtoken');
const db     = require('../config/db');

const { JWT_SECRET } = require('../config/env');
const SALT       = 12;

function signToken(user) {
    return jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
}

// Memory stores for OTP rate limiting (abuse connection protection)
const otpRequests = {};
const failedAttempts = {};

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
            `SELECT id, username, email, 
                    COALESCE(profile_pic, profile_photo) AS profile_pic,
                    COALESCE(profile_pic, profile_photo) AS profile_photo,
                    bio, followers_count, following_count, total_likes, created_at 
             FROM users WHERE id = ?`,
            [req.user.id]
        );
        if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
        res.json({ user: rows[0] });
    } catch (err) {
        console.error('[Auth] getMe:', err.message);
        res.status(500).json({ error: 'Server error' });
    }
};
// ─── FORGOT PASSWORD: SEND OTP ─────────────────────────────────
exports.sendOTP = async (req, res) => {
    try {
        const ip = req.ip;
        otpRequests[ip] = (otpRequests[ip] || 0) + 1;
        
        if (otpRequests[ip] > 5) {
            return res.status(429).json({ error: 'Too many OTP requests' });
        }

        const { email } = req.body;
        if (!email) return res.status(400).json({ error: 'Email is required' });

        const cleanEmail = email.toLowerCase().trim();
        const [users] = await db.query('SELECT id FROM users WHERE email = ?', [cleanEmail]);
        if (users.length === 0) return res.status(404).json({ error: 'No user found with this email' });

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiry = Date.now() + 5 * 60 * 1000; // 5 mins

        await db.query(
            "UPDATE users SET otp = ?, otp_expiry = ? WHERE email = ?",
            [otp, expiry, cleanEmail]
        );

        const mailer = require('../config/mailer');
        const sent = await mailer.sendMail(
            cleanEmail, 
            "Reset Password OTP", 
            `<h2>Your OTP is: ${otp}</h2>`
        );

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
        const ip = req.ip;
        failedAttempts[ip] = (failedAttempts[ip] || 0) + 1;

        if (failedAttempts[ip] > 5) {
            return res.status(403).json({ error: 'Too many attempts' });
        }

        const { email, otp } = req.body;
        if (!email || !otp) return res.status(400).json({ error: 'Email and OTP are required' });

        const cleanEmail = email.toLowerCase().trim();
        const [user] = await db.query(
            "SELECT * FROM users WHERE email = ? AND otp = ?",
            [cleanEmail, otp]
        );

        if (!user.length || user[0].otp_expiry < Date.now()) {
            return res.status(400).json({ error: "Invalid or expired OTP" });
        }

        // success -> reset attempts
        failedAttempts[ip] = 0;

        res.json({ success: true, message: "OTP verified successfully" });

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

        const cleanEmail = email.toLowerCase().trim();
        const [rows] = await db.query(
            "SELECT * FROM users WHERE email = ? AND otp = ?", 
            [cleanEmail, otp]
        );
        
        if (rows.length === 0) {
            return res.status(400).json({ error: "Invalid or expired OTP" });
        }

        const user = rows[0];
        if (user.otp_expiry < Date.now()) {
            return res.status(400).json({ error: "OTP has expired. Please request a new one." });
        }

        if (newPassword.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

        const hashed = await bcrypt.hash(newPassword, 10);

        // Update password and CLEAR OTP fields COMPLETELY
        await db.query(
            "UPDATE users SET password_hash = ?, otp = NULL, otp_expiry = NULL WHERE id = ?",
            [hashed, user.id]
        );

        // JWT AUTO LOGIN: Return token and user so frontend can log them in immediately
        const { password_hash, otp: _, otp_expiry, ...safeUser } = user;
        const token = signToken(user);

        res.json({ 
            message: "Password reset successful. Logging you in...", 
            token, 
            user: safeUser 
        });

    } catch (err) {
        console.error('[Auth] resetPassword:', err.message);
        res.status(500).json({ error: 'Server error' });
    }
};
