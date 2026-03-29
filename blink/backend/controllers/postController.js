/**
 * controllers/postController.js – Photo/Video Posts (Instagram-style)
 */
const pool = require('../db/config');
const { v2: cloudinary } = require('cloudinary');

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key:    process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const fmt = n => {
    const num = parseInt(n, 10) || 0;
    if (num >= 1e6) return (num / 1e6).toFixed(1) + 'M';
    if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K';
    return String(num);
};

// ── GET FEED ──────────────────────────────────────────────────────
exports.getFeed = async (req, res) => {
    try {
        const userId = req.user?.id || null;
        const limit  = Math.min(parseInt(req.query.limit || '10', 10), 30);
        const offset = parseInt(req.query.offset || '0', 10);

        const [posts] = await pool.query(`
            SELECT p.id, p.user_id, p.media_url, p.media_type, p.thumbnail_url,
                   p.caption, p.hashtags, p.likes_count, p.comments_count,
                   p.views_count, p.is_blink_moment, p.created_at,
                   u.username, u.is_verified,
                   COALESCE(u.profile_pic, u.avatar_url) AS avatar
                   ${userId ? `,
                   (SELECT COUNT(*) FROM post_likes WHERE post_id = p.id AND user_id = ${pool.escape(userId)}) AS liked_by_me` : ', 0 AS liked_by_me'}
            FROM posts p
            JOIN users u ON u.id = p.user_id
            ORDER BY p.created_at DESC
            LIMIT ? OFFSET ?
        `, [limit, offset]);

        res.json({
            posts: posts.map(p => ({
                ...p,
                liked_by_me:     Boolean(p.liked_by_me),
                likes_formatted: fmt(p.likes_count)
            })),
            hasMore: posts.length === limit
        });
    } catch (e) {
        console.error('[Post] getFeed:', e.message);
        res.status(500).json({ error: e.message });
    }
};

// ── CREATE POST ───────────────────────────────────────────────────
exports.createPost = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'Media file required' });

        const { caption = '', hashtags = '', mood_category = 'General' } = req.body;
        const isVideo    = req.file.mimetype.startsWith('video');
        const resType    = isVideo ? 'video' : 'image';
        const folderName = isVideo ? 'blink_reels' : 'blink_posts';

        const result = await new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
                {
                    resource_type: resType,
                    folder:        folderName,
                    transformation: isVideo
                        ? [{ quality: 'auto', fetch_format: 'mp4' }]
                        : [{ quality: 'auto', fetch_format: 'auto', width: 1080, crop: 'limit' }],
                    eager: isVideo
                        ? [{ width: 400, height: 711, crop: 'fill', format: 'jpg' }]
                        : []
                },
                (err, r) => err ? reject(err) : resolve(r)
            );
            stream.end(req.file.buffer);
        });

        const mediaUrl     = result.secure_url;
        const thumbnailUrl = isVideo ? result.eager?.[0]?.secure_url || null : null;

        const [insert] = await pool.query(
            `INSERT INTO posts (user_id, media_url, media_type, thumbnail_url, caption, hashtags, mood_category)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [req.user.id, mediaUrl, isVideo ? 'video' : 'image', thumbnailUrl, caption, hashtags, mood_category]
        );
        await pool.query('UPDATE users SET posts_count = posts_count + 1 WHERE id = ?', [req.user.id]);

        res.status(201).json({
            success: true,
            post: { id: insert.insertId, media_url: mediaUrl, thumbnail_url: thumbnailUrl, caption, media_type: resType }
        });
    } catch (e) {
        console.error('[Post] createPost:', e.message);
        res.status(500).json({ error: 'Upload failed: ' + e.message });
    }
};

// ── TOGGLE POST LIKE ──────────────────────────────────────────────
exports.toggleLike = async (req, res) => {
    try {
        const { id: postId } = req.params;
        const userId = req.user.id;

        const [ex] = await pool.query(
            'SELECT id FROM post_likes WHERE post_id = ? AND user_id = ?',
            [postId, userId]
        );

        if (ex.length > 0) {
            await pool.query('DELETE FROM post_likes WHERE post_id = ? AND user_id = ?', [postId, userId]);
            await pool.query('UPDATE posts SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = ?', [postId]);
            const [[p]] = await pool.query('SELECT likes_count FROM posts WHERE id = ?', [postId]);
            return res.json({ liked: false, likes: p.likes_count });
        }

        await pool.query('INSERT INTO post_likes (post_id, user_id) VALUES (?, ?)', [postId, userId]);
        await pool.query('UPDATE posts SET likes_count = likes_count + 1 WHERE id = ?', [postId]);
        const [[p]] = await pool.query('SELECT likes_count, user_id FROM posts WHERE id = ?', [postId]);

        if (p.user_id !== userId) {
            await pool.query(
                'INSERT INTO notifications (user_id, actor_id, type, entity_type, entity_id, message) VALUES (?, ?, ?, ?, ?, ?)',
                [p.user_id, userId, 'like', 'post', postId, 'liked your post']
            ).catch(() => {});
        }

        res.json({ liked: true, likes: p.likes_count });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// ── GET POST COMMENTS ─────────────────────────────────────────────
exports.getComments = async (req, res) => {
    try {
        const [comments] = await pool.query(`
            SELECT c.id, c.text, c.likes_count, c.created_at,
                   u.id AS user_id, u.username,
                   COALESCE(u.profile_pic, u.avatar_url) AS avatar,
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
        const postId   = req.params.id;
        const userId   = req.user.id;

        if (!text?.trim()) return res.status(400).json({ error: 'Comment cannot be empty' });

        const [result] = await pool.query(
            'INSERT INTO comments (post_id, user_id, text) VALUES (?, ?, ?)',
            [postId, userId, text.trim()]
        );
        await pool.query('UPDATE posts SET comments_count = comments_count + 1 WHERE id = ?', [postId]);

        const [[comment]] = await pool.query(`
            SELECT c.id, c.text, c.created_at, u.username,
                   COALESCE(u.profile_pic, u.avatar_url) AS avatar
            FROM comments c JOIN users u ON u.id = c.user_id
            WHERE c.id = ?
        `, [result.insertId]);

        res.status(201).json({ success: true, comment });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// ── GET SINGLE POST ───────────────────────────────────────────────
exports.getPost = async (req, res) => {
    try {
        const userId = req.user?.id || null;
        const [[post]] = await pool.query(`
            SELECT p.*, u.username, COALESCE(u.profile_pic, u.avatar_url) AS avatar, u.is_verified
            ${userId ? `, (SELECT COUNT(*) FROM post_likes WHERE post_id = p.id AND user_id = ${pool.escape(userId)}) AS liked_by_me` : ', 0 AS liked_by_me'}
            FROM posts p JOIN users u ON u.id = p.user_id
            WHERE p.id = ?
        `, [req.params.id]);

        if (!post) return res.status(404).json({ error: 'Post not found' });
        res.json({ post: { ...post, liked_by_me: Boolean(post.liked_by_me) } });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// ── DELETE POST ────────────────────────────────────────────────────
exports.deletePost = async (req, res) => {
    try {
        const [[post]] = await pool.query('SELECT user_id FROM posts WHERE id = ?', [req.params.id]);
        if (!post) return res.status(404).json({ error: 'Not found' });
        if (post.user_id !== req.user.id)
            return res.status(403).json({ error: 'Not authorized' });

        await pool.query('DELETE FROM posts WHERE id = ?', [req.params.id]);
        await pool.query('UPDATE users SET posts_count = GREATEST(posts_count - 1, 0) WHERE id = ?', [req.user.id]);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};
