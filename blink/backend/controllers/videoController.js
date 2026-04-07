/**
 * controllers/videoController.js — Video Feed, Interactions & Comments
 * ═══════════════════════════════════════════════════════════════════════
 * Uses dynamic column detection to prevent "Unknown column" errors.
 */

const { pool } = require('../config/db');
const { getColumn } = require('../utils/columnMapper');

/**
 * Resolves the real column names once (cached) for videos table
 */
async function resolveVideoCols() {
    const userCol = await getColumn('videos', ['user_id', 'userId', 'creator_id']) || 'user_id';
    const activeCol = await getColumn('videos', ['is_active', 'active', 'isActive']) || 'is_active';
    const likesCol = await getColumn('videos', ['likes_count', 'likesCount', 'likes']) || 'likes_count';
    const viewsCol = await getColumn('videos', ['views_count', 'viewsCount', 'views']) || 'views_count';
    const commentsCol = await getColumn('videos', ['comments_count', 'commentsCount', 'comments']) || 'comments_count';
    const videoUrlCol = await getColumn('videos', ['video_url', 'videoUrl', 'url']) || 'video_url';
    const captionCol = await getColumn('videos', ['caption']) || 'caption';
    return { userCol, activeCol, likesCol, viewsCol, commentsCol, videoUrlCol, captionCol };
}

/**
 * GET /api/videos/feed — Dynamic Feed
 */
exports.getFeed = async (req, res) => {
    try {
        const cols = await resolveVideoCols();

        const query = `
            SELECT 
                v.id,
                v.${cols.userCol} AS user_id,
                v.${cols.userCol} AS userId,
                v.${cols.videoUrlCol} AS videoUrl,
                v.${cols.captionCol} AS caption,
                u.username,
                u.profile_photo,
                v.${cols.likesCol} AS likes_count,
                v.${cols.commentsCol} AS comments_count,
                v.${cols.viewsCol} AS views_count
            FROM videos v
            LEFT JOIN users u ON v.${cols.userCol} = u.id
            WHERE v.${cols.activeCol} = 1
            ORDER BY RAND()
            LIMIT 20
        `;

        const [rows] = await pool.query(query);
        res.json({ success: true, data: rows || [] });
    } catch (err) {
        console.error('🔥 Feed error:', err.message);
        res.status(500).json({ success: false, error: 'Failed to load feed' });
    }
};

/**
 * Atomic Interaction Fixes (Failsafe)
 */
