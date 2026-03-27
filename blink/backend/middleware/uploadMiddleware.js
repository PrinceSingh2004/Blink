/**
 * middleware/uploadMiddleware.js
 * ═══════════════════════════════════════════════════════════
 * Multer configuration for file uploads
 * 
 * CRITICAL DESIGN DECISIONS:
 * 1. memoryStorage ONLY — Render.com has no persistent disk
 * 2. HEIC/HEIF accepted — iOS sends photos in this format
 * 3. Field name 'avatar' — must match frontend FormData key
 * 4. 10MB limit — allows large mobile photos (sharp resizes later)
 * ═══════════════════════════════════════════════════════════
 */

const multer = require('multer');
const path   = require('path');
const fs     = require('fs');

// ── Local Storage for Videos ──────────────────────────────────
const videoDir = path.join(__dirname, '../uploads/videos');
if (!fs.existsSync(videoDir)) fs.mkdirSync(videoDir, { recursive: true });

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
    else cb(new Error('Only video files are allowed (mp4, mov, webm)'), false);
};

// ── Profile Image Storage (Memory for Cloudinary) ─────────────
// WHY memoryStorage: Render.com has NO persistent disk.
// The file stays in RAM as a Buffer, gets piped to Cloudinary via stream.
const profileStorage = multer.memoryStorage();

/**
 * Image filter — accepts ALL common image formats including mobile.
 * 
 * WHY we accept HEIC/HEIF:
 * iOS 11+ saves photos as HEIC by default. If we reject this mimetype,
 * iPhone users get "Only image files are allowed" error, which is confusing.
 * Sharp can convert HEIC → WebP server-side.
 * 
 * WHY we accept 'application/octet-stream':
 * Some Android browsers send images with mimetype 'application/octet-stream'
 * instead of the correct image/* type. We rely on the sharp library to
 * validate the actual image content (magic bytes) in the controller.
 */
const imageFilter = (req, file, cb) => {
    const allowed = [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/webp',
        'image/gif',
        'image/heic',          // iOS photos
        'image/heif',          // iOS photos (alternative)
        'image/bmp',
        'image/tiff',
        'application/octet-stream', // Some mobile browsers
    ];

    if (allowed.includes(file.mimetype) || file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('Only image files are allowed (jpg, png, webp, heic)'), false);
    }
};

// ── Exports ───────────────────────────────────────────────────
module.exports.uploadVideo = multer({
    storage: videoStorage,
    fileFilter: videoFilter,
    limits: { fileSize: 1024 * 1024 * 1024 } // 1GB limit
}).single('video');

/**
 * Avatar upload middleware.
 * 
 * Field name: 'avatar' — frontend FormData MUST use this key.
 * Size limit: 10MB — intentionally higher than final output because:
 *   - iOS HEIC photos can be 5-15MB raw
 *   - We resize to 400x400 WebP (~30-50KB) via sharp BEFORE Cloudinary
 *   - Better UX: accept the file, let sharp handle optimization
 */
module.exports.uploadAvatar = multer({
    storage: profileStorage,
    fileFilter: imageFilter,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB (sharp will compress)
}).single('avatar');
