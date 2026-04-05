/**
 * controllers/videoController.js — Video Feed & Interactions
 * ═══════════════════════════════════════════════════════════
 */

const { pool } = require('../config/db');

/**
 * GET /api/videos — Public feed
 */
exports.getFeed = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
        const offset = (page - 1) * limit;

        const [videos] = await pool.query(`
            SELECT 
                v.id, v.user_id, v.video_url, v.thumbnail_url,
                v.caption, v.hashtags, v.duration,
                v.likes_count, v.views_count, v.created_at,
                u.username, u.profile_photo
            FROM videos v
            JOIN users u ON v.user_id = u.id
            WHERE v.is_active = 1
            ORDER BY v.created_at DESC
            LIMIT ? OFFSET ?
        `, [limit, offset]);

        res.json({ success: true, data: videos, page, limit });
    } catch (err) {
        console.error('Feed error:', err.message);
        res.status(500).json({ error: 'Failed to load feed' });
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
                v.likes_count, v.views_count,
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
 * POST /api/videos/:id/like — Toggle like
 */
exports.likeVideo = async (req, res) => {
    try {
        const videoId = parseInt(req.params.id);
        const userId = req.user.id;

        // Check if already liked
        const [existing] = await pool.query(
            'SELECT id FROM likes WHERE user_id = ? AND video_id = ?',
            [userId, videoId]
        );

        if (existing.length > 0) {
            // Unlike
            await pool.query('DELETE FROM likes WHERE user_id = ? AND video_id = ?', [userId, videoId]);
            await pool.query('UPDATE videos SET likes_count = GREATEST(0, likes_count - 1) WHERE id = ?', [videoId]);
            return res.json({ success: true, liked: false, message: 'Unliked' });
        }

        // Like
        await pool.query('INSERT INTO likes (user_id, video_id) VALUES (?, ?)', [userId, videoId]);
        await pool.query('UPDATE videos SET likes_count = likes_count + 1 WHERE id = ?', [videoId]);
        res.json({ success: true, liked: true, message: 'Liked' });

    } catch (err) {
        console.error('Like error:', err.message);
        res.status(500).json({ error: 'Like operation failed' });
    }
};

/**
 * POST /api/videos/:id/view — Increment view count
 */
exports.viewVideo = async (req, res) => {
    try {
        const videoId = parseInt(req.params.id);
        await pool.query('UPDATE videos SET views_count = views_count + 1 WHERE id = ?', [videoId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'View tracking failed' });
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
                   likes_count, views_count, duration, created_at
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
