const db   = require('../config/db');
const path = require('path');
const fs   = require('fs');
const cloudinary = require('cloudinary').v2;

cloudinary.config({
    cloud_name: process.env.CLOUD_NAME,
    api_key: process.env.API_KEY,
    api_secret: process.env.API_SECRET
});

function fmtNum(n) {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K';
    return String(n || 0);
}

// ─── GET FEED (infinite scroll) ───────────────────────────────
exports.getFeed = async (req, res) => {
    try {
        const limit   = Math.min(parseInt(req.query.limit) || 10, 20);
        const exclude = req.query.exclude || '';
        const mood    = req.query.mood    || null;
        const cycled  = req.query.cycled  || '';  // Client signals it already cycled

        const excludeIds = exclude
            ? exclude.split(',').map(Number).filter(n => !isNaN(n) && n > 0)
            : [];

        let where  = ['v.video_url IS NOT NULL'];
        let params = [];

        if (mood && mood !== 'General') { where.push('v.mood_category = ?'); params.push(mood); }
        if (excludeIds.length > 0) {
            where.push(`v.id NOT IN (${excludeIds.map(() => '?').join(',')})`);
            params.push(...excludeIds);
        }

        const whereSQL = 'WHERE ' + where.join(' AND ');

        // If no unseen videos, cycle back (only if client hasn't already cycled)
        const [[{ cnt }]] = await db.query(`SELECT COUNT(*) AS cnt FROM videos v ${whereSQL}`, params);
        let sql, finalParams;
        if (cnt === 0 && cycled) {
            // Client already cycled — return empty to prevent infinite loop
            return res.json({ videos: [], total: 0 });
        } else if (cnt === 0) {
            sql         = `SELECT v.*, u.username, u.profile_photo FROM videos v LEFT JOIN users u ON v.user_id = u.id ORDER BY RAND() LIMIT ?`;
            finalParams = [limit];
        } else {
            sql         = `SELECT v.*, u.username, u.profile_photo FROM videos v LEFT JOIN users u ON v.user_id = u.id ${whereSQL} ORDER BY RAND() LIMIT ?`;
            finalParams = [...params, limit];
        }

        const [videos] = await db.query(sql, finalParams);

        // Check which ones current user liked
        let likedSet = new Set();
        if (req.user) {
            const [liked] = await db.query(
                'SELECT video_id FROM video_likes WHERE user_id = ?',
                [req.user.id]
            );
            liked.forEach(r => likedSet.add(r.video_id));
        }

        const enriched = videos.map(v => ({
            ...v,
            videoUrl: v.video_url, // Added to strictly match user request format if needed
            liked_by_me: likedSet.has(v.id),
            likes_formatted:    fmtNum(v.likes_count),
            comments_formatted: fmtNum(v.comments_count),
            shares_formatted:   fmtNum(v.shares_count),
            avatar: v.profile_photo || null
        }));

        res.json({ videos: enriched, total: enriched.length });
    } catch (err) {
        console.error('[Videos] getFeed:', err.message);
        res.status(500).json({ error: 'Failed to fetch videos', detail: err.message });
    }
};

