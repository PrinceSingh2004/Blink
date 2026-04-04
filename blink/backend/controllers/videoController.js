const pool = require('../config/db');

// ── GET FEED VIDEOS ──────────────────────────────────────────
exports.getVideos = async (req, res) => {
    try {
        const [videos] = await pool.query(`
            SELECT v.*, u.username, u.profile_photo as profile_pic 
            FROM videos v 
            JOIN users u ON v.user_id = u.id 
            WHERE v.is_active = 1
            ORDER BY v.created_at DESC 
            LIMIT 20
        `);
        
        // Return structured JSON
        res.json({ 
            success: true, 
            data: videos || [],
            message: "Feed synced successfully"
        });
    } catch (err) {
        console.error('[VideoController] Feed Error:', err);
        res.status(500).json({ success: false, error: "Frequency loss in feed" });
    }
};

// ── UPLOAD VIDEO ──────────────────────────────────────────────
exports.uploadVideo = async (req, res) => {
    try {
        const { video_url, caption, hashtags } = req.body;
        const userId = req.user.id;

        if (!video_url) return res.status(400).json({ error: "Missing link" });

        const [result] = await pool.query(
            "INSERT INTO videos (user_id, video_url, caption, hashtags) VALUES (?, ?, ?, ?)",
            [userId, video_url, caption, hashtags]
        );

        res.status(201).json({ 
            success: true, 
            videoId: result.insertId,
            message: "Blink transmitted to the universe"
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ── LIKE VIDEO ────────────────────────────────────────────────
exports.likeVideo = async (req, res) => {
    try {
        const { videoId } = req.params;
        const userId = req.user.id;
        
        await pool.query("INSERT IGNORE INTO likes (user_id, post_id) VALUES (?, ?)", [userId, videoId]);
        await pool.query("UPDATE videos SET likes_count = likes_count + 1 WHERE id = ?", [videoId]);
        
        res.json({ success: true, message: "Heart synced" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
