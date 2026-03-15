const db = require('../config/db');

// ─── CHECK FOLLOW STATUS ──────────────────────────────────────
exports.checkStatus = async (req, res) => {
    try {
        const [[row]] = await db.query(
            'SELECT id FROM followers WHERE follower_id = ? AND following_id = ?',
            [req.user.id, req.params.id]
        );
        res.json({ following: !!row });
    } catch {
        res.status(500).json({ error: 'Server error' });
    }
};

// ─── FOLLOW ───────────────────────────────────────────────────
exports.follow = async (req, res) => {
    try {
        const followerId  = req.user.id;
        const followingId = parseInt(req.params.id);

        if (followerId === followingId)
            return res.status(400).json({ error: 'You cannot follow yourself' });

        // Check target user exists
        const [[target]] = await db.query('SELECT id FROM users WHERE id = ?', [followingId]);
        if (!target) return res.status(404).json({ error: 'User not found' });

        // Check if already following
        const [[existing]] = await db.query(
            'SELECT id FROM followers WHERE follower_id = ? AND following_id = ?',
            [followerId, followingId]
        );
        if (existing) return res.status(409).json({ error: 'Already following this user' });

        await db.query('INSERT INTO followers (follower_id, following_id) VALUES (?, ?)', [followerId, followingId]);
        await db.query('UPDATE users SET followers_count = followers_count + 1 WHERE id = ?', [followingId]);
        await db.query('UPDATE users SET following_count = following_count + 1 WHERE id = ?', [followerId]);

        res.json({ message: 'Followed successfully', following: true });
    } catch (err) {
        console.error('[Follow] follow:', err.message);
        res.status(500).json({ error: 'Failed to follow user' });
    }
};

// ─── UNFOLLOW ─────────────────────────────────────────────────
exports.unfollow = async (req, res) => {
    try {
        const followerId  = req.user.id;
        const followingId = parseInt(req.params.id);

        const [result] = await db.query(
            'DELETE FROM followers WHERE follower_id = ? AND following_id = ?',
            [followerId, followingId]
        );
        if (!result.affectedRows)
            return res.status(400).json({ error: 'You are not following this user' });

        await db.query('UPDATE users SET followers_count = GREATEST(0, followers_count - 1) WHERE id = ?', [followingId]);
        await db.query('UPDATE users SET following_count = GREATEST(0, following_count - 1) WHERE id = ?', [followerId]);

        res.json({ message: 'Unfollowed successfully', following: false });
    } catch (err) {
        console.error('[Follow] unfollow:', err.message);
        res.status(500).json({ error: 'Failed to unfollow user' });
    }
};

// ─── GET FOLLOWERS LIST ───────────────────────────────────────
exports.getFollowers = async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT u.id, u.username, u.profile_picture FROM followers f
             JOIN users u ON f.follower_id = u.id WHERE f.following_id = ?`,
            [req.params.userId]
        );
        res.json({ followers: rows });
    } catch {
        res.status(500).json({ error: 'Server error' });
    }
};

// ─── GET FOLLOWING LIST ───────────────────────────────────────
exports.getFollowing = async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT u.id, u.username, u.profile_picture FROM followers f
             JOIN users u ON f.following_id = u.id WHERE f.follower_id = ?`,
            [req.params.userId]
        );
        res.json({ following: rows });
    } catch {
        res.status(500).json({ error: 'Server error' });
    }
};
// ─── GET FOLLOWED USERS WHO ARE LIVE ───────────────────────────
exports.getFollowedLive = async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT id, username, profile_picture FROM users 
             WHERE is_live = 1 AND (id = ? OR id IN (SELECT following_id FROM followers WHERE follower_id = ?))`,
            [req.user.id, req.user.id]
        );
        res.json({ live: rows });
    } catch {
        res.status(500).json({ error: 'Server error' });
    }
};
