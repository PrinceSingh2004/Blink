/**
 * middleware/uploadMiddleware.js
 * ═══════════════════════════════════════════════════════════
 * Clean Rebuild of Upload Middleware – Local /uploads storage
 * ═══════════════════════════════════════════════════════════
 */

const multer = require('multer');
const path   = require('path');
const fs     = require('fs');

const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const unique = `${Date.now()}_${Math.round(Math.random() * 1e9)}`;
        cb(null, `${unique}${path.extname(file.originalname).toLowerCase()}`);
    }
});

const filter = (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only image files are allowed'), false);
};

module.exports.uploadAvatar = multer({
    storage: storage,
    fileFilter: filter,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
}).single('avatar');
