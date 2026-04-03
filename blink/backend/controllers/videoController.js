/**
 * controllers/videoController.js – Videos & Reels
 */
const pool     = require('../config/db');
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

// ── GET FEED (Production Fix: Sort by Latest) ───────────────────
exports.getFeed = async (req, res) => {
    try {
        console.log("AUTH HEADER:", req.headers.authorization); // STEP 6: DEBUG AUTH
        const userId = req.user?.id || null;
        const page   = parseInt(req.query.page || '1', 10);
        const limit  = Math.min(parseInt(req.query.limit || '10', 10), 30);
        const offset = (page - 1) * limit;

        console.log(`🎬 [FEED] Fetching Videos: Page ${page}`);

        const query = `
            SELECT v.*, u.username,
                   u.profile_pic,
                   u.is_verified,
                   ${userId ? `(SELECT COUNT(*) FROM likes WHERE post_id = v.id AND user_id = ${pool.escape(userId)}) AS liked_by_me` : '0 AS liked_by_me'}
            FROM videos v
            LEFT JOIN users u ON u.id = v.user_id
            ORDER BY RAND() -- RANDOM REEL SELECTION
            LIMIT ? OFFSET ?
        `;

        const [videos] = await pool.query(query, [limit, offset]);
        console.log(`✅ [FEED] ${videos.length} videos found in database`);

        const formatted = videos.map(v => ({
            ...v,
            video_url: v.video_url || v.url,
            liked_by_me: Boolean(v.liked_by_me)
        }));

        res.json({ success: true, videos: formatted, hasMore: videos.length === limit });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// ── SEARCH (Users + Videos) ───────────────────────────────────────
exports.search = async (req, res) => {
    try {
        const q = `%${req.query.q || ""}%`;
        
        // Parallel lookup: Users and Videos
        const [users] = await pool.query(
            "SELECT id, username, profile_pic FROM users WHERE username LIKE ? LIMIT 10",
            [q]
        );
        const [videos] = await pool.query(
            "SELECT id, video_url, caption, thumbnail_url FROM videos WHERE caption LIKE ? LIMIT 10",
            [q]
        );

        res.json({ success: true, users, videos });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// ── GET SINGLE VIDEO ─────────────────────────────────────────────
exports.getVideo = async (req, res) => {
    try {
        const userId = req.user?.id || null;
        const [rows] = await pool.query(`
            SELECT v.*, u.username,
                   u.profile_pic AS avatar,
                   ${userId ? `(SELECT COUNT(*) FROM likes WHERE post_id = v.id AND user_id = ${pool.escape(userId)}) AS liked_by_me,` : '0 AS liked_by_me,'}
                   (SELECT COUNT(*) FROM comments WHERE post_id = v.id) AS comments_count
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
            'SELECT id FROM likes WHERE post_id = ? AND user_id = ?',
            [videoId, userId]
        );

        if (existing.length > 0) {
            await pool.query('DELETE FROM likes WHERE post_id = ? AND user_id = ?', [videoId, userId]);
            await pool.query('UPDATE videos SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = ?', [videoId]);
            const [[v]] = await pool.query('SELECT likes_count FROM videos WHERE id = ?', [videoId]);
            return res.json({ liked: false, likes: v.likes_count });
        }

        await pool.query('INSERT INTO likes (post_id, user_id) VALUES (?, ?)', [videoId, userId]);
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
            SELECT c.id, c.comment AS text, c.likes_count, c.created_at,
                   u.id AS user_id, u.username,
                   u.profile_pic AS avatar,
                   u.is_verified
            FROM comments c
            JOIN users u ON u.id = c.user_id
            WHERE c.post_id = ?
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
            'INSERT INTO comments (post_id, user_id, comment) VALUES (?, ?, ?)',
            [videoId, userId, text.trim()]
        );
        await pool.query('UPDATE videos SET comments_count = comments_count + 1 WHERE id = ?', [videoId]);

        const [comment] = await pool.query(`
            SELECT c.id, c.comment AS text, c.created_at, u.username,
                   u.profile_pic AS avatar
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
            `INSERT INTO videos (user_id, video_url, thumbnail_url, caption, hashtags, public_id)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [req.user.id, videoUrl, thumbnailUrl, caption, hashtags, result.public_id]
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
