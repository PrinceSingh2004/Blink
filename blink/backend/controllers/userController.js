const { pool } = require('../config/db');
const { getColumn } = require('../utils/columnMapper');

/**
 * GET /api/users/me — AUTO-HEALING Dynamic Profile
 */
exports.getProfile = async (req, res) => {
    try {
        const userId = req.user.id;
        
        // Dynamic Detection
        const videoUserCol = await getColumn('videos', ['userId', 'user_id', 'creator_id']);
        const videoActiveCol = await getColumn('videos', ['is_active', 'active']);
        const viewsCountCol = await getColumn('videos', ['views_count', 'viewsCount', 'views']);
        const likesCountCol = await getColumn('videos', ['likes_count', 'likesCount', 'likes']);

        const [rows] = await pool.query(`
            SELECT 
                u.*,
                (SELECT COUNT(*) FROM videos WHERE ${videoUserCol || 'userId'} = u.id AND ${videoActiveCol || 'is_active'} = 1) AS posts_count,
                (SELECT COALESCE(SUM(${likesCountCol || 'likes_count'}), 0) FROM videos WHERE ${videoUserCol || 'userId'} = u.id) AS total_likes,
                (SELECT COALESCE(SUM(${viewsCountCol || 'views_count'}), 0) FROM videos WHERE ${videoUserCol || 'userId'} = u.id) AS total_views,
                (SELECT COUNT(*) FROM follows WHERE following_id = u.id) AS followers_count,
                (SELECT COUNT(*) FROM follows WHERE follower_id = u.id) AS following_count
            FROM users u
            WHERE u.id = ?
        `, [userId]);

        if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
        res.json({ success: true, user: rows[0] });

    } catch (err) {
        console.error('🔥 [Profile Fail]:', err.message);
        res.status(500).json({ error: 'Profile failed', detail: err.message });
    }
};

/**
 * GET /api/users/:id — Public Dynamic Profile
 */
exports.getUser = async (req, res) => {
    try {
        const userId = parseInt(req.params.id);
        const videoUserCol = await getColumn('videos', ['userId', 'user_id']);

        const currentUserId = req.user ? req.user.id : null;

        const [rows] = await pool.query(`
            SELECT 
                u.id, u.username, u.profile_photo, u.bio,
                (SELECT COUNT(*) FROM videos WHERE ${videoUserCol || 'userId'} = u.id) AS posts_count,
                (SELECT COUNT(*) FROM follows WHERE following_id = u.id) AS followers_count,
                (SELECT COUNT(*) FROM follows WHERE follower_id = u.id) AS following_count,
                EXISTS(SELECT 1 FROM follows WHERE follower_id = ? AND following_id = u.id) AS is_following
            FROM users u
            WHERE u.id = ?
        `, [currentUserId, userId]);

        if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
        res.json({ success: true, user: rows[0] });
    } catch (err) {
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
/**
 * POST /api/users/follow/:id — Toggle follow
 */
exports.followUser = async (req, res) => {
    try {
        const followerId = req.user.id;
        const followingId = parseInt(req.params.id);

        if (followerId === followingId) return res.status(400).json({ error: 'Cannot follow yourself' });

        const [existing] = await pool.query(
            'SELECT id FROM follows WHERE follower_id = ? AND following_id = ?',
            [followerId, followingId]
        );

        if (existing.length > 0) {
            await pool.query('DELETE FROM follows WHERE follower_id = ? AND following_id = ?', [followerId, followingId]);
        } else {
            await pool.query('INSERT INTO follows (follower_id, following_id) VALUES (?, ?)', [followerId, followingId]);
        }

        const [[{ count }]] = await pool.query('SELECT COUNT(*) as count FROM follows WHERE following_id = ?', [followingId]);
        console.log("Follow toggled:", followingId, "New count:", count);
        res.json({ success: true, follower_count: count });
    } catch (err) {
        res.status(500).json({ error: 'Follow failed' });
    }
};

console.log('✅ User Controller Exports Loaded:', Object.keys(exports));
