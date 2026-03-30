/**
 * controllers/userController.js – User Management Controller
 * ═══════════════════════════════════════════════════════════════════════════════
 */

const pool = require('../config/db');
const { cloudinary } = require('../config/cloudinary');

// ════════════════════════════════════════════════════════════════════════════════
// GET USER (Example requested by USER)
// ════════════════════════════════════════════════════════════════════════════════
exports.getUser = async (req, res) => {
    try {
        const userId = req.user?.id || req.params.userId;
        if (!userId) return res.status(400).json({ error: 'User ID is required' });

        const [rows] = await pool.query(
            'SELECT id, username, display_name, bio, COALESCE(profile_pic, avatar_url) AS avatar, is_verified FROM users WHERE id = ?',
            [userId]
        );

        if (!rows.length) return res.status(404).json({ error: 'User not found' });
        res.json({ success: true, data: rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ════════════════════════════════════════════════════════════════════════════════
// GET USER PROFILE
// ════════════════════════════════════════════════════════════════════════════════
exports.getUserProfile = async (req, res) => {
    try {
        const { username } = req.params;
        const [rows] = await pool.query(
            'SELECT id, username, display_name, bio, website, location, COALESCE(profile_pic, avatar_url) AS profile_pic, is_verified, followers_count, following_count, posts_count FROM users WHERE username = ?',
            [username]
        );

        if (!rows.length) return res.status(404).json({ error: 'Profile not found' });
        res.json({ success: true, data: rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ════════════════════════════════════════════════════════════════════════════════
// UPDATE PROFILE
// ════════════════════════════════════════════════════════════════════════════════
exports.updateProfile = async (req, res) => {
    try {
        const userId = req.user.id;
        const { display_name, bio, website, location } = req.body;

        await pool.execute(
            'UPDATE users SET display_name = ?, bio = ?, website = ?, location = ? WHERE id = ?',
            [display_name, bio, website, location, userId]
        );

        res.json({ success: true, message: 'Profile updated successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Placeholder for missing handlers in original file
exports.updateProfilePic = async (req, res) => { res.json({ message: 'Profile pic update logic' }); };
exports.updateCoverPic   = async (req, res) => { res.json({ message: 'Cover pic update logic' });   };

// ════════════════════════════════════════════════════════════════════════════════
// FOLLOW / UNFOLLOW
// ════════════════════════════════════════════════════════════════════════════════
exports.followUser = async (req, res) => {
    try {
        const followerId = req.user.id;
        const followingId = req.params.userId;

        await pool.execute('INSERT IGNORE INTO followers (follower_id, following_id) VALUES (?, ?)', [followerId, followingId]);
        await pool.execute('UPDATE users SET followers_count = followers_count + 1 WHERE id = ?', [followingId]);
        await pool.execute('UPDATE users SET following_count = following_count + 1 WHERE id = ?', [followerId]);

        res.json({ success: true, message: 'User followed' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.unfollowUser = async (req, res) => {
    try {
        const followerId = req.user.id;
        const followingId = req.params.userId;

        await pool.execute('DELETE FROM followers WHERE follower_id = ? AND following_id = ?', [followerId, followingId]);
        await pool.execute('UPDATE users SET followers_count = GREATEST(followers_count - 1, 0) WHERE id = ?', [followingId]);
        await pool.execute('UPDATE users SET following_count = GREATEST(following_count - 1, 0) WHERE id = ?', [followerId]);

        res.json({ success: true, message: 'User unfollowed' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ════════════════════════════════════════════════════════════════════════════════
// SEARCH / LISTING
// ════════════════════════════════════════════════════════════════════════════════
exports.searchUsers = async (req, res) => {
    try {
        const { q } = req.query;
        const [rows] = await pool.query(
            'SELECT id, username, display_name FROM users WHERE username LIKE ? OR display_name LIKE ? LIMIT 10',
            [`%${q}%`, `%${q}%`]
        );
        res.json({ success: true, users: rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getFollowers = async (req, res) => {
    try {
        const { userId } = req.params;
        const [rows] = await pool.query(
            'SELECT u.id, u.username FROM users u JOIN followers f ON u.id = f.follower_id WHERE f.following_id = ?',
            [userId]
        );
        res.json({ success: true, followers: rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getFollowing = async (req, res) => {
    try {
        const { userId } = req.params;
        const [rows] = await pool.query(
            'SELECT u.id, u.username FROM users u JOIN followers f ON u.id = f.following_id WHERE f.follower_id = ?',
            [userId]
        );
        res.json({ success: true, following: rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
