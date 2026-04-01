const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

exports.register = async (req, res) => {
    try {
        const { username, email, password } = req.body;
        if (!username || !email || !password) return res.status(400).json({ error: "Missing fields" });

        const hashedPassword = await bcrypt.hash(password, 10);
        const [result] = await pool.execute(
            'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
            [username, email, hashedPassword]
        );
        const token = jwt.sign({ id: result.insertId }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.status(201).json({ 
            success: true, 
            message: "User registered", 
            token, 
            user: { id: result.insertId, username, email } 
        });
    } catch (err) {
        // Handle duplicate entry (email/username)
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: "Username or email already exists" });
        }
        res.status(500).json({ error: err.message });
    }
};


exports.login = async (req, res) => {
    console.log("🚀 Login API Hit - Looking for identifier:", req.body.identifier || req.body.email);
    
    try {
        const { identifier, email, password } = req.body;
        const id = identifier || email; // Support both names for identifier

        if (!id || !password) {
            console.warn("⚠️ Login failed: Missing credentials in request body.");
            return res.status(400).json({ error: "Missing identifier or password" });
        }

        // Search by email OR username
        const [rows] = await pool.query(
            'SELECT * FROM users WHERE email = ? OR username = ?', 
            [id, id]
        );

        console.log("🔍 Database lookup result count:", rows.length);

        if (rows.length === 0) {
            console.warn("❌ Login failed: No user found for identifier:", id);
            return res.status(401).json({ error: "Invalid credentials" });
        }

        const user = rows[0];
        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            console.warn("❌ Login failed: Password mismatch for user:", user.username);
            return res.status(401).json({ error: "Invalid credentials" });
        }

        // Generate JWT
        if (!process.env.JWT_SECRET) {
            console.error("❌ ERROR: JWT_SECRET is not defined in environment variables!");
            return res.status(500).json({ error: "Server configuration error" });
        }

        const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });
        
        console.log("✅ Login Success for:", user.username);

        res.json({ 
            success: true, 
            token, 
            user: { 
                id: user.id, 
                username: user.username,
                email: user.email,
                profile_pic: user.profile_pic
            } 
        });

    } catch (err) {
        console.error("❌ Login system error:", err);
        res.status(500).json({ error: "Internal server error" });
    }
};

exports.getMe = async (req, res) => {
    try {
        const [rows] = await pool.query(
            "SELECT id, username, email, profile_pic FROM users WHERE id = ?",
            [req.userId]
        );
        if (rows.length === 0) return res.status(404).json({ error: "User not found" });
        res.json({ success: true, user: rows[0] });
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch user state." });
    }
};
