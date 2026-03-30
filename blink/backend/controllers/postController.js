/**
 * controllers/postController.js – Blink Unified Content Controller v4.5
 * ═══════════════════════════════════════════════════════════════════════════════
 * Unified handling for: Feed, Uploads, Likes, Comments, Deletion
 * ═══════════════════════════════════════════════════════════════════════════════
 */

// USE THE NEW pool CONFIG
const pool = require('../config/db');
const { cloudinary } = require('../config/cloudinary');

// ════════════════════════════════════════════════════════════════════════════════
// CREATE POST (Unified Upload for Images and Videos)
// ════════════════════════════════════════════════════════════════════════════════
exports.createPost = async (req, res) => {
    try {
        const { caption } = req.body;
        const userId = req.user?.id || req.body.user_id;

        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No media file provided.' });
        }

        if (!userId) {
            return res.status(401).json({ success: false, message: 'User not authenticated.' });
        }

        const isVideo = req.file.mimetype.startsWith('video');

        // Cloudinary Upload
        const uploadResult = await cloudinary.uploader.upload(req.file.path, {
            folder: 'blink_content',
            resource_type: isVideo ? 'video' : 'image',
            transformation: isVideo ? [{ width: 720, crop: 'scale' }] : []
        });

        const [dbResult] = await pool.execute(
            `INSERT INTO posts (user_id, media_url, media_type, caption) VALUES (?, ?, ?, ?)`,
            [userId, uploadResult.secure_url, isVideo ? 'video' : 'image', caption || '']
        );

        // Update posts_count on user profile (Atomic)
        await pool.execute('UPDATE users SET posts_count = posts_count + 1 WHERE id = ?', [userId]);

        res.status(201).json({
            success: true,
            message: 'Post created successfully',
            postId: dbResult.insertId,
            url: uploadResult.secure_url
        });
    } catch (err) {
        console.error('❌ Post Controller Error:', err);
        res.status(500).json({ success: false, message: 'Internal Server Error', error: err.message });
    }
};

// ════════════════════════════════════════════════════════════════════════════════
// GET GLOBAL FEED
// ════════════════════════════════════════════════════════════════════════════════
exports.getFeed = async (req, res) => {
    try {
        const [posts] = await pool.query(`
            SELECT p.*, u.username, 
                   COALESCE(u.profile_pic, u.avatar_url, u.profile_photo) AS avatar,
                   u.is_verified
            FROM posts p
            JOIN users u ON p.user_id = u.id
            ORDER BY p.created_at DESC
            LIMIT 20
        `);
        res.json({ success: true, posts });
    } catch (err) {
        console.error('❌ Feed Fetch Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};

// ════════════════════════════════════════════════════════════════════════════════
// LIKE/UNLIKE LOGIC (Based on 'likes' table in schema)
// ════════════════════════════════════════════════════════════════════════════════
exports.likePost = async (req, res) => {
    try {
        const { postId } = req.params;
        const userId = req.user.id;
        
        // Use INSERT IGNORE to prevent duplicate likes error
        await pool.execute('INSERT IGNORE INTO likes (post_id, user_id) VALUES (?, ?)', [postId, userId]);
        await pool.execute('UPDATE posts SET likes_count = likes_count + 1 WHERE id = ?', [postId]);
        
        res.json({ success: true, message: 'Post liked' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.unlikePost = async (req, res) => {
    try {
        const { postId } = req.params;
        const userId = req.user.id;
        
        const [result] = await pool.execute('DELETE FROM likes WHERE post_id = ? AND user_id = ?', [postId, userId]);
        
        if (result.affectedRows > 0) {
            await pool.execute('UPDATE posts SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = ?', [postId]);
        }
        
        res.json({ success: true, message: 'Post unliked' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// ════════════════════════════════════════════════════════════════════════════════
// COMMENTS
// ════════════════════════════════════════════════════════════════════════════════
exports.addComment = async (req, res) => {
    try {
        const { postId } = req.params;
        const { text } = req.body;
        const userId = req.user.id;

        if (!text || !text.trim()) {
            return res.status(400).json({ success: false, message: 'Comment text is required' });
        }
        
        // Note: Assuming 'comments' table exists based on controller usage
        const [result] = await pool.execute(
            'INSERT INTO comments (post_id, user_id, text) VALUES (?, ?, ?)',
            [postId, userId, text]
        );

        await pool.execute('UPDATE posts SET comments_count = comments_count + 1 WHERE id = ?', [postId]);
        
        res.status(201).json({ success: true, commentId: result.insertId });
    } catch (err) {
        console.error('❌ Add Comment Error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.getComments = async (req, res) => {
    try {
        const { postId } = req.params;
        const [comments] = await pool.query(
            'SELECT c.*, u.username, u.profile_pic FROM comments c JOIN users u ON c.user_id = u.id WHERE post_id = ? ORDER BY c.created_at ASC',
            [postId]
        );
        res.json({ success: true, comments });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// ════════════════════════════════════════════════════════════════════════════════
// ADDITIONAL REQUIRED EXPORTS FOR COMPATIBILITY
// ════════════════════════════════════════════════════════════════════════════════
exports.getUserVideos = async (req, res) => {
    try {
        const { username } = req.params;
        const [posts] = await pool.query(`
            SELECT p.* FROM posts p 
            JOIN users u ON p.user_id = u.id 
            WHERE u.username = ? AND media_type = 'video'
            ORDER BY p.created_at DESC
        `, [username]);
        res.json({ success: true, posts });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.deletePost = async (req, res) => {
    try {
        const postId = req.params.postId || req.params.id;
        const userId = req.user.id;
        
        const [result] = await pool.execute('DELETE FROM posts WHERE id = ? AND user_id = ?', [postId, userId]);
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Post not found or unauthorized' });
        }

        // Atomic Profile Update
        await pool.execute('UPDATE users SET posts_count = GREATEST(posts_count - 1, 0) WHERE id = ?', [userId]);

        res.json({ success: true, message: 'Post deleted' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// ALIASES (Fixes 'undefined' errors in postRoutes.js)
// ═══════════════════════════════════════════════════════════════════════════════
exports.uploadVideo = exports.createPost;
exports.deleteVideo = exports.deletePost;
exports.likeVideo   = exports.likePost;
exports.unlikeVideo = exports.unlikePost;
exports.toggleLike  = exports.likePost; // Alias for compatibility
exports.postComment = exports.addComment; // Alias for compatibility
