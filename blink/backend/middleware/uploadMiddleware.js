/**
 * backend/middleware/uploadMiddleware.js
 * ═══════════════════════════════════════════════════════════
 * Professional Cloud Storage Engine (Cloudinary Primary)
 * ═══════════════════════════════════════════════════════════
 * Handles: Auto-upload to Cloudinary, categorization, 
 * and persistent URL generation for Render/Railway.
 * ═══════════════════════════════════════════════════════════
 */

const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');
const path   = require('path');
require('dotenv').config();

// 1. Cloudinary Setup (Zero Hardcoding)
// Expects: CLOUDINARY_URL=cloudinary://key:secret@name in .env
cloudinary.config({
    cloudinary_url: process.env.CLOUDINARY_URL
});

// 2. Storage Orchestration
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: async (req, file) => {
        let folder = 'blink_misc';
        if (req.originalUrl.includes('avatar')) folder = 'blink_avatars';
        if (req.originalUrl.includes('story'))  folder = 'blink_stories';
        if (req.originalUrl.includes('reels') || req.originalUrl.includes('video')) folder = 'blink_reels';
        
        return {
            folder: folder,
            resource_type: 'auto', // Support both images and videos
            public_id: file.fieldname + '-' + Date.now(),
            format: path.extname(file.originalname).substring(1) || 'jpg'
        };
    }
});

const upload = multer({ 
    storage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB Max (Reels Optimization)
    fileFilter: (req, file, cb) => {
        const allowed = /jpeg|jpg|png|gif|mp4|mov|avi|wmv/;
        if (allowed.test(path.extname(file.originalname).toLowerCase()) || allowed.test(file.mimetype)) {
            return cb(null, true);
        }
        cb(new Error('Invalid asset type. Blink supports images and videos only.'));
    }
});

module.exports = upload;
