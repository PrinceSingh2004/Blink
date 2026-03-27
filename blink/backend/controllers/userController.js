const db     = require('../config/db');
const bcrypt = require('bcrypt');
const path   = require('path');
const fs     = require('fs');
const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');

cloudinary.config({
    cloud_name: process.env.CLOUD_NAME,
    api_key: process.env.API_KEY,      // Consistent with .env
    api_secret: process.env.API_SECRET  // Consistent with .env
});

// ─── HELPER: UPLOAD TO CLOUDINARY ───────────────────────────
const uploadToCloudinary = (fileBuffer) => {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            {
                folder: 'blink_profile',
                transformation: [{ width: 500, height: 500, crop: 'limit', quality: 'auto' }],
                resource_type: 'auto'
            },
            (error, result) => {
                if (result) resolve(result);
                else reject(error);
            }
        );
        streamifier.createReadStream(fileBuffer).pipe(stream);
    });
};

// ─── GET LOGGED IN USER (Convenience) ───────────────────────
exports.getCurrentUser = async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT id, username, email, profile_photo, profile_pic, bio,
                    followers_count, following_count, total_likes, is_live, created_at
             FROM users WHERE id = ?`,
            [req.user.id]
        );
        if (!rows.length) return res.status(404).json({ error: 'User not found' });
        res.json(rows[0]); // Return the user object directly
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
};

// ─── GET PUBLIC PROFILE ───────────────────────────────────────
exports.getProfile = async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT id, username, email, profile_photo, bio,
                    followers_count, following_count, total_likes, is_live, created_at
             FROM users WHERE id = ?`,
            [req.params.id]
        );
        if (!rows.length) return res.status(404).json({ error: 'User not found' });
        res.json({ user: rows[0] });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
};

// ─── SEARCH USERS ─────────────────────────────────────────────
exports.searchUsers = async (req, res) => {
    try {
        const q = `%${req.query.q || ''}%`;
        const [users] = await db.query(
            `SELECT id, username, profile_photo, followers_count, is_live FROM users WHERE username LIKE ? LIMIT 20`,
            [q]
        );
        res.json({ users });
    } catch {
        res.status(500).json({ error: 'Server error' });
    }
};

// ─── UPDATE PROFILE (username, bio, photo) ───────────────────
exports.updateProfile = async (req, res) => {
    try {
        const { username, bio } = req.body;
        let imageUrl = null;

        if (req.file) {
            const result = await uploadToCloudinary(req.file.buffer);
            imageUrl = result.secure_url;
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

        if (imageUrl) {
            updates.push('profile_photo = ?', 'profile_pic = ?');
            params.push(imageUrl, imageUrl);
        } else if (req.body.profile_pic === '') {
            // Explicitly requested removal
            updates.push('profile_photo = NULL', 'profile_pic = NULL');
        }

        if (!updates.length) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        params.push(req.user.id);
        await db.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);

        // Fetch updated user to return
        const [rows] = await db.query(
            'SELECT id, username, email, profile_photo, profile_pic, bio, followers_count, following_count, total_likes FROM users WHERE id = ?',
            [req.user.id]
        );

        res.json({
            success: true,
            message: 'Profile updated!',
            user: rows[0],
            imageUrl: rows[0].profile_photo
        });

    } catch (err) {
        console.error('[User] updateProfile Error:', err);
        res.status(500).json({ success: false, error: 'Update failed. Please try again.' });
    }
};

// ─── UPDATE AVATAR (Direct Endpoint) ──────────────────────────
exports.updateAvatar = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No image provided' });

        const result = await uploadToCloudinary(req.file.buffer);
        const avatarUrl = result.secure_url;

        // Store URL in both columns for backward compatibility
        await db.query('UPDATE users SET profile_photo = ?, profile_pic = ? WHERE id = ?', [avatarUrl, avatarUrl, req.user.id]);
        
        res.json({ 
            success: true, 
            message: 'Avatar updated!', 
            imageUrl: avatarUrl,
            profile_photo: avatarUrl,
            profile_pic: avatarUrl 
        });
    } catch (err) {
        console.error('[User] avatar upload failed:', err.message);
        res.status(500).json({ success: false, error: 'Failed to update avatar' });
    }
};

// ─── CHANGE PASSWORD ──────────────────────────────────────────
exports.changePassword = async (req, res) => {
    try {
        const { current_password, new_password } = req.body;
        if (!current_password || !new_password)
            return res.status(400).json({ error: 'Both current and new password are required' });
        if (new_password.length < 6)
            return res.status(400).json({ error: 'New password must be at least 6 characters' });

        const [rows] = await db.query('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
        const valid  = await bcrypt.compare(current_password, rows[0].password_hash);
        if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

        const hash = await bcrypt.hash(new_password, 12);
        await db.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, req.user.id]);
        res.json({ message: 'Password changed successfully' });
    } catch (err) {
        console.error('[User] changePassword:', err.message);
        res.status(500).json({ error: 'Failed to change password' });
    }
};

// ─── DELETE ACCOUNT ───────────────────────────────────────────
exports.deleteAccount = async (req, res) => {
    try {
        const userId = req.user.id;
        // Delete avatar from disk
        const [rows] = await db.query('SELECT profile_photo FROM users WHERE id = ?', [userId]);
        const avatar = rows[0]?.profile_photo;
        if (avatar && avatar.startsWith('/uploads/avatars/')) {
            const avatarPath = path.join(__dirname, '../', avatar);
            if (fs.existsSync(avatarPath)) fs.unlinkSync(avatarPath);
        }
        // User videos will be deleted by ON DELETE CASCADE if configured,
        // but let's be safe and delete them manually if not.
        await db.query('DELETE FROM users WHERE id = ?', [userId]);
        res.json({ message: 'Account deleted successfully' });
    } catch (err) {
        console.error('[User] deleteAccount:', err.message);
        res.status(500).json({ error: 'Failed to delete account' });
    }
};
// ─── GO LIVE / STOP LIVE ──────────────────────────────────────
exports.goLive = async (req, res) => {
    try {
        await db.query('UPDATE users SET is_live = 1 WHERE id = ?', [req.user.id]);
        res.json({ message: 'Live status activated' });
    } catch { res.status(500).json({ error: 'Failed to update live status' }); }
};

exports.stopLive = async (req, res) => {
    try {
        await db.query('UPDATE users SET is_live = 0 WHERE id = ?', [req.user.id]);
        res.json({ message: 'Live status deactivated' });
    } catch { res.status(500).json({ error: 'Failed to update live status' }); }
};

