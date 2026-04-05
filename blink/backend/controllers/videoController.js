/**
 * controllers/videoController.js — Video Feed, Interactions & Comments
 * ═══════════════════════════════════════════════════════════════════════
 */

const { pool } = require('../config/db');

/**
 * GET /api/videos/feed — Public feed with user's liked state
 */
exports.getFeed = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
        const offset = (page - 1) * limit;
        const userId = req.user?.id || null;

        let query, params;

        if (userId) {
            query = `
                SELECT 
                    v.id, v.userId, v.videoUrl, v.thumbnailUrl,
                    v.caption, v.hashtags, v.duration,
                    v.likes_count, v.views_count, v.comments_count, v.created_at,
                    u.username, u.profile_photo,
                    IF(l.id IS NOT NULL, 1, 0) AS liked_by_me
                FROM videos v
                JOIN users u ON v.userId = u.id
                LEFT JOIN likes l ON l.videoId = v.id AND l.userId = ?
                WHERE v.is_active = 1
                ORDER BY v.created_at DESC
                LIMIT ${Number(limit)} OFFSET ${Number(offset)}
            `;
            params = [userId];
        } else {
            query = `
                SELECT 
                    v.id, v.userId, v.videoUrl, v.thumbnailUrl,
                    v.caption, v.hashtags, v.duration,
                    v.likes_count, v.views_count, v.comments_count, v.created_at,
                    u.username, u.profile_photo,
                    0 AS liked_by_me
                FROM videos v
                JOIN users u ON v.userId = u.id
                WHERE v.is_active = 1
                ORDER BY v.created_at DESC
                LIMIT ${Number(limit)} OFFSET ${Number(offset)}
            `;
            params = [];
        }

        const [videos] = await pool.query(query, params);
        res.json({ success: true, data: videos, page, limit });

    } catch (err) {
        console.error('Feed Error:', err.sqlMessage || err.message);
        res.status(500).json({ error: 'Failed to load feed', detail: err.sqlMessage || err.message });
    }
};

/**
 * GET /api/videos/search?q=keyword
 */
exports.searchVideos = async (req, res) => {
    try {
        const q = (req.query.q || '').trim();
        if (q.length < 2) {
            return res.json({ success: true, data: [] });
        }

        const [videos] = await pool.query(`
            SELECT 
                v.id, v.video_url, v.thumbnail_url, v.caption,
                v.likes_count, v.views_count, v.comments_count,
                u.username, u.profile_photo
            FROM videos v
            JOIN users u ON v.user_id = u.id
            WHERE v.is_active = 1 
              AND (v.caption LIKE ? OR v.hashtags LIKE ? OR u.username LIKE ?)
            ORDER BY v.likes_count DESC
            LIMIT 20
        `, [`%${q}%`, `%${q}%`, `%${q}%`]);

        res.json({ success: true, data: videos });
    } catch (err) {
        console.error('Search error:', err.message);
        res.status(500).json({ error: 'Search failed' });
    }
};

/**
 * POST /api/videos/:id/like — Toggle like (optimistic-friendly)
 */
exports.likeVideo = async (req, res) => {
    let connection;
    try {
        const videoId = parseInt(req.params.id);
        const userId = req.user.id;

        connection = await pool.getConnection();
        await connection.beginTransaction();

        const [existing] = await connection.query(
            'SELECT id FROM likes WHERE userId = ? AND videoId = ?',
            [userId, videoId]
        );

        if (existing.length > 0) {
            await connection.query('DELETE FROM likes WHERE userId = ? AND videoId = ?', [userId, videoId]);
            await connection.query('UPDATE videos SET likes_count = GREATEST(0, likes_count - 1) WHERE id = ?', [videoId]);
            
            await connection.commit();
            const [[{ likes_count }]] = await pool.query('SELECT likes_count FROM videos WHERE id = ?', [videoId]);
            return res.json({ success: true, liked: false, likes_count });
        }

        await connection.query('INSERT INTO likes (userId, videoId) VALUES (?, ?)', [userId, videoId]);
        await connection.query('UPDATE videos SET likes_count = likes_count + 1 WHERE id = ?', [videoId]);

        await connection.commit();
        const [[{ likes_count }]] = await pool.query('SELECT likes_count FROM videos WHERE id = ?', [videoId]);
        res.json({ success: true, liked: true, likes_count });

    } catch (err) {
        if (connection) await connection.rollback();
        console.error('Like error:', err.message);
        res.status(500).json({ error: 'Like operation failed' });
    } finally {
        if (connection) connection.release();
    }
};

/**
 * POST /api/videos/:id/view — Session-aware view tracking
 */
