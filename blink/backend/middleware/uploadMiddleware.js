const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cloudinary = require('cloudinary').v2;

// ── Cloudinary Config ─────────────────────────────────────────
cloudinary.config({
    cloud_name: process.env.CLOUD_NAME,
    api_key: process.env.CLOUD_KEY,
    api_secret: process.env.CLOUD_SECRET
});

const videoDir = path.join(__dirname, '../uploads/videos');

if (!fs.existsSync(videoDir)) fs.mkdirSync(videoDir, { recursive: true });

// ── Video Storage (Keep as is for now)
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

// ── Avatar Storage (Memory Storage for Stream-based upload to Cloudinary)
const avatarStorage = multer.memoryStorage();

const avatarFilter = (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only image files are allowed (jpeg, png, webp)'), false);
};

// ── Exports ───────────────────────────────────────────────────
module.exports.uploadVideo = multer({
    storage: videoStorage,
    fileFilter: videoFilter,
    limits: { fileSize: 1024 * 1024 * 1024 } // 1GB limit
}).single('video');

module.exports.uploadAvatar = multer({
    storage: avatarStorage,
    fileFilter: avatarFilter,
    limits: { fileSize: 5 * 1024 * 1024 } // 5 MB as requested
}).single('photo');


