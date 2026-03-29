/**
 * controllers/postController.js – Blink Unified Content Controller v4.0
 * Handles: Multer -> FFmpeg (Compression) -> Cloudinary (Storage) -> MySQL (Meta)
 */

const pool = require('../db/config');
const { v2: cloudinary } = require('cloudinary');
const { compressVideo } = require('../utils/compression');
const fs = require('fs');
const path = require('path');

/**
 * Unified Upload: Handles both Images and Videos (Reels)
 */
exports.createPost = async (req, res) => {
    const { user_id, caption } = req.body;
    let inputPath = req.file?.path;
    let outputPath = null;

    if (!req.file) return res.status(400).json({ error: 'No media file provided.' });

    try {
        console.log(`🎬 Processing new post for user ${user_id}...`);
        
        // ── 1. COMPRESSION PIPELINE (FFmpeg) ───────────────────────
        if (req.file.mimetype.startsWith('video')) {
            outputPath = path.join(__dirname, '../temp', `compressed_${Date.now()}.mp4`);
            await compressVideo(inputPath, outputPath);
            inputPath = outputPath; // Point to compressed file for Cloudinary
        }

        // ── 2. CLOUDINARY UPLOAD ───────────────────────────────────
        const isVideo = req.file.mimetype.startsWith('video');
        const uploadResult = await cloudinary.uploader.upload(inputPath, {
            folder:        'blink_posts',
            resource_type: isVideo ? 'video' : 'image',
            eager:         isVideo ? [{ format: 'mp4', transformation: [{ width: 720, crop: 'scale' }] }] : [],
            access_mode:   'public'
        });

        // ── 3. STORE IN DATABASE ────────────────────────────────────
        const secureUrl = uploadResult.secure_url;
        const type      = isVideo ? 'video' : 'image';

        const [dbResult] = await pool.execute(
            `INSERT INTO posts (user_id, media_url, media_type, caption, created_at)
             VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            [user_id, secureUrl, type, caption || '']
        );

        // Atomic Profile Update
        await pool.execute('UPDATE users SET posts_count = posts_count + 1 WHERE id = ?', [user_id]);

        // ── 4. CLEANUP ──────────────────────────────────────────────
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        if (outputPath && fs.existsSync(outputPath)) fs.unlinkSync(outputPath);

        res.status(201).json({ 
            success: true, 
            message: 'Post published successfully.', 
            postId: dbResult.insertId,
            url: secureUrl 
        });

    } catch (err) {
        console.error('❌ Upload Pipeline Error:', err);
        // Cleanup on failure
        if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        if (outputPath && fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        res.status(500).json({ error: 'System processing failed: ' + err.message });
    }
};

/**
 * Global Feed: Fetch optimized media for infinite scroll
 */
exports.getFeed = async (req, res) => {
    try {
        const [posts] = await pool.query(`
            SELECT p.*, u.username, 
                   COALESCE(u.profile_pic, u.avatar_url) AS avatar,
                   u.is_verified
            FROM posts p
            JOIN users u ON p.user_id = u.id
            ORDER BY p.created_at DESC
            LIMIT 20
        `);

        // Transform Cloudinary URLs for performance (f_auto, q_auto)
        const optimizedPosts = posts.map(p => ({
            ...p,
            media_url: p.media_url.replace('/upload/', '/upload/f_auto,q_auto/')
        }));

        res.json({ success: true, posts: optimizedPosts });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
