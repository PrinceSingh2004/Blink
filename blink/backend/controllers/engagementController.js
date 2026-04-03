const pool = require('../config/db');

/**
 * ── ENGAGEMENT ENGINE ───────────────────────────────────────
 * Handle Followers, Real-time Comments, and Interactions
 */

// 1. FOLLOW / UNFOLLOW SYSTEM
exports.toggleFollow = async (req, res) => {
    try {
        const followerId = req.user.id;
        const followingId = req.body.userId;

        if (followerId == followingId) return res.status(400).json({ error: "Cannot follow yourself." });

        const [existing] = await pool.query(
            "SELECT id FROM followers WHERE follower_id = ? AND following_id = ?",
            [followerId, followingId]
        );

        if (existing.length > 0) {
            await pool.execute("DELETE FROM followers WHERE follower_id = ? AND following_id = ?", [followerId, followingId]);
            return res.json({ success: true, message: "Unfollowed successfully." });
        } else {
            await pool.execute("INSERT INTO followers (follower_id, following_id) VALUES (?, ?)", [followerId, followingId]);
            return res.json({ success: true, message: "Followed successfully!" });
        }
    } catch (err) {
        res.status(500).json({ error: "Failed to pulsate social link." });
    }
};

// 2. COMMENT SYSTEM
exports.addComment = async (req, res) => {
    try {
        const { videoId, text } = req.body;
        const userId = req.user.id;

        if (!text) return res.status(400).json({ error: "Empty thoughts cannot be shared." });

        const [result] = await pool.execute(
            "INSERT INTO comments (user_id, post_id, comment) VALUES (?, ?, ?)",
            [userId, videoId, text]
        );

        res.json({ success: true, commentId: result.insertId });
    } catch (err) {
        res.status(500).json({ error: "Comment universe sync failed." });
    }
};

exports.getComments = async (req, res) => {
    try {
        const { videoId } = req.params;
        const [rows] = await pool.query(
            `SELECT c.*, c.comment AS text, u.username, u.profile_pic 
             FROM comments c 
             JOIN users u ON c.user_id = u.id 
             WHERE c.post_id = ? 
             ORDER BY c.created_at DESC`,
            [videoId]
        );
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ error: "Failed to load video dialogue." });
    }
};