exports.viewVideo = async (req, res) => {
    let connection;
    try {
        const videoId = parseInt(req.params.id);
        const userId = req.user?.id || null;

        connection = await pool.getConnection();
        await connection.beginTransaction();

        await connection.query(
            'INSERT INTO views (userId, videoId) VALUES (?, ?)',
            [userId, videoId]
        );

        await connection.query(
            'UPDATE videos SET views_count = views_count + 1 WHERE id = ?',
            [videoId]
        );

        await connection.commit();
        res.json({ success: true });

    } catch (err) {
        if (connection) await connection.rollback();
        console.error('View tracking error:', err.message);
        res.status(500).json({ error: 'View tracking failed' });
    } finally {
        if (connection) connection.release();
    }
};

/**
 * GET /api/videos/user/:userId — Get user's videos
 */
exports.getUserVideos = async (req, res) => {
    try {
        const userId = parseInt(req.params.userId);
        const [videos] = await pool.query(`
            SELECT id, video_url, thumbnail_url, caption, hashtags,
                   likes_count, views_count, comments_count, duration, created_at
            FROM videos
            WHERE user_id = ? AND is_active = 1
            ORDER BY created_at DESC
        `, [userId]);

        res.json({ success: true, data: videos });
    } catch (err) {
        console.error('User videos error:', err.message);
        res.status(500).json({ error: 'Failed to load videos' });
    }
};

/* ═══════════════════════════════════════════════════════════════
   COMMENTS
   ═══════════════════════════════════════════════════════════════ */

/**
 * GET /api/videos/:id/comments — Get comments for a video
 */
exports.getComments = async (req, res) => {
    try {
        const videoId = parseInt(req.params.id);
        const [comments] = await pool.query(`
            SELECT c.id, c.text, c.created_at, c.userId,
                   u.username, u.profile_photo
            FROM comments c
            JOIN users u ON c.userId = u.id
            WHERE c.videoId = ?
            ORDER BY c.created_at DESC
            LIMIT 100
        `, [videoId]);

        res.json({ success: true, data: comments });
    } catch (err) {
        console.error('Get comments error:', err.message);
        res.status(500).json({ error: 'Failed to load comments' });
    }
};

/**
 * POST /api/videos/:id/comments — Add a comment
 */
exports.addComment = async (req, res) => {
    try {
        const videoId = parseInt(req.params.id);
        const userId = req.user.id;
        const { text } = req.body;

        if (!text || text.trim().length === 0) {
            return res.status(400).json({ error: 'Comment text is required' });
        }
        if (text.trim().length > 1000) {
            return res.status(400).json({ error: 'Comment too long (max 1000 chars)' });
        }

        const [result] = await pool.query(
            'INSERT INTO comments (userId, videoId, text) VALUES (?, ?, ?)',
            [userId, videoId, text.trim()]
        );

        await pool.query('UPDATE videos SET comments_count = comments_count + 1 WHERE id = ?', [videoId]);

        // Fetch the created comment with user info
        const [[comment]] = await pool.query(`
            SELECT c.id, c.text, c.created_at, c.userId,
                   u.username, u.profile_photo
            FROM comments c
            JOIN users u ON c.userId = u.id
            WHERE c.id = ?
        `, [result.insertId]);

        const [[{ comments_count }]] = await pool.query('SELECT comments_count FROM videos WHERE id = ?', [videoId]);

        res.status(201).json({ success: true, comment, comments_count });
    } catch (err) {
        console.error('Add comment error:', err.message);
        res.status(500).json({ error: 'Failed to add comment' });
    }
};

/**
 * DELETE /api/comments/:id — Delete own comment
 */
exports.deleteComment = async (req, res) => {
    try {
        const commentId = parseInt(req.params.id);
        const userId = req.user.id;

        const [[comment]] = await pool.query(
            'SELECT id, videoId FROM comments WHERE id = ? AND userId = ?',
            [commentId, userId]
        );

        if (!comment) {
            return res.status(404).json({ error: 'Comment not found or unauthorized' });
        }

        await pool.query('DELETE FROM comments WHERE id = ?', [commentId]);
        await pool.query(
            'UPDATE videos SET comments_count = GREATEST(0, comments_count - 1) WHERE id = ?',
            [comment.videoId]
        );

        const [[{ comments_count }]] = await pool.query('SELECT comments_count FROM videos WHERE id = ?', [comment.videoId]);

        res.json({ success: true, comments_count });
    } catch (err) {
        console.error('Delete comment error:', err.message);
        res.status(500).json({ error: 'Failed to delete comment' });
    }
};
