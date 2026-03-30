const pool = require('../config/db');

exports.createPost = async (req, res) => {
    try {
        const { media_url, caption } = req.body;
        if (!media_url) return res.status(400).json({ error: "Media is required" });

        await pool.execute(
            'INSERT INTO posts (user_id, media_url, caption) VALUES (?, ?, ?)',
            [req.user.id, media_url, caption]
        );
        res.status(201).json({ success: true, message: "Post created" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getPosts = async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT p.*, u.username, u.profile_pic FROM posts p JOIN users u ON p.user_id = u.id ORDER BY p.created_at DESC'
        );
        res.json({ success: true, posts: rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
