/**
 * controllers/userController.js
 * ═══════════════════════════════════════════════════════════
 * User management: profile CRUD, avatar upload, account ops
 * 
 * AVATAR UPLOAD FLOW (production-grade):
 * 1. Validate file exists + mimetype
 * 2. Resize to 400×400 with sharp (saves memory + bandwidth)
 * 3. Upload to Cloudinary via stream (no disk needed)
 * 4. Delete old Cloudinary image (save storage)
 * 5. Save new URL + public_id to MySQL
 * 6. Return URL with cache-bust parameter
 * ═══════════════════════════════════════════════════════════
 */

const db     = require('../config/db');
const bcrypt = require('bcrypt');
const sharp  = require('sharp');
const { uploadToCloudinary, deleteFromCloudinary } = require('../config/cloudinary');

// ─── HELPER: Process and upload avatar ──────────────────────
/**
 * Resize image to 400×400 square, convert to WebP, upload to Cloudinary.
 * 
 * WHY sharp before Cloudinary?
 * - Reduces upload size from 5-15MB to ~30-50KB (95% reduction)
 * - Prevents Render.com memory overflow (512MB limit)
 * - Consistent output regardless of input format (HEIC, PNG, BMP → WebP)
 * - Faster upload on slow mobile connections
 * 
 * @param {Buffer} fileBuffer - Raw image buffer from multer
 * @param {number} userId - User ID for naming
 * @returns {Promise<{ secure_url: string, public_id: string }>}
 */
async function processAndUploadAvatar(fileBuffer, userId) {
    // Step 1: Resize + convert with sharp
    // cover: crop to fill 400×400 (like CSS object-fit: cover)
    // position: centre — focuses on faces/center of image
    const resizedBuffer = await sharp(fileBuffer)
        .resize(400, 400, {
            fit: 'cover',
            position: 'centre',
        })
        .webp({ quality: 85 })
        .toBuffer();

    // Step 2: Upload to Cloudinary
    const result = await uploadToCloudinary(resizedBuffer, {
        folder: 'blink/avatars',
        public_id: `user_${userId}_${Date.now()}`,
        overwrite: true,
        transformation: [
            { width: 400, height: 400, crop: 'fill', gravity: 'face' }
        ],
    });

    return result;
}

// ─── GET LOGGED IN USER ─────────────────────────────────────
exports.getCurrentUser = async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT id, username, email, 
                    COALESCE(profile_pic, profile_photo) AS profile_pic,
                    COALESCE(profile_pic, profile_photo) AS profile_photo,
                    bio, followers_count, following_count, total_likes, 
                    is_live, created_at
             FROM users WHERE id = ?`,
            [req.user.id]
        );

        if (!rows.length) return res.status(404).json({ error: 'User not found' });

        res.json(rows[0]);
    } catch (err) {
        console.error('[User] getCurrentUser:', err.message);
        res.status(500).json({ error: 'Server error' });
    }
};

// ─── GET PUBLIC PROFILE ──────────────────────────────────────
exports.getProfile = async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT id, username, email, 
                    COALESCE(profile_pic, profile_photo) AS profile_pic,
                    COALESCE(profile_pic, profile_photo) AS profile_photo,
                    bio, followers_count, following_count, total_likes, 
                    is_live, created_at
             FROM users WHERE id = ?`,
            [req.params.id]
        );

        if (!rows.length) return res.status(404).json({ error: 'User not found' });

        res.json({ user: rows[0] });
    } catch (err) {
        console.error('[User] getProfile:', err.message);
        res.status(500).json({ error: 'Server error' });
    }
};

// ─── SEARCH USERS ────────────────────────────────────────────
exports.searchUsers = async (req, res) => {
    try {
        const q = `%${req.query.q || ''}%`;
        const [users] = await db.query(
            `SELECT id, username, 
                    COALESCE(profile_pic, profile_photo) AS profile_photo,
                    followers_count, is_live 
             FROM users WHERE username LIKE ? LIMIT 20`,
            [q]
        );
        res.json({ users });
    } catch (err) {
        console.error('[User] searchUsers:', err.message);
        res.status(500).json({ error: 'Server error' });
    }
};

