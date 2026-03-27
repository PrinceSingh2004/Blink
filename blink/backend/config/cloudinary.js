/**
 * config/cloudinary.js
 * ═══════════════════════════════════════════════════════════
 * Centralized Cloudinary configuration for Blink
 * 
 * WHY THIS FILE EXISTS:
 * - Single source of truth for Cloudinary credentials
 * - Reusable upload/delete helpers (no duplicated config)
 * - Handles both CLOUD_NAME and CLOUDINARY_CLOUD_NAME env vars
 *   (different hosting providers use different naming)
 * ═══════════════════════════════════════════════════════════
 */

const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');

// ── Configure Cloudinary ─────────────────────────────────────
// Support BOTH naming conventions (CLOUD_NAME and CLOUDINARY_CLOUD_NAME)
cloudinary.config({
    cloud_name: process.env.CLOUD_NAME || process.env.CLOUDINARY_CLOUD_NAME,
    api_key:    process.env.API_KEY    || process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.API_SECRET || process.env.CLOUDINARY_API_SECRET,
});

// Validate on startup
const cfg = cloudinary.config();
if (!cfg.cloud_name || !cfg.api_key || !cfg.api_secret) {
    console.error('[Cloudinary] ⚠️  Missing credentials! Set CLOUD_NAME, API_KEY, API_SECRET in .env');
} else {
    console.log(`[Cloudinary] ✅ Configured for cloud: ${cfg.cloud_name}`);
}

// ── Upload buffer to Cloudinary ──────────────────────────────
/**
 * Upload a file buffer to Cloudinary using stream upload.
 * This is the ONLY correct way on Render.com (no disk access).
 * 
 * @param {Buffer} buffer - The image file buffer (from multer memoryStorage)
 * @param {Object} options - Cloudinary upload options
 * @param {string} options.folder - Cloudinary folder (e.g., 'blink/avatars')
 * @param {string} options.public_id - Custom public_id for the image
 * @param {Array}  options.transformation - Cloudinary transformations
 * @returns {Promise<Object>} Cloudinary upload result with secure_url, public_id, etc.
 */
function uploadToCloudinary(buffer, options = {}) {
    return new Promise((resolve, reject) => {
        const uploadOptions = {
            folder: options.folder || 'blink/avatars',
            resource_type: 'image',
            format: 'webp',                    // Force WebP for best size/quality
            quality: 'auto:good',              // Smart quality optimization
            ...options,
        };

        const uploadStream = cloudinary.uploader.upload_stream(
            uploadOptions,
            (error, result) => {
                if (error) {
                    console.error('[Cloudinary] Upload error:', error.message);
                    reject(error);
                } else {
                    resolve(result);
                }
            }
        );

        streamifier.createReadStream(buffer).pipe(uploadStream);
    });
}

// ── Delete image from Cloudinary ─────────────────────────────
/**
 * Delete an image from Cloudinary by its public_id.
 * Used when user updates their avatar (delete old one to save storage).
 * 
 * Fails gracefully — never throws. If deletion fails, we just log it.
 * We don't want a failed cleanup to break the upload flow.
 * 
 * @param {string} publicId - The Cloudinary public_id to delete
 * @returns {Promise<Object|null>} Deletion result or null on failure
 */
async function deleteFromCloudinary(publicId) {
    if (!publicId) return null;
    
    try {
        const result = await cloudinary.uploader.destroy(publicId);
        console.log(`[Cloudinary] Deleted old image: ${publicId} → ${result.result}`);
        return result;
    } catch (err) {
        // Fail gracefully — don't break the upload flow
        console.warn(`[Cloudinary] Failed to delete ${publicId}:`, err.message);
        return null;
    }
}

module.exports = {
    cloudinary,
    uploadToCloudinary,
    deleteFromCloudinary,
};
