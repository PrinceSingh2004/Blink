/**
 * controllers/userController.js
 * ═══════════════════════════════════════════════════════════
 * Clean Rebuild of User Controller – Production Ready
 * ═══════════════════════════════════════════════════════════
 */

const db     = require('../config/db');
const bcrypt = require('bcrypt');
const fs     = require('fs');
const path   = require('path');

// ─── GET PROFILE ─────────────────────────────────────────────
exports.getProfile = async (req, res) => {
    try {
        const userId = req.params.id;
        const [rows] = await db.query(
            `SELECT u.username, u.bio, 
             COALESCE(u.avatar_url, u.profile_pic, u.profile_photo) AS avatar_url,
             (SELECT COUNT(*) FROM videos WHERE user_id = u.id) AS videos_count,
             u.followers_count, u.following_count
             FROM users u WHERE u.id = ?`,
            [userId]
        );

        if (!rows.length) return res.status(404).json({ error: 'User not found' });
        res.json(rows[0]);
    } catch (err) {
        console.error('[User] getProfile:', err);
        res.status(500).json({ error: 'Failed to load profile' });
    }
};

// ─── UPDATE PROFILE ──────────────────────────────────────────
exports.updateProfile = async (req, res) => {
    try {
        const { username, bio } = req.body;
        const userId = req.user.id;
        let avatarUrl = null;

        if (req.file) {
            // Local storage path for URL
            avatarUrl = `/uploads/${req.file.filename}`;
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
        if (avatarUrl) {
            updates.push('avatar_url = ?', 'profile_photo = ?', 'profile_pic = ?');
            params.push(avatarUrl, avatarUrl, avatarUrl);
        }

        if (updates.length > 0) {
            params.push(userId);
            await db.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
        }

        const [user] = await db.query('SELECT username, bio, avatar_url FROM users WHERE id = ?', [userId]);
        res.json({ success: true, user: user[0] });

    } catch (err) {
        console.error('[User] updateProfile:', err);
        res.status(500).json({ error: 'Update failed' });
    }
};

// ─── CHANGE PASSWORD ─────────────────────────────────────────
exports.changePassword = async (req, res) => {
    try {
        const { old_password, new_password } = req.body;
        if (new_password.length < 6) return res.status(400).json({ error: 'Password too short' });

        const [rows] = await db.query('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
        const valid = await bcrypt.compare(old_password, rows[0].password_hash);
        
        if (!valid) return res.status(401).json({ error: 'Incorrect old password' });

        const hash = await bcrypt.hash(new_password, 10);
        await db.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, req.user.id]);
        
        res.json({ success: true, message: 'Password updated' });
    } catch (err) {
        res.status(500).json({ error: 'Internal error' });
    }
};

// ─── DELETE ACCOUNT ──────────────────────────────────────────
exports.deleteAccount = async (req, res) => {
    try {
        const userId = req.user.id;
        // Optional: Clean up media files here if needed
        await db.query('DELETE FROM users WHERE id = ?', [userId]);
        res.json({ success: true, message: 'Account deleted' });
    } catch (err) {
        res.status(500).json({ error: 'Deletion failed' });
    }
};