// ─── UPDATE PROFILE (username, bio only — no file) ───────────
exports.updateProfile = async (req, res) => {
    try {
        const { username, bio } = req.body;
        let imageUrl = null;

        // If a file was uploaded through this route, process it
        if (req.file && req.file.buffer) {
            try {
                const result = await processAndUploadAvatar(req.file.buffer, req.user.id);
                imageUrl = result.secure_url;

                // Delete old avatar from Cloudinary
                const [current] = await db.query(
                    'SELECT avatar_public_id FROM users WHERE id = ?',
                    [req.user.id]
                );
                if (current[0]?.avatar_public_id) {
                    await deleteFromCloudinary(current[0].avatar_public_id);
                }

                // Save new avatar URL + public_id
                await db.query(
                    'UPDATE users SET profile_photo = ?, profile_pic = ?, avatar_public_id = ? WHERE id = ?',
                    [imageUrl, imageUrl, result.public_id, req.user.id]
                );
            } catch (uploadErr) {
                console.error('[User] Avatar upload in updateProfile failed:', uploadErr.message);
                // Don't fail the entire update — just skip the avatar part
            }
        }

        const updates = [];
        const params  = [];

        if (username) {
            const cleanName = username.trim().toLowerCase();
            if (cleanName.length < 3 || cleanName.length > 30)
                return res.status(400).json({ error: 'Username must be 3–30 characters' });
            
            // Check uniqueness
            const [dup] = await db.query(
                'SELECT id FROM users WHERE username = ? AND id != ?',
                [cleanName, req.user.id]
            );
            if (dup.length) return res.status(409).json({ error: 'Username already taken' });
            
            updates.push('username = ?');
            params.push(cleanName);
        }

        if (bio !== undefined) {
            updates.push('bio = ?');
            params.push(bio);
        }

        if (req.body.profile_pic === '') {
            // Explicitly requested removal
            updates.push('profile_photo = NULL', 'profile_pic = NULL');
        }

        if (updates.length) {
            params.push(req.user.id);
            await db.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
        }

        // Fetch updated user to return
        const [rows] = await db.query(
            `SELECT id, username, email, 
                    COALESCE(profile_pic, profile_photo) AS profile_pic,
                    COALESCE(profile_pic, profile_photo) AS profile_photo,
                    bio, followers_count, following_count, total_likes
             FROM users WHERE id = ?`,
            [req.user.id]
        );

        res.json({
            success: true,
            message: 'Profile updated!',
            user: rows[0],
            imageUrl: rows[0].profile_photo,
            profile_photo: rows[0].profile_photo,
            profile_pic: rows[0].profile_pic,
        });

    } catch (err) {
        console.error('[User] updateProfile Error:', err.message);
        res.status(500).json({ success: false, error: 'Update failed. Please try again.' });
    }
};

// ─── UPDATE AVATAR (Direct Upload Endpoint) ──────────────────
/**
 * POST /api/upload-avatar
 * POST /api/upload-profile
 * 
 * This is THE primary avatar upload endpoint.
 * Frontend sends FormData with field 'avatar' containing the image file.
 * 
 * Complete flow:
 * 1. Auth check (handled by requireAuth middleware)
 * 2. Multer parses file into req.file.buffer (memoryStorage)
 * 3. Sharp resizes to 400×400 WebP (85% quality)
 * 4. Cloudinary upload via stream
 * 5. Delete old Cloudinary image
 * 6. Save new URL to both profile_pic AND profile_photo columns
 * 7. Return JSON with success + URL
 */
