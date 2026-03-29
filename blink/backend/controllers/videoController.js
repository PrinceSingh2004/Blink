/**
 * controllers/videoController.js – Videos & Reels
 */
const pool     = require('../db/config');
const { v2: cloudinary } = require('cloudinary');

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key:    process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const fmt = (n) => {
    const num = parseInt(n, 10) || 0;
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M';
    if (num >= 1_000)     return (num / 1_000).toFixed(1) + 'K';
    return String(num);
};

// ── GET FEED ──────────────────────────────────────────────────────
exports.getFeed = async (req, res) => {
    try {
        const userId = req.user?.id || null;
        const limit  = Math.min(parseInt(req.query.limit || '10', 10), 30);
        const offset = parseInt(req.query.offset || '0', 10);
        const mood   = req.query.mood || null;
        const exclude = (req.query.exclude || '').split(',').filter(Boolean).map(Number);

        let query = `
            SELECT v.id, v.user_id,
                   COALESCE(v.video_url, v.url) AS video_url,
                   v.thumbnail_url, v.caption, v.hashtags, v.mood_category,
                   v.is_blink_moment, v.views_count, v.likes_count, v.duration,
                   v.created_at,
                   u.username,
                   COALESCE(u.profile_pic, u.avatar_url, u.profile_photo) AS avatar,
                   u.is_verified
                   ${userId ? `,
                   (SELECT COUNT(*) FROM video_likes WHERE video_id = v.id AND user_id = ${pool.escape(userId)}) AS liked_by_me` : ', 0 AS liked_by_me'}
            FROM videos v
            JOIN users u ON u.id = v.user_id
            WHERE 1=1
        `;

        const params = [];
        if (mood && mood !== 'General') {
            query += ' AND v.mood_category = ?';
            params.push(mood);
        }
        if (exclude.length > 0) {
            query += ` AND v.id NOT IN (${exclude.map(() => '?').join(',')})`;
            params.push(...exclude);
        }

        query += ' ORDER BY v.created_at DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);

        const [videos] = await pool.query(query, params);

        const formatted = videos.map(v => ({
            ...v,
            likes_formatted:    fmt(v.likes_count),
            comments_formatted: fmt(0),
            video_url:          v.video_url,
            liked_by_me:        Boolean(v.liked_by_me)
        }));

        res.json({ videos: formatted, hasMore: videos.length === limit });
    } catch (e) {
        console.error('[Video] getFeed:', e.message);
        res.status(500).json({ error: e.message });
    }
};

