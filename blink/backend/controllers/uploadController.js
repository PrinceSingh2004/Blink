/**
 * controllers/uploadController.js — Cloudinary Upload
 * ═════════════════════════════════════════════════════
 * Video upload via Cloudinary (no local storage)
 * Profile photo upload via Cloudinary
 */

const cloudinary = require('../config/cloudinary');
const streamifier = require('streamifier');
const { pool } = require('../config/db');
const { getColumn } = require('../utils/columnMapper');

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
 * POST /api/upload/video — Upload video with stability fixes
 */
exports.uploadVideo = async (req, res) => {
    try {
        const userId = req.user.id;
        const { caption = '' } = req.body;

        if (!req.file) {
            return res.status(400).json({ success: false, error: "No video file provided" });
        }

        if (!userId) {
            return res.status(401).json({ success: false, error: "Unauthorized" });
        }

        console.log(`🚀 Uploading: ${req.file.originalname} | Size: ${req.file.size}`);

        // 1. Upload to Cloudinary (using streamifier for memory storage)
        const result = await uploadToCloudinary(req.file.buffer, {
            resource_type: 'video',
            folder: 'blink/videos',
            timeout: 300000 // 5 min timeout for slow networks
        });

        if (!result || !result.secure_url) {
            throw new Error('Cloudinary upload returned no URL');
        }

        // 2. Insert into DB (Dynamic column detection)
        const userCol = await getColumn('videos', ['user_id', 'userId', 'creator_id']) || 'user_id';
        const urlCol = await getColumn('videos', ['video_url', 'videoUrl', 'url']) || 'video_url';

        const [dbResult] = await pool.query(
            `INSERT INTO videos (${userCol}, ${urlCol}, caption, duration) VALUES (?, ?, ?, ?)`,
            [userId, result.secure_url, caption.trim(), Math.round(result.duration || 0)]
        );

        res.status(201).json({
            success: true,
            message: 'Video uploaded successfully',
            video: {
                id: dbResult.insertId,
                video_url: result.secure_url,
                caption: caption.trim()
            }
        });

    } catch (err) {
        console.error('🔥 Upload Error:', err.message);
        res.status(500).json({ 
            success: false, 
            error: err.message || 'Server upload failed'
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
