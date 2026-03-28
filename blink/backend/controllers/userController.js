/**
 * backend/controllers/userController.js
 * ═══════════════════════════════════════════════════════════
 * Professional Profile Management – Cloud Persistence Ready
 * ═══════════════════════════════════════════════════════════
 */

const db = require('../config/db');
const bcrypt = require('bcrypt');
const asyncHandler = require('express-async-handler');

// ─── GET PROFILE ─────────────────────────────────────────────
exports.getProfile = asyncHandler(async (req, res) => {
    const userId = req.params.id;
    const [rows] = await db.query(
        `SELECT id, username, bio, 
         COALESCE(profile_pic, avatar_url, profile_photo) AS profile_pic,
         followers_count, following_count
         FROM users WHERE id = ?`,
        [userId]
    );

    if (!rows.length) return res.status(404).json({ success: false, error: 'User not found' });
    res.json({ success: true, data: rows[0] });
});

// ─── UPDATE PROFILE ──────────────────────────────────────────
exports.updateProfile = asyncHandler(async (req, res) => {
    const { username, bio } = req.body;
    const userId = req.user.id;
    let profilePicUrl = null;

    if (req.file) {
        // Cloudinary provides the full persistent URL in req.file.path
        profilePicUrl = req.file.path;
    }

    const updates = [];
    const params = [];

    if (username) {
        updates.push('username = ?');
        params.push(username.trim().toLowerCase());
    }
    if (bio !== undefined) {
        updates.push('bio = ?');
        params.push(bio);
    }
    if (profilePicUrl) {
        // Cloud Path Mapping: profile_pic, avatar_url, profile_photo
        updates.push('profile_pic = ?', 'avatar_url = ?', 'profile_photo = ?');
        params.push(profilePicUrl, profilePicUrl, profilePicUrl);
    }

    if (updates.length > 0) {
        params.push(userId);
        await db.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
    }

    const [user] = await db.query('SELECT id, username, bio, profile_pic FROM users WHERE id = ?', [userId]);
    res.json({ success: true, data: user[0] });
});

// ─── CHANGE PASSWORD ─────────────────────────────────────────
exports.changePassword = asyncHandler(async (req, res) => {
    const { old_password, new_password } = req.body;
    if (new_password.length < 6) return res.status(400).json({ success: false, error: 'Password too short' });

    const [rows] = await db.query('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
    const valid = await bcrypt.compare(old_password, rows[0].password_hash);
    
    if (!valid) return res.status(401).json({ success: false, error: 'Incorrect current password' });

    const hash = await bcrypt.hash(new_password, 12);
    await db.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, req.user.id]);
    
    res.json({ success: true, message: 'Password successfully updated' });
});

// ─── DELETE ACCOUNT ──────────────────────────────────────────
exports.deleteAccount = asyncHandler(async (req, res) => {
    await db.query('DELETE FROM users WHERE id = ?', [req.user.id]);
    res.json({ success: true, message: 'Account permanently deactivated' });
});