// ── GET SINGLE VIDEO ─────────────────────────────────────────────
exports.getVideo = async (req, res) => {
    try {
        const userId = req.user?.id || null;
        const [rows] = await pool.query(`
            SELECT v.*, u.username,
                   COALESCE(u.profile_pic, u.avatar_url) AS avatar,
                   ${userId ? `(SELECT COUNT(*) FROM video_likes WHERE video_id = v.id AND user_id = ${pool.escape(userId)}) AS liked_by_me,` : '0 AS liked_by_me,'}
                   (SELECT COUNT(*) FROM comments WHERE video_id = v.id) AS comments_count
            FROM videos v
            JOIN users u ON u.id = v.user_id
            WHERE v.id = ?
        `, [req.params.id]);

        if (!rows.length)
            return res.status(404).json({ error: 'Video not found' });

        // Increment view
        await pool.query('UPDATE videos SET views_count = views_count + 1 WHERE id = ?', [req.params.id]);
        res.json(rows[0]);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// ── RECORD VIEW ──────────────────────────────────────────────────
exports.recordView = async (req, res) => {
    try {
        await pool.query('UPDATE videos SET views_count = views_count + 1 WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (e) {
        res.status(200).json({ success: false });
    }
};

// ── TOGGLE LIKE ──────────────────────────────────────────────────
exports.toggleLike = async (req, res) => {
    try {
        const userId  = req.user.id;
        const videoId = req.params.id;

        const [existing] = await pool.query(
            'SELECT id FROM video_likes WHERE video_id = ? AND user_id = ?',
            [videoId, userId]
        );

        if (existing.length > 0) {
            await pool.query('DELETE FROM video_likes WHERE video_id = ? AND user_id = ?', [videoId, userId]);
            await pool.query('UPDATE videos SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = ?', [videoId]);
            const [[v]] = await pool.query('SELECT likes_count FROM videos WHERE id = ?', [videoId]);
            return res.json({ liked: false, likes: v.likes_count });
        }

        await pool.query('INSERT INTO video_likes (video_id, user_id) VALUES (?, ?)', [videoId, userId]);
        await pool.query('UPDATE videos SET likes_count = likes_count + 1 WHERE id = ?', [videoId]);
        const [[v]] = await pool.query('SELECT likes_count, user_id FROM videos WHERE id = ?', [videoId]);

        // Notify video owner
        if (v.user_id !== userId) {
            await pool.query(
                'INSERT INTO notifications (user_id, actor_id, type, entity_type, entity_id, message) VALUES (?, ?, ?, ?, ?, ?)',
                [v.user_id, userId, 'like', 'video', videoId, 'liked your video']
            ).catch(() => {});
        }

        res.json({ liked: true, likes: v.likes_count });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// ── GET COMMENTS ──────────────────────────────────────────────────
exports.getComments = async (req, res) => {
    try {
        const [comments] = await pool.query(`
            SELECT c.id, c.text, c.likes_count, c.created_at,
                   u.id AS user_id, u.username,
                   COALESCE(u.profile_pic, u.avatar_url) AS avatar,
                   u.is_verified
            FROM comments c
            JOIN users u ON u.id = c.user_id
            WHERE c.video_id = ?
            ORDER BY c.created_at ASC
        `, [req.params.id]);
        res.json({ comments });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// ── POST COMMENT ──────────────────────────────────────────────────
exports.postComment = async (req, res) => {
    try {
        const { text } = req.body;
        const videoId  = req.params.id;
        const userId   = req.user.id;

        if (!text?.trim()) return res.status(400).json({ error: 'Comment cannot be empty' });

        const [result] = await pool.query(
            'INSERT INTO comments (video_id, user_id, text) VALUES (?, ?, ?)',
            [videoId, userId, text.trim()]
        );
        await pool.query('UPDATE videos SET comments_count = comments_count + 1 WHERE id = ?', [videoId]);

        const [comment] = await pool.query(`
            SELECT c.id, c.text, c.created_at, u.username,
                   COALESCE(u.profile_pic, u.avatar_url) AS avatar
            FROM comments c JOIN users u ON u.id = c.user_id
            WHERE c.id = ?
        `, [result.insertId]);

        res.status(201).json({ success: true, comment: comment[0] });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// ── UPLOAD VIDEO ─────────────────────────────────────────────────
exports.uploadVideo = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No video file provided' });

        const { caption = '', hashtags = '', mood_category = 'General' } = req.body;

        const result = await new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
                {
                    resource_type: 'video',
                    folder:        'blink_reels',
                    transformation: [
                        { quality: 'auto', fetch_format: 'mp4' }
                    ],
                    eager: [
                        { width: 400, height: 711, crop: 'fill', format: 'jpg' }
                    ]
                },
                (err, result) => err ? reject(err) : resolve(result)
            );
            stream.end(req.file.buffer);
        });

        const videoUrl    = result.secure_url;
        const thumbnailUrl = result.eager?.[0]?.secure_url || null;

        const [insert] = await pool.query(
            `INSERT INTO videos (user_id, url, video_url, thumbnail_url, caption, hashtags, mood_category)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [req.user.id, videoUrl, videoUrl, thumbnailUrl, caption, hashtags, mood_category]
        );
        await pool.query('UPDATE users SET posts_count = posts_count + 1 WHERE id = ?', [req.user.id]);

        res.status(201).json({
            success: true,
            video: { id: insert.insertId, video_url: videoUrl, thumbnail_url: thumbnailUrl }
        });
    } catch (e) {
        console.error('[Video] upload error:', e.message);
        res.status(500).json({ error: 'Video upload failed: ' + e.message });
    }
};

// ── GET USER VIDEOS ───────────────────────────────────────────────
exports.getUserVideos = async (req, res) => {
    try {
        const [videos] = await pool.query(
            `SELECT id, COALESCE(video_url, url) AS video_url, thumbnail_url,
                    caption, likes_count, views_count, created_at
             FROM videos WHERE user_id = ?
             ORDER BY created_at DESC LIMIT 50`,
            [req.params.id]
        );
        res.json({ videos });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};