exports.likeVideo = async (req, res) => {
    try {
        const videoId = req.params.id;
        const userId = req.user.id;

        const [existing] = await pool.query(
            'SELECT id FROM likes WHERE user_id = ? AND video_id = ?',
            [userId, videoId]
        );

        const cols = await resolveVideoCols();

        if (existing.length > 0) {
            await pool.query('DELETE FROM likes WHERE user_id = ? AND video_id = ?', [userId, videoId]);
            await pool.query(`UPDATE videos SET ${cols.likesCol} = GREATEST(0, ${cols.likesCol} - 1) WHERE id = ?`, [videoId]);
        } else {
            await pool.query('INSERT INTO likes (user_id, video_id) VALUES (?, ?)', [userId, videoId]);
            await pool.query(`UPDATE videos SET ${cols.likesCol} = ${cols.likesCol} + 1 WHERE id = ?`, [videoId]);
        }
        
        const [[{ lc }]] = await pool.query(`SELECT ${cols.likesCol} AS lc FROM videos WHERE id = ?`, [videoId]);
        
        const { getIO } = require('../utils/socket');
        const io = getIO();
        if (io) io.emit('update_likes', { videoId, likes_count: lc });

        res.json({ success: true, likes_count: lc, liked: existing.length === 0 });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.viewVideo = async (req, res) => {
    try {
        const videoId = req.params.id;
        const userId = req.user ? req.user.id : null;
        const cols = await resolveVideoCols();
        
        await pool.query('INSERT INTO views (user_id, video_id) VALUES (?, ?)', [userId, videoId]);
        await pool.query(`UPDATE videos SET ${cols.viewsCol} = ${cols.viewsCol} + 1 WHERE id = ?`, [videoId]);
        
        const [[{ vc }]] = await pool.query(`SELECT ${cols.viewsCol} AS vc FROM videos WHERE id = ?`, [videoId]);
        
        const { getIO } = require('../utils/socket');
        const io = getIO();
        if (io) io.emit('update_views', { videoId, views_count: vc });
        
        res.json({ success: true, views_count: vc });
    } catch (err) {
        res.json({ success: true, warning: 'View recording skipped' });
    }
};

exports.getComments = async (req, res) => {
    try {
        const videoId = req.params.id;
        const [comments] = await pool.query(`
            SELECT c.*, u.username, u.profile_photo
            FROM comments c 
            JOIN users u ON c.user_id = u.id
            WHERE c.video_id = ?
            ORDER BY c.created_at DESC
        `, [videoId]);
        res.json({ success: true, data: comments });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.addComment = async (req, res) => {
    try {
        const videoId = parseInt(req.params.id);
        const userId = req.user.id;
        const { text } = req.body;
        const cols = await resolveVideoCols();

        if (!text || text.trim().length === 0) {
            return res.status(400).json({ error: 'Comment text is required' });
        }

        const [result] = await pool.query(
            'INSERT INTO comments (user_id, video_id, text) VALUES (?, ?, ?)',
            [userId, videoId, text.trim()]
        );

        await pool.query(`UPDATE videos SET ${cols.commentsCol} = ${cols.commentsCol} + 1 WHERE id = ?`, [videoId]);

        const [[comment]] = await pool.query(`
            SELECT c.id, c.text, c.created_at, c.user_id,
                   u.username, u.profile_photo
            FROM comments c
            JOIN users u ON c.user_id = u.id
            WHERE c.id = ?
        `, [result.insertId]);

        const [[{ cc }]] = await pool.query(`SELECT ${cols.commentsCol} AS cc FROM videos WHERE id = ?`, [videoId]);

        res.status(201).json({ success: true, comment, comments_count: cc });
    } catch (err) {
        console.error('🔥 Add comment error:', err.message);
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
        const cols = await resolveVideoCols();

        // Use snake_case column names (matching initDB schema)
        const [[comment]] = await pool.query(
            'SELECT id, video_id FROM comments WHERE id = ? AND user_id = ?',
            [commentId, userId]
        );

        if (!comment) {
            return res.status(404).json({ error: 'Comment not found or unauthorized' });
        }

        await pool.query('DELETE FROM comments WHERE id = ?', [commentId]);
        await pool.query(
            `UPDATE videos SET ${cols.commentsCol} = GREATEST(0, ${cols.commentsCol} - 1) WHERE id = ?`,
            [comment.video_id]
        );

        const [[{ cc }]] = await pool.query(`SELECT ${cols.commentsCol} AS cc FROM videos WHERE id = ?`, [comment.video_id]);

        res.json({ success: true, comments_count: cc });
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
        const cols = await resolveVideoCols();

        const [videos] = await pool.query(`
            SELECT v.id, v.${cols.videoUrlCol} AS videoUrl, v.${cols.captionCol} AS caption, u.username
            FROM videos v
            JOIN users u ON v.${cols.userCol} = u.id
            WHERE v.${cols.activeCol} = 1 AND (v.${cols.captionCol} LIKE ? OR u.username LIKE ?)
            LIMIT 20
        `, [`%${q}%`, `%${q}%`]);
        res.json({ success: true, data: videos });
    } catch (err) {
        res.status(500).json({ error: 'Search failed' });
    }
};

exports.getUserVideos = async (req, res) => {
    try {
        const userId = parseInt(req.params.userId);
        const cols = await resolveVideoCols();

        const [videos] = await pool.query(`
            SELECT id, ${cols.videoUrlCol} AS videoUrl, ${cols.captionCol} AS caption, created_at, ${cols.likesCol} AS likes_count, ${cols.viewsCol} AS views_count
            FROM videos
            WHERE ${cols.userCol} = ? AND ${cols.activeCol} = 1
            ORDER BY created_at DESC
        `, [userId]);
        res.json({ success: true, data: videos });
    } catch (err) {
        console.error('🔥 getUserVideos error:', err.message);
        res.status(500).json({ error: 'Failed to load user videos' });
    }
};

/**
 * DELETE /api/videos/:id — Delete own video
 */
exports.deleteVideo = async (req, res) => {
    try {
        const videoId = parseInt(req.params.id);
        const userId = req.user.id;
        const cols = await resolveVideoCols();

        // 1. Verify Ownership
        const [[video]] = await pool.query(
            `SELECT id, ${cols.videoUrlCol}, ${cols.userCol} AS owner_id FROM videos WHERE id = ?`,
            [videoId]
        );

        if (!video) return res.status(404).json({ error: 'Video not found' });
        if (video.owner_id !== userId) return res.status(403).json({ error: 'Unauthorized to delete this video' });

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

        res.json({ success: true, message: 'Video deleted successfully' });
    } catch (err) {
        console.error('Delete video error:', err.message);
        res.status(500).json({ error: 'Failed to delete video' });
    }
};

/**
 * POST /api/users/follow/:id — Toggle follow
 */
exports.followUser = async (req, res) => {
    try {
        const followerId = req.user.id;
        const followingId = parseInt(req.params.id);

        if (followerId === followingId) return res.status(400).json({ error: 'Cannot follow yourself' });

        const [existing] = await pool.query(
            'SELECT id FROM follows WHERE follower_id = ? AND following_id = ?',
            [followerId, followingId]
        );

        if (existing.length > 0) {
            await pool.query('DELETE FROM follows WHERE follower_id = ? AND following_id = ?', [followerId, followingId]);
        } else {
            await pool.query('INSERT INTO follows (follower_id, following_id) VALUES (?, ?)', [followerId, followingId]);
        }

        const [[{ count }]] = await pool.query('SELECT COUNT(*) as count FROM follows WHERE following_id = ?', [followingId]);
        res.json({ success: true, follower_count: count });
    } catch (err) {
        res.status(500).json({ error: 'Follow failed' });
    }
};

/**
 * GET /api/videos/explore — Get latest videos for discovery
 */
exports.getExplore = async (req, res) => {
    try {
        const cols = await resolveVideoCols();

        const [videos] = await pool.query(`
            SELECT v.id, v.${cols.videoUrlCol} AS videoUrl, v.${cols.captionCol} AS caption, u.username, v.${cols.likesCol} AS likes_count, v.${cols.viewsCol} AS views_count
            FROM videos v
            JOIN users u ON v.${cols.userCol} = u.id
            WHERE v.${cols.activeCol} = 1
            ORDER BY v.created_at DESC
            LIMIT 50
        `);
        res.json({ success: true, data: videos });
    } catch (err) {
        res.status(500).json({ error: 'Failed to load explore feed' });
    }
};

/**
 * POST /api/videos/delete-selected — Bulk delete
 */
exports.deleteSelectedVideos = async (req, res) => {
    try {
        const { ids } = req.body;
        const userId = req.user.id;
        const cols = await resolveVideoCols();

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'No video IDs provided' });
        }

        // Verify all videos belong to user
        const [videos] = await pool.query(
            `SELECT id FROM videos WHERE id IN (?) AND ${cols.userCol} = ?`,
            [ids, userId]
        );

        const verifiedIds = videos.map(v => v.id);
        if (verifiedIds.length === 0) return res.status(403).json({ error: 'Unauthorized or no videos found' });

        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();
            await connection.query('DELETE FROM likes WHERE video_id IN (?)', [verifiedIds]);
            await connection.query('DELETE FROM comments WHERE video_id IN (?)', [verifiedIds]);
            await connection.query('DELETE FROM views WHERE video_id IN (?)', [verifiedIds]);
            await connection.query('DELETE FROM videos WHERE id IN (?)', [verifiedIds]);
            await connection.commit();
        } catch (dbErr) {
            await connection.rollback();
            throw dbErr;
        } finally {
            connection.release();
        }

        res.json({ success: true, count: verifiedIds.length });
    } catch (err) {
        console.error('🔥 Batch delete error:', err.message);
        res.status(500).json({ error: 'Failed to delete videos' });
    }
};
