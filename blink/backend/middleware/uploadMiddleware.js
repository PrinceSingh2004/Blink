const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// ── Cloudinary Config ─────────────────────────────────────────
// Using the exact keys from the provided .env: CLOUD_NAME, API_KEY, API_SECRET
cloudinary.config({
    cloud_name: process.env.CLOUD_NAME,
    api_key: process.env.API_KEY,      // Consistent with .env
    api_secret: process.env.API_SECRET  // Consistent with .env
});

const videoDir = path.join(__dirname, '../uploads/videos');

if (!fs.existsSync(videoDir)) fs.mkdirSync(videoDir, { recursive: true });

// ── Video Storage (Local for now, can be Cloudinary later)
const videoStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, videoDir),
    filename: (req, file, cb) => {
        const unique = `${Date.now()}_${Math.round(Math.random() * 1e9)}`;
        cb(null, `${unique}${path.extname(file.originalname).toLowerCase()}`);
    }
});

const videoFilter = (req, file, cb) => {
    const allowed = ['video/mp4', 'video/quicktime', 'video/webm'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only video files are allowed (mp4, mov)'), false);
};

// ── Cloudinary Profile Image Storage ──────────────────────────
const profileStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'blink_profile',
        allowed_formats: ['jpg', 'png', 'jpeg', 'webp'],
        transformation: [{ width: 400, height: 400, crop: 'limit' }]
    }
});

// ── Exports ───────────────────────────────────────────────────
module.exports.uploadVideo = multer({
    storage: videoStorage,
    fileFilter: videoFilter,
    limits: { fileSize: 1024 * 1024 * 1024 } // 1GB limit
}).single('video');

module.exports.uploadAvatar = multer({
    storage: profileStorage,
    limits: { fileSize: 5 * 1024 * 1024 } // 5 MB
}).single('profile'); // Renamed to 'profile' to match user snippet