exports.updateAvatar = async (req, res) => {
    try {
        // ── Step 1: Validate file exists ─────────────────────────
        if (!req.file) {
            return res.status(400).json({ 
                success: false, 
                error: 'No image file provided. Select a photo and try again.' 
            });
        }

        // ── Step 2: Validate file is actually an image ───────────
        // Don't trust mimetype alone — check if sharp can read it
        // (this catches spoofed files with renamed extensions)
        let resizedBuffer;
        try {
            resizedBuffer = await sharp(req.file.buffer)
                .resize(400, 400, {
                    fit: 'cover',
                    position: 'centre',
                })
                .webp({ quality: 85 })
                .toBuffer();
        } catch (sharpErr) {
            console.error('[User] Sharp processing failed:', sharpErr.message);
            return res.status(400).json({
                success: false,
                error: 'Invalid image file. Please upload a JPG, PNG, or WebP image.'
            });
        }

        // ── Step 3: Upload to Cloudinary ─────────────────────────
        let cloudResult;
        try {
            cloudResult = await uploadToCloudinary(resizedBuffer, {
                folder: 'blink/avatars',
                public_id: `user_${req.user.id}_${Date.now()}`,
            });
        } catch (cloudErr) {
            console.error('[User] Cloudinary upload failed:', cloudErr.message);
            return res.status(502).json({
                success: false,
                error: 'Image hosting service unavailable. Please try again in a moment.'
            });
        }

        const avatarUrl = cloudResult.secure_url;
        const publicId  = cloudResult.public_id;

        // ── Step 4: Delete old avatar from Cloudinary ────────────
        try {
            const [current] = await db.query(
                'SELECT avatar_public_id FROM users WHERE id = ?',
                [req.user.id]
            );
            if (current[0]?.avatar_public_id) {
                await deleteFromCloudinary(current[0].avatar_public_id);
            }
        } catch (delErr) {
            // Non-fatal — log and continue
            console.warn('[User] Old avatar cleanup failed:', delErr.message);
        }

        // ── Step 5: Save to database ─────────────────────────────
        // Update BOTH columns for backward compatibility
        const [updateResult] = await db.query(
            `UPDATE users SET 
                profile_photo = ?, 
                profile_pic = ?, 
                avatar_public_id = ?
             WHERE id = ?`,
            [avatarUrl, avatarUrl, publicId, req.user.id]
        );

        if (updateResult.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                error: 'User not found. Please log in again.'
            });
        }

        // ── Step 6: Fetch updated user and return ────────────────
        const [rows] = await db.query(
            `SELECT id, username, email, 
                    profile_photo, profile_pic, bio,
                    followers_count, following_count, total_likes
             FROM users WHERE id = ?`,
            [req.user.id]
        );

        // Set Cache-Control to prevent stale avatars
        res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.set('Pragma', 'no-cache');

        res.json({ 
            success: true, 
            message: 'Avatar updated!', 
            imageUrl: avatarUrl,
            profile_photo: avatarUrl,
            profile_pic: avatarUrl,
            url: avatarUrl + '?v=' + Date.now(), // Cache-busted URL
            user: rows[0],
        });

    } catch (err) {
        console.error('[User] avatar upload failed:', err.message, err.stack);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to update avatar. Please try again.' 
        });
    }
};

// ─── CHANGE PASSWORD ─────────────────────────────────────────
exports.changePassword = async (req, res) => {
    try {
        const { current_password, new_password } = req.body;
        if (!current_password || !new_password)
            return res.status(400).json({ error: 'Both current and new password are required' });
        if (new_password.length < 6)
            return res.status(400).json({ error: 'New password must be at least 6 characters' });

        const [rows] = await db.query('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
        if (!rows.length) return res.status(404).json({ error: 'User not found' });

        const valid = await bcrypt.compare(current_password, rows[0].password_hash);
        if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

        const hash = await bcrypt.hash(new_password, 12);
        await db.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, req.user.id]);
        res.json({ message: 'Password changed successfully' });
    } catch (err) {
        console.error('[User] changePassword:', err.message);
        res.status(500).json({ error: 'Failed to change password' });
    }
};

// ─── DELETE ACCOUNT ──────────────────────────────────────────
exports.deleteAccount = async (req, res) => {
    try {
        const userId = req.user.id;

        // Delete avatar from Cloudinary
        const [rows] = await db.query(
            'SELECT avatar_public_id FROM users WHERE id = ?', 
            [userId]
        );
        if (rows[0]?.avatar_public_id) {
            await deleteFromCloudinary(rows[0].avatar_public_id);
        }

        await db.query('DELETE FROM users WHERE id = ?', [userId]);
        res.json({ message: 'Account deleted successfully' });
    } catch (err) {
        console.error('[User] deleteAccount:', err.message);
        res.status(500).json({ error: 'Failed to delete account' });
    }
};

// ─── GO LIVE / STOP LIVE ─────────────────────────────────────
exports.goLive = async (req, res) => {
    try {
        await db.query('UPDATE users SET is_live = 1 WHERE id = ?', [req.user.id]);
        res.json({ message: 'Live status activated' });
    } catch (err) {
        console.error('[User] goLive:', err.message);
        res.status(500).json({ error: 'Failed to update live status' });
    }
};

exports.stopLive = async (req, res) => {
    try {
        await db.query('UPDATE users SET is_live = 0 WHERE id = ?', [req.user.id]);
        res.json({ message: 'Live status deactivated' });
    } catch (err) {
        console.error('[User] stopLive:', err.message);
        res.status(500).json({ error: 'Failed to update live status' });
    }
};
