/**
 * middleware/upload.js — Multer Memory Storage for Cloudinary
 * ═══════════════════════════════════════════════════════════
 * Uses memory storage — files go straight to buffer, then Cloudinary.
 * No local disk storage needed.
 */

const multer = require('multer');

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
    const allowedVideo = ['video/mp4', 'video/webm', 'video/quicktime'];
    const allowedImage = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

    if ([...allowedVideo, ...allowedImage].includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Invalid file type. Supported: MP4, WebM, MOV, JPG, PNG, WebP, GIF'), false);
    }
};

const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 100 * 1024 * 1024 } // 100MB
});

module.exports = { upload };
