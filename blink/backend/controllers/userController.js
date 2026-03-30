const pool = require('../config/db');

exports.getProfile = async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT id, username, email, profile_pic, created_at FROM users WHERE id = ?',
            [req.user.id]
        );
        res.json({ success: true, user: rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.updateProfile = async (req, res) => {
    try {
        const { profile_pic } = req.body; // URL from Cloudinary
        await pool.execute('UPDATE users SET profile_pic = ? WHERE id = ?', [profile_pic, req.user.id]);
        res.json({ success: true, message: "Profile updated" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
