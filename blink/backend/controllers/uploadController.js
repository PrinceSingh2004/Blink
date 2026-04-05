/**
 * controllers/uploadController.js — Cloudinary Upload
 * ═════════════════════════════════════════════════════
 * Video upload via Cloudinary (no local storage)
 * Profile photo upload via Cloudinary
 */

const cloudinary = require('../config/cloudinary');
const streamifier = require('streamifier');
const { pool } = require('../config/db');

/**
 * Helper: Upload buffer to Cloudinary via stream
 */
const uploadToCloudinary = (buffer, options) => {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
            if (error) reject(error);
            else resolve(result);
        });
        streamifier.createReadStream(buffer).pipe(stream);
    });
};

/**
 * POST /api/upload/video — Upload video to Cloudinary
 */
exports.uploadVideo = async (req, res) => {
    try {
        const userId = req.user.id;
        const { caption = '', hashtags = '' } = req.body;

        if (!req.file) {
            return res.status(400).json({ error: 'No video file provided' });
        }

        // Upload to Cloudinary with async support for large files
        const result = await uploadToCloudinary(req.file.buffer, {
            resource_type: 'video',
            folder: 'blink/videos',
            public_id: `vid_${userId}_${Date.now()}`,
            quality: 'auto',
            format: 'mp4',
            eager: [
                { quality: "auto", fetch_format: "mp4" }
            ],
            eager_async: true
        });

        console.log('☁️ Cloudinary result:', result.secure_url);

        // Verify URL: Use secure_url or fallback to eager[0]
        const videoUrl = result.secure_url || (result.eager && result.eager[0]?.secure_url);
        
        if (!videoUrl) {
            throw new Error('Could not generate a valid video URL from Cloudinary');
        }

        const duration = Math.round(result.duration || 0);

        // Save to database - Fix: user_id INT, video_url TEXT
        const [dbResult] = await pool.query(
            `INSERT INTO videos (user_id, video_url, caption, hashtags, duration)
             VALUES (?, ?, ?, ?, ?)`,
            [userId, videoUrl, caption.trim(), hashtags.trim(), duration]
        );

        console.log('✅ Video saved to DB:', dbResult.insertId);

        res.status(201).json({
            success: true,
            message: 'Video uploaded successfully',
            video: {
                id: dbResult.insertId,
                videoUrl: videoUrl,
                caption: caption.trim(),
                duration
            }
        });

    } catch (err) {
        console.error('🔥 UPLOAD FAILED:', err.message);
        // Failsafe: Do not crash server, return 500
        res.status(500).json({ 
            success: false, 
            error: 'Video upload failed', 
            details: err.message 
        });
    }
};

/**
 * POST /api/upload/profile-photo — Upload profile photo
 * Accepts multipart/form-data with field "photo"
 */
exports.uploadProfilePhoto = async (req, res) => {
    try {
        const userId = req.user.id;

        if (!req.file) {
            return res.status(400).json({ error: 'No image file provided' });
        }

        const result = await uploadToCloudinary(req.file.buffer, {
            resource_type: 'image',
            folder: 'blink/avatars',
            public_id: `avatar_${userId}`,
            width: 300,
            height: 300,
            crop: 'fill',
            quality: 'auto',
            format: 'webp',
            overwrite: true
        });

        const photoUrl = result.secure_url;

        await pool.query(
            'UPDATE users SET profile_photo = ? WHERE id = ?',
            [photoUrl, userId]
        );

        res.json({
            success: true,
            message: 'Profile photo updated',
            profile_photo: photoUrl
        });

    } catch (err) {
        console.error('Profile photo error:', err.message);
        res.status(500).json({ error: 'Profile photo upload failed' });
    }
};
