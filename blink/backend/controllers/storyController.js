/**
 * controllers/storyController.js – 24h Instagram Stories
 */
const pool = require('../db/config');
const { v2: cloudinary } = require('cloudinary');

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key:    process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const EXPIRY_HOURS = parseInt(process.env.STORY_EXPIRY_HOURS || '24', 10);

// ── UPLOAD STORY ──────────────────────────────────────────────────
exports.uploadStory = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No media file provided' });

        const isVideo  = req.file.mimetype.startsWith('video');
        const resType  = isVideo ? 'video' : 'image';

        const result = await new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
                {
                    resource_type:  resType,
                    folder:         'blink_stories',
                    transformation: isVideo
                        ? [{ quality: 'auto', fetch_format: 'mp4' }]
                        : [{ quality: 'auto', fetch_format: 'auto', width: 1080, crop: 'limit' }]
                },
                (err, r) => err ? reject(err) : resolve(r)
            );
            stream.end(req.file.buffer);
        });

        await pool.query(
            `INSERT INTO stories (user_id, media_url, media_type, expires_at)
             VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? HOUR))`,
            [req.user.id, result.secure_url, isVideo ? 'video' : 'image', EXPIRY_HOURS]
        );

        res.status(201).json({ success: true, url: result.secure_url });
    } catch (e) {
        console.error('[Story] upload:', e.message);
        res.status(500).json({ error: 'Story upload failed: ' + e.message });
    }
};

// ── GET FEED STORIES ──────────────────────────────────────────────
exports.getStories = async (req, res) => {
    try {
        const userId = req.user?.id;
        const [rows] = await pool.query(`
            SELECT s.id, s.user_id, s.media_url, s.media_type, s.expires_at, s.created_at,
                   u.username, COALESCE(u.profile_pic, u.avatar_url) AS avatar,
                   ${userId ? `(SELECT COUNT(*) FROM story_views WHERE story_id = s.id AND user_id = ${pool.escape(userId)}) AS seen` : '0 AS seen'}
            FROM stories s
            JOIN users u ON u.id = s.user_id
            WHERE s.expires_at > NOW()
            AND (
                s.user_id = ?
                OR s.user_id IN (SELECT following_id FROM followers WHERE follower_id = ?)
            )
            ORDER BY s.created_at DESC
        `, [userId || 0, userId || 0]);

        // Group by user
        const grouped = {};
        rows.forEach(story => {
            if (!grouped[story.user_id]) {
                grouped[story.user_id] = {
                    user_id:  story.user_id,
                    username: story.username,
                    avatar:   story.avatar,
                    stories:  [],
                    all_seen: true
                };
            }
            grouped[story.user_id].stories.push(story);
            if (!story.seen) grouped[story.user_id].all_seen = false;
        });

        res.json({ success: true, users: Object.values(grouped) });
    } catch (e) {
        console.error('[Story] getStories:', e.message);
        res.status(500).json({ error: e.message });
    }
};

// ── MARK STORY AS SEEN ────────────────────────────────────────────
exports.markAsSeen = async (req, res) => {
    try {
        const { storyId } = req.params;
        await pool.query(
            'INSERT IGNORE INTO story_views (story_id, user_id) VALUES (?, ?)',
            [storyId, req.user.id]
        );
        await pool.query('UPDATE stories SET views_count = views_count + 1 WHERE id = ?', [storyId]);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// ── CLEANUP EXPIRED STORIES ───────────────────────────────────────
exports.cleanupStories = async () => {
    try {
        const [expired] = await pool.query('SELECT id FROM stories WHERE expires_at < NOW()');
        if (expired.length > 0) {
            await pool.query('DELETE FROM stories WHERE expires_at < NOW()');
            console.log(`[Stories] ✅ Cleaned up ${expired.length} expired stories`);
        }
    } catch (err) {
        console.error('[Stories] cleanup error:', err.message);
    }
};

// Start cleanup interval
const INTERVAL_MS = parseInt(process.env.CLEANUP_INTERVAL_MINS || '60', 10) * 60 * 1000;
setInterval(exports.cleanupStories, INTERVAL_MS);
