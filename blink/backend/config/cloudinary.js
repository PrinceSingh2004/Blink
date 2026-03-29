/**
 * config/cloudinary.js – Cloudinary v2 Config
 * Includes f_auto, q_auto optimizations for production reels.
 */

const cloudinary = require('cloudinary').v2;
require('dotenv').config();

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key:    process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

/**
 * Optimized Upload Options for Reels
 */
const reelUploadOptions = {
    folder: 'blink/reels',
    resource_type: 'video',
    chunk_size: 6000000, // 6MB
    eager: [
        { width: 720, height: 1280, crop: 'pad', format: 'mp4', audio_codec: 'aac', video_codec: 'h264' }
    ],
    eager_async: true,
    // Note: f_auto and q_auto are best set at the retrieval URL 
    // but can be enforced here if transforming during upload.
};

module.exports = {
    cloudinary,
    reelUploadOptions
};
