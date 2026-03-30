const pool = require('../config/db');
const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');

/**
 * @route   POST /api/posts
 * @desc    Upload video to Cloudinary and save to MySQL
 * @access  Private
 */
exports.createPost = async (req, res) => {
    try {
        console.log("File received:", req.file ? req.file.originalname : 'None');
        const { caption } = req.body;

        if (!req.file) {
            return res.status(400).json({ success: false, error: "No video file provided" });
        }

        // ── TASK 1: Robust Stream Upload ────────────────────────── (Step Fix)
        const streamUpload = (buffer) => {
            return new Promise((resolve, reject) => {
                const stream = cloudinary.uploader.upload_stream(
                    {
                        resource_type: "video",
                        folder: "blink_posts",
                        format: "mp4",
                        chunk_size: 6000000, 
                    },
                    (error, result) => {
                        if (result) resolve(result);
                        else reject(error);
                    }
                );
                streamifier.createReadStream(buffer).pipe(stream);
            });
        };

        const result = await streamUpload(req.file.buffer);
        console.log("Cloudinary Upload Success:", result.secure_url);

        // ── PERSISTENCE (Step 5) ──────────────────────────────────
        // 1. Insert into main posts table for the feed
        await pool.execute(
            'INSERT INTO posts (user_id, media_url, caption) VALUES (?, ?, ?)',
            [req.user.id, result.secure_url, caption || '']
        );

        // 2. Insert into videos table (Task 1: Fix Full Data)
        await pool.execute(
            'INSERT INTO videos (url, user_id, created_at) VALUES (?, ?, NOW())',
            [result.secure_url, req.user.id]
        );
        console.log("Database persistent (Task 8):", result.secure_url);

        return res.status(200).json({
            success: true,
            url: result.secure_url,
            message: "Upload successful!"
        });

    } catch (err) {
        console.error("UPLOAD ERROR:", err);
        return res.status(500).json({ success: false, error: err.message || "Upload failed" });
    }
};

exports.getPosts = async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT p.*, u.username, u.profile_pic FROM posts p JOIN users u ON p.user_id = u.id ORDER BY p.created_at DESC'
        );
        res.json({ success: true, posts: rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
