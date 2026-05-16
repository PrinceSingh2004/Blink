/**
 * controllers/uploadController.js — Cloudinary Upload
 * ═════════════════════════════════════════════════════
 * Video upload via Cloudinary (no local storage)
 * Profile photo upload via Cloudinary
 */

const cloudinary = require('../config/cloudinary');
const streamifier = require('streamifier');
const sequelize = require('../config/db');

async function dbQuery(sql, params = []) {
    let isInsert = sql.trim().toUpperCase().startsWith('INSERT');
    if (isInsert && !sql.toUpperCase().includes('RETURNING')) {
        sql += ' RETURNING id';
    }
    try {
        const [results] = await sequelize.query(sql, { replacements: params });
        if (isInsert) {
            return [{ insertId: results && results.length > 0 ? results[0].id : null }];
        }
        return [results];
    } catch (err) {
        if (err.name === 'SequelizeUniqueConstraintError' || err.parent?.code === '23505') {
            err.code = 'ER_DUP_ENTRY';
        }
        throw err;
    }
}

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
    let uploadCompleted = false;
    let userCancelled = false;
    let cloudinaryPublicId = null;

    // Track request lifecycle
    req.on("aborted", () => {
        userCancelled = true;
        console.log("🛑 Upload request aborted by client");
    });

    res.on("finish", () => {
        uploadCompleted = true;
    });

    try {
        const userId = req.user.id;
        const { caption = '' } = req.body;

        if (!req.file) {
            return res.status(400).json({ success: false, error: "No video file provided" });
        }

        if (!userId) {
            return res.status(401).json({ success: false, error: "Unauthorized" });
        }

        console.log(`🚀 Upload request started: ${req.file.originalname} | Size: ${req.file.size}`);

        // 1. Upload to Cloudinary
        console.log("☁️ Uploading to Cloudinary...");
        const result = await uploadToCloudinary(req.file.buffer, {
            resource_type: 'video',
            folder: 'blink/videos',
            chunk_size: 6000000,
            quality: 'auto',
            fetch_format: 'auto',
            timeout: 600000 // 10 minutes
        });

        if (!result || !result.secure_url) {
            throw new Error('Cloudinary upload returned no result');
        }

        cloudinaryPublicId = result.public_id;
        console.log("✅ Cloudinary upload finished:", cloudinaryPublicId);

        // Check if user cancelled during Cloudinary upload
        if (userCancelled) {
            console.log("🧹 Cleaning up Cloudinary asset due to user cancellation...");
            if (cloudinaryPublicId) {
                await cloudinary.uploader.destroy(cloudinaryPublicId, { resource_type: 'video' });
            }
            return; // Request already aborted, no need to send response
        }

        // 2. Save to DB
        console.log("💾 Saving to database...");
        const userCol = await getColumn('videos', ['user_id', 'userId', 'creator_id']) || 'user_id';
        const urlCol = await getColumn('videos', ['video_url', 'videoUrl', 'url']) || 'video_url';
        const thumbnailUrl = result.secure_url.replace(/\.[^/.]+$/, ".jpg");

        try {
            const [dbResult] = await dbQuery(
                `INSERT INTO videos (${userCol}, ${urlCol}, thumbnail_url, caption, duration) VALUES (?, ?, ?, ?, ?)`,
                [userId, result.secure_url, thumbnailUrl, caption.trim(), Math.round(result.duration || 0)]
            );

            console.log("✅ DB save finished. Video ID:", dbResult.insertId);

            res.status(201).json({
                success: true,
                message: 'Video uploaded successfully',
                video: {
                    id: dbResult.insertId,
                    video_url: result.secure_url,
                    caption: caption.trim()
                }
            });
        } catch (dbErr) {
            console.error('🔥 DB Insert Failed. Cleaning up Cloudinary asset...', dbErr.message);
            if (cloudinaryPublicId) {
                await cloudinary.uploader.destroy(cloudinaryPublicId, { resource_type: 'video' });
            }
            throw dbErr;
        }

    } catch (err) {
        console.error('🔥 Upload Process Error:', err.message);
        // Only cleanup if we haven't finished and we have a publicId
        if (!uploadCompleted && cloudinaryPublicId) {
            console.log("🧹 Cleanup on error...");
            await cloudinary.uploader.destroy(cloudinaryPublicId, { resource_type: 'video' });
        }
        
        if (!res.headersSent) {
            res.status(500).json({ 
                success: false, 
                error: err.message || 'Server upload failed'
            });
        }
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

        await dbQuery(
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
