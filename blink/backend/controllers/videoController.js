/**
 * controllers/videoController.js — Video Feed, Interactions & Comments
 * ═══════════════════════════════════════════════════════════════════════
 */

const { pool } = require('../config/db');
const { getColumn } = require('../utils/columnMapper');

/**
 * GET /api/videos/feed — AUTO-HEALING Dynamic Feed
 * ═════════════════════════════════════════════════════
 */
exports.getFeed = async (req, res) => {
    try {
        const query = `
            SELECT 
                v.id,
                v.user_id,
                v.user_id AS userId,
                v.video_url AS videoUrl,
                v.caption,
                u.username,
                u.profile_pic AS profile_photo,
                COUNT(DISTINCT l.id) AS likes_count,
                COUNT(DISTINCT c.id) AS comments_count,
                COUNT(DISTINCT vw.id) AS views_count
            FROM videos v
            LEFT JOIN users u ON v.user_id = u.id
            LEFT JOIN likes l ON l.video_id = v.id
            LEFT JOIN comments c ON c.video_id = v.id
            LEFT JOIN views vw ON vw.video_id = v.id
            GROUP BY v.id
            ORDER BY v.created_at DESC
        `;

        const [rows] = await pool.query(query);
        console.log("Feed loaded successfully, rows:", rows.length);
        
        res.json({ success: true, data: rows || [] });
    } catch (err) {
        console.error('🔥 Feed error:', err);  // ✅ Added logging for Phase 1
        // Fail-safe mode: return [] instead of crashing
        res.json({ success: false, data: [], error: err.message });
    }
};

/**
 * Atomic Interaction Fixes (Failsafe)
 */
exports.likeVideo = async (req, res) => {
    try {
        const videoId = req.params.id;
        const userId = req.user.id;

        const videoIdCol = await getColumn('likes', ['videoId', 'video_id', 'vid']);
        const userIdCol = await getColumn('likes', ['userId', 'user_id', 'uid']);

        if (!videoIdCol || !userIdCol) throw new Error('Database Schema Broken');

        const [existing] = await pool.query(
            `SELECT id FROM likes WHERE ${userIdCol} = ? AND ${videoIdCol} = ?`,
            [userId, videoId]
        );

        if (existing.length > 0) {
            await pool.query(`DELETE FROM likes WHERE ${userIdCol} = ? AND ${videoIdCol} = ?`, [userId, videoId]);
        } else {
            await pool.query(`INSERT INTO likes (${userIdCol}, ${videoIdCol}) VALUES (?, ?)`, [userId, videoId]);
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.viewVideo = async (req, res) => {
    try {
        const videoId = req.params.id;
        const videoIdCol = await getColumn('views', ['videoId', 'video_id']);
        if (videoIdCol) {
            await pool.query(`INSERT INTO views (${videoIdCol}) VALUES (?)`, [videoId]);
        }
        res.json({ success: true });
    } catch (err) {
        res.json({ success: true, warning: 'View recording skipped' });
    }
};

exports.getComments = async (req, res) => {
    try {
        const videoId = req.params.id;
        const videoIdCol = await getColumn('comments', ['videoId', 'video_id']);
        const userIdCol = await getColumn('comments', ['userId', 'user_id', 'uid']);

        const [comments] = await pool.query(`
            SELECT c.*, u.username 
            FROM comments c 
            JOIN users u ON c.${userIdCol || 'userId'} = u.id
            WHERE c.${videoIdCol || 'videoId'} = ?
        `, [videoId]);
        res.json({ success: true, data: comments });
    } catch (err) {
        res.status(500).json({ error: err.message });
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

/**
 * GET /api/videos/search?q=keyword
 */
exports.searchVideos = async (req, res) => {
    try {
        const q = (req.query.q || '').trim();
        const videoUserCol = await getColumn('videos', ['userId', 'user_id']);
        const videoUrlCol = await getColumn('videos', ['videoUrl', 'video_url']);

        const [videos] = await pool.query(`
            SELECT v.id, v.${videoUrlCol || 'videoUrl'} AS videoUrl, v.caption, u.username
            FROM videos v
            JOIN users u ON v.${videoUserCol || 'userId'} = u.id
            WHERE v.is_active = 1 AND (v.caption LIKE ? OR u.username LIKE ?)
            LIMIT 20
        `, [`%${q}%`, `%${q}%`]);
        res.json({ success: true, data: videos });
    } catch (err) {
        res.status(500).json({ error: 'Search failed' });
    }
};

/**
 * GET /api/videos/user/:userId — Get user's videos
 */
exports.getUserVideos = async (req, res) => {
    try {
        const userId = parseInt(req.params.userId);
        const videoUserCol = await getColumn('videos', ['userId', 'user_id']);
        const videoUrlCol = await getColumn('videos', ['videoUrl', 'video_url']);

        const [videos] = await pool.query(`
            SELECT id, ${videoUrlCol || 'videoUrl'} AS videoUrl, caption, created_at
            FROM videos
            WHERE ${videoUserCol || 'userId'} = ? AND is_active = 1
            ORDER BY created_at DESC
        `, [userId]);
        res.json({ success: true, data: videos });
    } catch (err) {
        res.status(500).json({ error: 'Failed to load videos' });
    }
};
/**
 * DELETE /api/videos/:id — Delete own video
 */
exports.deleteVideo = async (req, res) => {
    try {
        const videoId = parseInt(req.params.id);
        const userId = req.user.id;

        // 1. Verify Ownership
        const [[video]] = await pool.query(
            'SELECT id, video_url, user_id FROM videos WHERE id = ?',
            [videoId]
        );

        if (!video) return res.status(404).json({ error: 'Video not found' });
        if (video.user_id !== userId) return res.status(403).json({ error: 'Unauthorized to delete this video' });

        console.log(`🗑️ User ${userId} deleting video ${videoId}`);

        // 2. Clear Database (Atomic)
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();
            await connection.query('DELETE FROM likes WHERE video_id = ?', [videoId]);
            await connection.query('DELETE FROM comments WHERE video_id = ?', [videoId]);
            await connection.query('DELETE FROM views WHERE video_id = ?', [videoId]);
            await connection.query('DELETE FROM videos WHERE id = ?', [videoId]);
            await connection.commit();
        } catch (dbErr) {
            await connection.rollback();
            throw dbErr;
        } finally {
            connection.release();
        }

        // 3. Cloudinary cleanup would normally go here using public_id
        // Since we only store URL, we'd need to extract public_id or use a library
        // skipping for now to prioritize stability.

        res.json({ success: true, message: 'Video deleted successfully' });
    } catch (err) {
        console.error('Delete video error:', err.message);
        res.status(500).json({ error: 'Failed to delete video' });
    }
};
