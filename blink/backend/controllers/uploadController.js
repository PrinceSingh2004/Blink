/**
 * controllers/uploadController.js
 * ═══════════════════════════════════════════════════════════════════════════════
 * Video Upload with Compression + Profile Photo Upload
 * ═══════════════════════════════════════════════════════════════════════════════
 */

const { v2: cloudinary } = require('cloudinary');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const fs = require('fs');
const path = require('path');
const pool = require('../config/db');

// Configure ffmpeg
ffmpeg.setFfmpegPath(ffmpegStatic);

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Directories
const tempDir = path.join(__dirname, '../temp');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * VIDEO UPLOAD WITH CLOUDINARY COMPRESSION
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Process:
 * 1. Save base64 video to temp file
 * 2. Compress with ffmpeg (reduce bitrate, resolution)
 * 3. Upload to Cloudinary
 * 4. Generate thumbnail
 * 5. Save metadata to database
 * 6. Cleanup temp files
 */
exports.uploadVideo = async (req, res) => {
    let tempFile = null;
    let compressedFile = null;

    try {
        const { video, caption = '', hashtags = '', mood_category = 'General' } = req.body;
        const userId = req.user.id;

        if (!video || !video.startsWith('data:video')) {
            return res.status(400).json({ error: 'Invalid video format' });
        }

        if (!caption.trim()) {
            return res.status(400).json({ error: 'Caption is required' });
        }

        // Step 1: Convert base64 to buffer
        const base64Data = video.replace(/^data:video\/\w+;base64,/, '');
        const videoBuffer = Buffer.from(base64Data, 'base64');

        // Step 2: Save to temp file
        tempFile = path.join(tempDir, `video_${userId}_${Date.now()}.mp4`);
        fs.writeFileSync(tempFile, videoBuffer);

        // Step 3: Compress video with ffmpeg
        compressedFile = path.join(tempDir, `compressed_${userId}_${Date.now()}.mp4`);

        await new Promise((resolve, reject) => {
            ffmpeg(tempFile)
                .output(compressedFile)
                .videoCodec('libx264')
                .audioCodec('aac')
                .videoBitrate('2000k')
                .audioBitrate('128k')
                .videoFilter('scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2')
                .format('mp4')
                .on('error', reject)
                .on('end', resolve)
                .run();
        });

        // Step 4: Upload to Cloudinary
        const uploadResult = await new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
                {
                    resource_type: 'video',
                    folder: 'blink/reels',
                    public_id: `reel_${userId}_${Date.now()}`,
                    quality: 'auto',
                    fetch_format: 'mp4',
                    eager: [
                        { width: 400, height: 711, crop: 'fill', format: 'jpg', quality: 'auto' }
                    ]
                },
                (error, result) => {
                    if (error) reject(error);
                    else resolve(result);
                }
            );

            const compressedStream = fs.createReadStream(compressedFile);
            compressedStream.pipe(stream);
        });

        const videoUrl = uploadResult.secure_url;
        const thumbnailUrl = uploadResult.eager?.[0]?.secure_url || null;
        const duration = uploadResult.duration || 0;

        // Step 5: Save to database
        const [result] = await pool.query(
            `INSERT INTO videos (user_id, video_url, thumbnail_url, caption, hashtags, mood_category, duration)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [userId, videoUrl, thumbnailUrl, caption, hashtags, mood_category, Math.round(duration)]
        );

        // Update user posts count
        await pool.query('UPDATE users SET posts_count = posts_count + 1 WHERE id = ?', [userId]);

        // Step 6: Cleanup
        try {
            if (tempFile && fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
            if (compressedFile && fs.existsSync(compressedFile)) fs.unlinkSync(compressedFile);
        } catch (e) {
            console.warn('Cleanup warning:', e.message);
        }

        res.status(201).json({
            success: true,
            message: 'Video uploaded successfully',
            video: {
                id: result.insertId,
                video_url: videoUrl,
                thumbnail_url: thumbnailUrl,
                caption,
                hashtags,
                mood_category,
                duration
            }
        });

    } catch (error) {
        console.error('❌ Video upload error:', error.message);

        // Cleanup on error
        try {
            if (tempFile && fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
            if (compressedFile && fs.existsSync(compressedFile)) fs.unlinkSync(compressedFile);
        } catch (e) {
            console.warn('Cleanup error:', e.message);
        }

        res.status(500).json({
            error: 'Video upload failed',
            message: error.message
        });
    }
};

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * PROFILE PHOTO UPLOAD
 * ═══════════════════════════════════════════════════════════════════════════════
 */
exports.uploadProfilePhoto = async (req, res) => {
    try {
        const { image } = req.body;
        const userId = req.user.id;

        if (!image || !image.startsWith('data:image')) {
            return res.status(400).json({ error: 'Invalid image format' });
        }

        // Convert base64 to buffer
        const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
        const imageBuffer = Buffer.from(base64Data, 'base64');

        // Upload to Cloudinary
        const result = await new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
                {
                    resource_type: 'image',
                    folder: 'blink/avatars',
                    public_id: `avatar_${userId}`,
                    width: 300,
                    height: 300,
                    crop: 'fill',
                    quality: 'auto',
                    fetch_format: 'auto'
                },
                (error, result) => {
                    if (error) reject(error);
                    else resolve(result);
                }
            );

            stream.end(imageBuffer);
        });

        const photoUrl = result.secure_url;

        // Save to database
        await pool.query(
            'UPDATE users SET profile_pic = ? WHERE id = ?',
            [photoUrl, userId]
        );

        res.json({
            success: true,
            message: 'Profile photo updated',
            profile_pic: photoUrl
        });

    } catch (error) {
        console.error('❌ Profile photo upload error:', error.message);
        res.status(500).json({
            error: 'Profile photo upload failed',
            message: error.message
        });
    }
};

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * COVER PHOTO UPLOAD
 * ═══════════════════════════════════════════════════════════════════════════════
 */
exports.uploadCoverPhoto = async (req, res) => {
    try {
        const { image } = req.body;
        const userId = req.user.id;

        if (!image || !image.startsWith('data:image')) {
            return res.status(400).json({ error: 'Invalid image format' });
        }

        const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
        const imageBuffer = Buffer.from(base64Data, 'base64');

        const result = await new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
                {
                    resource_type: 'image',
                    folder: 'blink/covers',
                    public_id: `cover_${userId}`,
                    width: 1200,
                    height: 400,
                    crop: 'fill',
                    quality: 'auto',
                    fetch_format: 'auto'
                },
                (error, result) => {
                    if (error) reject(error);
                    else resolve(result);
                }
            );

            stream.end(imageBuffer);
        });

        const coverUrl = result.secure_url;

        await pool.query(
            'UPDATE users SET cover_pic = ? WHERE id = ?',
            [coverUrl, userId]
        );

        res.json({
            success: true,
            message: 'Cover photo updated',
            cover_pic: coverUrl
        });

    } catch (error) {
        console.error('❌ Cover photo upload error:', error.message);
        res.status(500).json({
            error: 'Cover photo upload failed',
            message: error.message
        });
    }
};

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * GET CLOUDINARY UPLOAD SIGNATURE
 * For frontend direct uploads (optional optimization)
 * ═══════════════════════════════════════════════════════════════════════════════
 */
exports.getUploadSignature = (req, res) => {
    try {
        const timestamp = Math.floor(Date.now() / 1000);
        const signature = cloudinary.utils.api_sign_request(
            { timestamp },
            process.env.CLOUDINARY_API_SECRET
        );

        res.json({
            timestamp,
            signature,
            cloudName: process.env.CLOUDINARY_NAME,
            apiKey: process.env.CLOUDINARY_API_KEY
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
