const db = require('../config/db');

// ─── GET COMMENTS ─────────────────────────────────────────────
exports.getComments = async (req, res) => {
    try {
        const [comments] = await db.query(
            `SELECT c.id, c.comment_text, c.created_at,
                    u.id AS user_id, u.username, u.profile_picture
             FROM comments c
             LEFT JOIN users u ON c.user_id = u.id
             WHERE c.video_id = ?
             ORDER BY c.created_at DESC
             LIMIT 100`,
            [req.params.videoId]
        );
        res.json({ comments });
    } catch (err) {
        console.error('[Comments] getComments:', err.message);
        res.status(500).json({ error: 'Server error' });
    }
};

// ─── ADD COMMENT ──────────────────────────────────────────────
exports.addComment = async (req, res) => {
    try {
        const { comment_text } = req.body;
        if (!comment_text?.trim())
            return res.status(400).json({ error: 'Comment text is required' });
        if (comment_text.length > 500)
            return res.status(400).json({ error: 'Comment too long (max 500 chars)' });

        const videoId = req.params.videoId;

        const [[video]] = await db.query('SELECT id FROM videos WHERE id = ?', [videoId]);
        if (!video) return res.status(404).json({ error: 'Video not found' });

        const [result] = await db.query(
            'INSERT INTO comments (video_id, user_id, comment_text) VALUES (?, ?, ?)',
            [videoId, req.user.id, comment_text.trim()]
        );

        await db.query('UPDATE videos SET comments_count = comments_count + 1 WHERE id = ?', [videoId]);

        const [[newComment]] = await db.query(
            `SELECT c.id, c.comment_text, c.created_at, u.id AS user_id, u.username, u.profile_picture
             FROM comments c LEFT JOIN users u ON c.user_id = u.id WHERE c.id = ?`,
            [result.insertId]
        );

        res.status(201).json({ message: 'Comment added', comment: newComment });
    } catch (err) {
        console.error('[Comments] addComment:', err.message);
        res.status(500).json({ error: 'Failed to add comment' });
    }
};

// ─── DELETE COMMENT ───────────────────────────────────────────
exports.deleteComment = async (req, res) => {
    try {
        const [[comment]] = await db.query(
            'SELECT * FROM comments WHERE id = ? AND user_id = ?',
            [req.params.id, req.user.id]
        );
        if (!comment) return res.status(404).json({ error: 'Comment not found or not yours' });

        await db.query('DELETE FROM comments WHERE id = ?', [req.params.id]);
        await db.query('UPDATE videos SET comments_count = GREATEST(0, comments_count - 1) WHERE id = ?', [comment.video_id]);

        res.json({ message: 'Comment deleted' });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
};
