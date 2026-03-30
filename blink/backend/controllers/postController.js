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
        const { caption } = req.body;
        const file = req.file;

        if (!file) {
            return res.status(400).json({ error: "No video file provided" });
        }

        // 1. Upload to Cloudinary using streaming (Performance Optimized)
        const uploadToCloudinary = (buffer) => {
            return new Promise((resolve, reject) => {
                const stream = cloudinary.uploader.upload_stream(
                    {
                        resource_type: "video",
                        folder: "blink_posts",
                        format: "mp4",
                        chunk_size: 6000000, // 6MB chunks
                    },
                    (error, result) => {
                        if (error) return reject(error);
                        resolve(result);
                    }
                );
                streamifier.createReadStream(buffer).pipe(stream);
            });
        };

        const result = await uploadToCloudinary(file.buffer);

        // 2. Save Reference to MySQL
        const [insertResult] = await pool.execute(
            'INSERT INTO posts (user_id, media_url, caption) VALUES (?, ?, ?)',
            [req.user.id, result.secure_url, caption || '']
        );

        res.status(201).json({ 
            success: true, 
            message: "Moment posted successfully!",
            video: {
                id: insertResult.insertId,
                url: result.secure_url,
                caption
            }
        });

    } catch (err) {
        console.error('[Upload Error]:', err);
        res.status(500).json({ error: "Failed to upload video: " + err.message });
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
