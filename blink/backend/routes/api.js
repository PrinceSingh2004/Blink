const express = require('express');
const router = express.Router();
const { db } = require('../db');
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/auth');

// ─── AUTH ────────────────────────────────────────────────────────────────────
router.post('/auth/register', authController.register);
router.post('/auth/login',    authController.login);

// ─── VIDEOS – Random Infinite Scroll Feed ────────────────────────────────────
/**
 * GET /api/videos
 * Query params:
 *   mood   – filter by mood_category (optional, default = all)
 *   limit  – how many videos to return (default 10, max 20)
 *   exclude – comma-separated list of video IDs already shown in this session
 *
 * Returns videos ordered randomly from MySQL using RAND()
 * Supports continuous pagination by excluding already-seen IDs.
 */
router.get('/videos', async (req, res) => {
    try {
        const limit   = Math.min(parseInt(req.query.limit)  || 10, 20);
        const mood    = req.query.mood    || null;
        const exclude = req.query.exclude || '';

        // Build the exclude list
        const excludeIds = exclude
            ? exclude.split(',').map(Number).filter(n => !isNaN(n) && n > 0)
            : [];

        // Build WHERE clause – always require a real video_url
        let whereClauses = ["v.video_url IS NOT NULL AND v.video_url != ''"];
        let params = [];

        if (mood && mood !== 'General') {
            whereClauses.push('v.mood_category = ?');
            params.push(mood);
        }

        if (excludeIds.length > 0) {
            whereClauses.push(`v.id NOT IN (${excludeIds.map(() => '?').join(',')})`);
            params.push(...excludeIds);
        }

        const whereSQL = 'WHERE ' + whereClauses.join(' AND ');

        // When all videos have been seen, reset (no exclude filter) to allow cycling
        const countSQL = `SELECT COUNT(*) AS total FROM videos v ${whereSQL}`;
        const [countRows] = await db.query(countSQL, params);
        let totalAvailable = countRows[0].total;

        let finalWhereSQL = whereSQL;
        let finalParams   = [...params];

        // If there are no unseen videos, cycle back (ignore excludes)
        if (totalAvailable === 0) {
            let fallbackWhere = '';
            let fallbackParams = [];
            if (mood && mood !== 'General') {
                fallbackWhere = 'WHERE v.mood_category = ?';
                fallbackParams.push(mood);
            }
            finalWhereSQL = fallbackWhere;
            finalParams   = fallbackParams;
        }

        const sql = `
            SELECT
                v.id,
                v.user_id,
                v.video_url,
                v.caption,
                v.hashtags,
                v.mood_category,
                v.is_blink_moment,
                v.likes,
                v.views,
                v.created_at,
                COALESCE(u.username, 'blink_user')   AS username,
                COALESCE(u.display_name, 'Blink Creator') AS display_name
            FROM videos v
            LEFT JOIN users u ON v.user_id = u.id
            ${finalWhereSQL}
            ORDER BY RAND()
            LIMIT ?
        `;
        finalParams.push(limit);

        const [videos] = await db.query(sql, finalParams);

        // Enrich avatar fallback on JS side since MySQL string concat varies
        const enriched = videos.map(v => ({
            ...v,
            avatar: v.avatar && v.avatar.startsWith('http')
                ? v.avatar
                : `https://i.pravatar.cc/150?u=blink_${v.user_id}_${v.id}`,
            likes_formatted: formatNumber(v.likes),
            views_formatted: formatNumber(v.views)
        }));

        res.json({ videos: enriched, total: totalAvailable });

    } catch (err) {
        console.error('[/api/videos] Error:', err.message);
        res.status(500).json({ error: 'Failed to fetch videos', detail: err.message });
    }
});

// ─── LIKE A VIDEO ─────────────────────────────────────────────────────────────
router.post('/videos/:id/like', async (req, res) => {
    try {
        const { id } = req.params;
        await db.query('UPDATE videos SET likes = likes + 1 WHERE id = ?', [id]);
        const [[video]] = await db.query('SELECT likes FROM videos WHERE id = ?', [id]);
        res.json({ success: true, likes: video.likes });
    } catch (err) {
        res.status(500).json({ error: 'Failed to like video' });
    }
});

// ─── INCREMENT VIEW COUNT ──────────────────────────────────────────────────────
router.post('/videos/:id/view', async (req, res) => {
    try {
        const { id } = req.params;
        await db.query('UPDATE videos SET views = views + 1 WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to increment views' });
    }
});

// ─── HELPER: format numbers ───────────────────────────────────────────────────
function formatNumber(n) {
    if (!n) return '0';
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K';
    return String(n);
}

// Protected profile route
router.get('/profile', authMiddleware, (req, res) => {
    res.json({ message: 'Welcome to Blink Profile', userId: req.user.id });
});

module.exports = router;
