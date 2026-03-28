/**
 * backend/controllers/storyController.js
 * ═══════════════════════════════════════════════════════════
 * Instagram Stories System – Cloud Persistence Ready
 * ═══════════════════════════════════════════════════════════
 */

const db = require('../config/db');
const asyncHandler = require('express-async-handler');
require('dotenv').config();

const EXPIRY_HOURS = process.env.STORY_EXPIRY_HOURS || 24;

// ─── UPLOAD STORY ─────────────────────────────────────────────
exports.uploadStory = asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ success: false, error: 'No media asset provided' });

    // Cloudinary URL (Persistent)
    const mediaUrl = req.file.path;
    const mediaType = req.file.mimetype.startsWith('video') ? 'video' : 'image';

    await db.query(
        'INSERT INTO stories (user_id, media_url, media_type, expires_at) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? HOUR))',
        [req.user.id, mediaUrl, mediaType, EXPIRY_HOURS]
    );

    res.status(201).json({ success: true, message: 'Story successfully posted' });
});

// ─── GET FEED STORIES ──────────────────────────────────────────
exports.getStories = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const [rows] = await db.query(`
        SELECT s.*, u.username, u.profile_pic,
            (SELECT COUNT(*) FROM story_views WHERE story_id = s.id AND user_id = ?) AS seen
        FROM stories s
        JOIN users u ON s.user_id = u.id
        WHERE s.expires_at > NOW()
        AND (s.user_id = ? OR s.user_id IN (SELECT following_id FROM followers WHERE follower_id = ?))
        ORDER BY s.created_at DESC
    `, [userId, userId, userId]);

    // Professional Grouping for Bubble UI
    const grouped = rows.reduce((acc, story) => {
        if (!acc[story.user_id]) {
            acc[story.user_id] = {
                user_id: story.user_id,
                username: story.username,
                avatar: story.profile_pic,
                stories: [],
                all_seen: true
            };
        }
        acc[story.user_id].stories.push(story);
        if (!story.seen) acc[story.user_id].all_seen = false;
        return acc;
    }, {});

    res.json({ success: true, data: Object.values(grouped) });
});

// ─── MARK AS SEEN ──────────────────────────────────────────────
exports.markAsSeen = asyncHandler(async (req, res) => {
    const { storyId } = req.params;
    await db.query(
        'INSERT IGNORE INTO story_views (story_id, user_id) VALUES (?, ?)',
        [storyId, req.user.id]
    );
    res.json({ success: true });
});

// ─── AUTO DB CLEANUP ───────────────────────────────────────────
exports.cleanupStories = async () => {
    try {
        const [expired] = await db.query('SELECT id FROM stories WHERE expires_at < NOW()');
        await db.query('DELETE FROM stories WHERE expires_at < NOW()');
        if (expired.length > 0) console.log(`[Stories] ✅ Cleaned up ${expired.length} expired DB entries.`);
    } catch (err) {
        console.error('[Stories] Cleanup error:', err);
    }
};
