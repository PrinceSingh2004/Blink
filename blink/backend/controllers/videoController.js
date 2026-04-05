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
        // Step 1: Detect Real Columns Dynamically
        const videoIdCol = await getColumn('videos', ['id', 'videoId', 'video_id']);
        const videoUrlCol = await getColumn('videos', ['videoUrl', 'video_url', 'url', 'file_url']);
        const videoUserCol = await getColumn('videos', ['userId', 'user_id', 'uploader_id', 'creator_id']);
        const videoActiveCol = await getColumn('videos', ['is_active', 'is_published', 'active']);
        const videoCreatedCol = await getColumn('videos', ['createdAt', 'created_at', 'date_added']);

        const likesVideoCol = await getColumn('likes', ['videoId', 'video_id', 'vid']);
        const likesUserCol = await getColumn('likes', ['userId', 'user_id', 'uid']);

        const commsVideoCol = await getColumn('comments', ['videoId', 'video_id', 'vid']);
        const viewsVideoCol = await getColumn('views', ['videoId', 'video_id', 'vid']);

        // Step 2: Build Safe Select & Atomic Joins
        const select = [
            `v.${videoIdCol || 'id'} AS id`,
            videoUrlCol ? `v.${videoUrlCol} AS videoUrl` : 'NULL AS videoUrl',
            `v.caption`,
            `u.username`,
            `u.profile_photo AS profilePic`,
            `COUNT(DISTINCT l.id) AS likeCount`,
            `COUNT(DISTINCT c.id) AS commentCount`,
            `COUNT(DISTINCT vw.id) AS viewCount`
        ].join(', ');

        const joinLikes = likesVideoCol ? `LEFT JOIN likes l ON l.${likesVideoCol} = v.${videoIdCol}` : 'LEFT JOIN (SELECT NULL id) l ON 1=0';
        const joinComms = commsVideoCol ? `LEFT JOIN comments c ON c.${commsVideoCol} = v.${videoIdCol}` : 'LEFT JOIN (SELECT NULL id) c ON 1=0';
        const joinViews = viewsVideoCol ? `LEFT JOIN views vw ON vw.${viewsVideoCol} = v.${videoIdCol}` : 'LEFT JOIN (SELECT NULL id) vw ON 1=0';

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;

        const query = `
            SELECT ${select}
            FROM videos v
            JOIN users u ON v.${videoUserCol || 'userId'} = u.id
            ${joinLikes}
            ${joinComms}
            ${joinViews}
            WHERE ${videoActiveCol ? `v.${videoActiveCol}` : '1'} = 1
            GROUP BY v.${videoIdCol || 'id'}
            ORDER BY v.${videoCreatedCol || videoIdCol || 'id'} DESC
            LIMIT ? OFFSET ?
        `;

        const [videos] = await pool.query(query, [limit, offset]);
        res.json({ success: true, videos });

    } catch (err) {
        console.error('🔥 [Critical Crash Prevented] Feed Fail:', err.message);
        res.status(500).json({ error: 'Feed Loading Failed', detail: err.message });
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
