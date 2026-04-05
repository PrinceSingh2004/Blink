/**
 * controllers/userController.js — User Profile Management
 * ═══════════════════════════════════════════════════════════
 */

const { pool } = require('../config/db');

/**
 * GET /api/users/me — Get current user profile
 */
exports.getProfile = async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT 
                u.id, u.username, u.email, u.profile_photo, u.bio, u.created_at,
                (SELECT COUNT(*) FROM videos WHERE user_id = u.id AND is_active = 1) AS posts_count
            FROM users u
            WHERE u.id = ?
        `, [req.user.id]);

        if (rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ success: true, user: rows[0] });
    } catch (err) {
        console.error('Profile error:', err.message);
        res.status(500).json({ error: 'Failed to load profile' });
    }
};

/**
 * GET /api/users/:id — Get any user's public profile
 */
exports.getUser = async (req, res) => {
    try {
        const userId = parseInt(req.params.id);

        const [rows] = await pool.query(`
            SELECT 
                u.id, u.username, u.profile_photo, u.bio, u.created_at,
                (SELECT COUNT(*) FROM videos WHERE user_id = u.id AND is_active = 1) AS posts_count
            FROM users u
            WHERE u.id = ?
        `, [userId]);

        if (rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ success: true, user: rows[0] });
    } catch (err) {
        console.error('Get user error:', err.message);
        res.status(500).json({ error: 'Failed to load user' });
    }
};

/**
 * PUT /api/users/profile — Update current user profile
 */
exports.updateProfile = async (req, res) => {
    try {
        const { username, bio } = req.body;
        const userId = req.user.id;

        if (!username || username.trim().length < 3) {
            return res.status(400).json({ error: 'Username must be at least 3 characters' });
        }

        await pool.query(
            'UPDATE users SET username = ?, bio = ? WHERE id = ?',
            [username.trim(), bio || null, userId]
        );

        res.json({ success: true, message: 'Profile updated' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'Username already taken' });
        }
        console.error('Update profile error:', err.message);
        res.status(500).json({ error: 'Failed to update profile' });
    }
};

/**
 * GET /api/users/search?q=term — Search users
 */
exports.searchUsers = async (req, res) => {
    try {
        const q = (req.query.q || '').trim();
        if (q.length < 2) {
            return res.json({ success: true, users: [] });
        }

        const [users] = await pool.query(`
            SELECT id, username, profile_photo, bio
            FROM users
            WHERE username LIKE ?
            ORDER BY username ASC
            LIMIT 20
        `, [`%${q}%`]);

        res.json({ success: true, users });
    } catch (err) {
        console.error('Search users error:', err.message);
        res.status(500).json({ error: 'Search failed' });
    }
};
