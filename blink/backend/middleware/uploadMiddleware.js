const multer = require('multer');
const path = require('path');
const fs = require('fs');

const videoDir = path.join(__dirname, '../uploads/videos');
const avatarDir = path.join(__dirname, '../uploads/avatars');

[videoDir, avatarDir].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

// ── Video Storage ─────────────────────────────────────────────
const videoStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, videoDir),
    filename: (req, file, cb) => {
        const unique = `${Date.now()}_${Math.round(Math.random() * 1e9)}`;
        cb(null, `${unique}${path.extname(file.originalname).toLowerCase()}`);
    }
});

const videoFilter = (req, file, cb) => {
    const allowed = ['video/mp4', 'video/quicktime'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only video files are allowed (mp4, mov)'), false);
};

// ── Avatar Storage ────────────────────────────────────────────
const avatarStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, avatarDir),
    filename: (req, file, cb) => {
        const unique = `${Date.now()}_${Math.round(Math.random() * 1e9)}`;
        cb(null, `${unique}${path.extname(file.originalname).toLowerCase()}`);
    }
});

const avatarFilter = (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only image files are allowed (jpeg, png, webp, gif)'), false);
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
}).single('avatar');
