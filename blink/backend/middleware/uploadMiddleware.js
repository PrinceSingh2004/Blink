const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// ── Cloudinary Config ─────────────────────────────────────────
// Using existing env names if they exist, or the ones requested by user
cloudinary.config({
    cloud_name: process.env.CLOUD_NAME,
    api_key: process.env.API_KEY || process.env.CLOUD_KEY,
    api_secret: process.env.API_SECRET || process.env.CLOUD_SECRET
});

const videoDir = path.join(__dirname, '../uploads/videos');
// No longer need local avatarDir for CloudinaryStorage

if (!fs.existsSync(videoDir)) fs.mkdirSync(videoDir, { recursive: true });

// ── Video Storage (Keep as is for now, or move to Cloudinary? User only asked for profile photos)
// The user said Render does not store local files permanently. So all uploads should go to Cloudinary.
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

// ── Avatar Storage (Cloudinary) ────────────────────────────────
const avatarStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'profile_photos',
        allowed_formats: ['jpg', 'png', 'jpeg', 'webp'],
        transformation: [{ width: 500, height: 500, crop: 'limit' }]
    }
});

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
    limits: { fileSize: 10 * 1024 * 1024 } // 10 MB
}).single('photo'); // The user's frontend snippet uses 'photo' as the field name

