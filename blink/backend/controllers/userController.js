const db     = require('../config/db');
const bcrypt = require('bcrypt');
const path   = require('path');
const fs     = require('fs');

// ─── GET PUBLIC PROFILE ───────────────────────────────────────
exports.getProfile = async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT id, username, email, profile_picture, bio,
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
            `SELECT id, username, profile_picture, followers_count, is_live FROM users WHERE username LIKE ? LIMIT 20`,
            [q]
        );
        res.json({ users });
    } catch {
        res.status(500).json({ error: 'Server error' });
    }
};

// ─── UPDATE PROFILE (username, bio) ──────────────────────────
exports.updateProfile = async (req, res) => {
    try {
        const { username, bio } = req.body;
        const updates = [];
        const params  = [];

        if (username) {
            if (username.length < 3 || username.length > 30)
                return res.status(400).json({ error: 'Username must be 3–30 characters' });
            // Check uniqueness
            const [dup] = await db.query(
                'SELECT id FROM users WHERE username = ? AND id != ?',
                [username.toLowerCase(), req.user.id]
            );
            if (dup.length) return res.status(409).json({ error: 'Username already taken' });
            updates.push('username = ?');
            params.push(username.toLowerCase());
        }

        if (bio !== undefined) { updates.push('bio = ?'); params.push(bio); }
        if (!updates.length) return res.status(400).json({ error: 'No fields to update' });

        params.push(req.user.id);
        await db.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);

        const [rows] = await db.query(
            'SELECT id, username, email, profile_picture, bio, followers_count, following_count, total_likes FROM users WHERE id = ?',
            [req.user.id]
        );
        res.json({ message: 'Profile updated', user: rows[0] });
    } catch (err) {
        console.error('[User] updateProfile:', err.message);
        res.status(500).json({ error: 'Failed to update profile' });
    }
};

// ─── UPDATE AVATAR ────────────────────────────────────────────
exports.updateAvatar = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No image provided' });

        // Delete old avatar
        const [rows] = await db.query('SELECT profile_picture FROM users WHERE id = ?', [req.user.id]);
        const old = rows[0]?.profile_picture;
        if (old && old.startsWith('/uploads/avatars/')) {
            const oldPath = path.join(__dirname, '../', old);
            if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        }

        const avatarUrl = `/uploads/avatars/${req.file.filename}`;
        await db.query('UPDATE users SET profile_picture = ? WHERE id = ?', [avatarUrl, req.user.id]);
        res.json({ message: 'Avatar updated', profile_picture: avatarUrl });
    } catch (err) {
        console.error('[User] avatar:', err.message);
        res.status(500).json({ error: 'Failed to update avatar' });
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
        const [rows] = await db.query('SELECT profile_picture FROM users WHERE id = ?', [userId]);
        const avatar = rows[0]?.profile_picture;
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

