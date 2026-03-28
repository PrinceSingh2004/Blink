/**
 * backend/controllers/videoController.js
 * ═══════════════════════════════════════════════════════════
 * Professional Reels Ingestion – Cloud Persistence Ready
 * ═══════════════════════════════════════════════════════════
 */

const db = require('../config/db');
const asyncHandler = require('express-async-handler');

// ─── UPLOAD REEL ─────────────────────────────────────────────
exports.uploadVideo = asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ success: false, error: 'No video asset provided' });

    // Cloudinary provides the full CDN persistent URL in req.file.path
    const videoUrl = req.file.path;
    const { caption, mood_category = 'General' } = req.body;

    await db.query(
        'INSERT INTO videos (user_id, video_url, caption, mood_category) VALUES (?, ?, ?, ?)',
        [req.user.id, videoUrl, caption, mood_category]
    );

    res.status(201).json({ success: true, message: 'Reel successfully published' });
});

// ─── GET FEED (Infinite Scroll) ───────────────────────────────
exports.getFeed = asyncHandler(async (req, res) => {
    const userId  = req.user.id;
    const limit   = parseInt(req.query.limit) || 10;
    const offset  = parseInt(req.query.offset) || 0;
    const mood    = req.query.mood || 'General';

    // Advanced Feed: Prioritize followed creators + own content
    let sql = `
        SELECT v.*, u.username, u.profile_pic,
            (SELECT COUNT(*) FROM video_likes WHERE video_id = v.id AND user_id = ?) AS liked_by_me
        FROM videos v
        JOIN users u ON v.user_id = u.id
        WHERE (v.user_id = ? OR v.user_id IN (SELECT following_id FROM followers WHERE follower_id = ?))
    `;
    let params = [userId, userId, userId];

    if (mood !== 'General') {
        sql += ' AND v.mood_category = ?';
        params.push(mood);
    }

    sql += ' ORDER BY v.id DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const [rows] = await db.query(sql, params);
    res.json({ success: true, count: rows.length, data: rows });
});

// ─── SOCIAL: LIKE REEL ────────────────────────────────────────
exports.likeVideo = asyncHandler(async (req, res) => {
    const { videoId } = req.params;
    await db.query(
        'INSERT IGNORE INTO video_likes (user_id, video_id) VALUES (?, ?)',
        [req.user.id, videoId]
    );
    res.json({ success: true, message: 'Reel liked' });
});

exports.unlikeVideo = asyncHandler(async (req, res) => {
    const { videoId } = req.params;
    await db.query(
        'DELETE FROM video_likes WHERE user_id = ? AND video_id = ?',
        [req.user.id, videoId]
    );
    res.json({ success: true, message: 'Reel unliked' });
});