// ─── GET SINGLE VIDEO ─────────────────────────────────────────
exports.getVideo = async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT v.*, u.username, u.profile_photo, u.followers_count
             FROM videos v LEFT JOIN users u ON v.user_id = u.id WHERE v.id = ?`,
            [req.params.id]
        );
        if (!rows.length) return res.status(404).json({ error: 'Video not found' });
        res.json({ video: rows[0] });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
};

// ─── GET USER'S VIDEOS ────────────────────────────────────────
exports.getUserVideos = async (req, res) => {
    try {
        const [videos] = await db.query(
            `SELECT v.*, u.username, u.profile_photo FROM videos v
             LEFT JOIN users u ON v.user_id = u.id
             WHERE v.user_id = ? ORDER BY v.created_at DESC`,
            [req.params.userId]
        );
        res.json({ videos });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
};

// ─── UPLOAD VIDEO ─────────────────────────────────────────────
exports.uploadVideo = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No video file provided' });

        const { caption = '', mood_category = 'General' } = req.body;
        
        console.log('[Videos] Uploading to Cloudinary...');
        
        // Upload to Cloudinary with eager transformations
        const cloudResult = await cloudinary.uploader.upload(req.file.path, {
            resource_type: "video",
            folder: "blink_reels"
        });
        
        // ⚡ PERFORMANCE OPTIMIZATION: CDN Delivery
        // Inject q_auto (auto quality) and f_auto (auto format) for instantly optimized streaming
        const optimizedUrl = cloudResult.secure_url.replace('/upload/', '/upload/q_auto,f_auto/');
        const thumbnailUrl = optimizedUrl.replace('.mp4', '.jpg').replace('.webm', '.jpg'); // Auto-generated thumbnail

        console.log('[Videos] Cloudinary upload successful:', optimizedUrl);

        // Delete local temporary file
        try {
            if (fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }
        } catch (cleanupErr) {
            console.warn('[Videos] Failed to cleanup local file:', cleanupErr.message);
        }

        const videoUrl = optimizedUrl;

        const [result] = await db.query(
            `INSERT INTO videos (user_id, video_url, caption, mood_category) VALUES (?, ?, ?, ?)`,
            [req.user.id, videoUrl, caption.trim(), mood_category]
        );

        res.status(201).json({
            message: 'Video uploaded successfully',
            video: { id: result.insertId, videoUrl, video_url: videoUrl, caption, mood_category }
        });
    } catch (err) {
        console.error('[Videos] upload error:', err);
        // Clean up local file on failure
        if (req.file && fs.existsSync(req.file.path)) {
            try { fs.unlinkSync(req.file.path); } catch (e) {}
        }
        res.status(500).json({ error: 'Failed to upload video to Cloud' });
    }
};

// ─── TOGGLE LIKE ──────────────────────────────────────────────
exports.toggleLike = async (req, res) => {
    try {
        const videoId = req.params.id;
        const userId  = req.user.id;

        const [[existing]] = await db.query(
            'SELECT id FROM video_likes WHERE video_id = ? AND user_id = ?',
            [videoId, userId]
        );

        if (existing) {
            await db.query('DELETE FROM video_likes WHERE video_id = ? AND user_id = ?', [videoId, userId]);
            await db.query('UPDATE videos SET likes_count = GREATEST(0, likes_count - 1) WHERE id = ?', [videoId]);
            // Update total likes on user
            const [[vid]] = await db.query('SELECT user_id FROM videos WHERE id = ?', [videoId]);
            if (vid) await db.query('UPDATE users SET total_likes = GREATEST(0, total_likes - 1) WHERE id = ?', [vid.user_id]);

            const [[v]] = await db.query('SELECT likes_count FROM videos WHERE id = ?', [videoId]);
            return res.json({ liked: false, likes_count: v.likes_count });
        } else {
            await db.query('INSERT INTO video_likes (video_id, user_id) VALUES (?, ?)', [videoId, userId]);
            await db.query('UPDATE videos SET likes_count = likes_count + 1 WHERE id = ?', [videoId]);
            const [[vid]] = await db.query('SELECT user_id FROM videos WHERE id = ?', [videoId]);
            if (vid) await db.query('UPDATE users SET total_likes = total_likes + 1 WHERE id = ?', [vid.user_id]);

            const [[v]] = await db.query('SELECT likes_count FROM videos WHERE id = ?', [videoId]);
            return res.json({ liked: true, likes_count: v.likes_count });
        }
    } catch (err) {
        console.error('[Videos] toggleLike:', err.message);
        res.status(500).json({ error: 'Failed to toggle like' });
    }
};

// ─── INCREMENT SHARE ──────────────────────────────────────────
exports.incrementShare = async (req, res) => {
    try {
        await db.query('UPDATE videos SET shares_count = shares_count + 1 WHERE id = ?', [req.params.id]);
        const [[v]] = await db.query('SELECT shares_count FROM videos WHERE id = ?', [req.params.id]);
        res.json({ shares_count: v?.shares_count || 0 });
    } catch {
        res.status(500).json({ error: 'Server error' });
    }
};

// ─── DELETE VIDEO ─────────────────────────────────────────────
exports.deleteVideo = async (req, res) => {
    try {
        const [[video]] = await db.query('SELECT * FROM videos WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
        if (!video) return res.status(404).json({ error: 'Video not found or not yours' });

        // Delete file from disk
        if (video.video_url) {
            const filePath = path.join(__dirname, '../', video.video_url);
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }

        await db.query('DELETE FROM videos WHERE id = ?', [req.params.id]);
        res.json({ message: 'Video deleted' });
    } catch (err) {
        console.error('[Videos] delete:', err.message);
        res.status(500).json({ error: 'Failed to delete video' });
    }
};
