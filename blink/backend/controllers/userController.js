/**
 * controllers/userController.js – Profile, Follow, Search
 */
const pool   = require('../db/config');
const { v2: cloudinary } = require('cloudinary');

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key:    process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// ── GET PROFILE ───────────────────────────────────────────────────
exports.getProfile = async (req, res) => {
    try {
        const userId   = req.params.id;
        const viewerId = req.user?.id || null;

        const [rows] = await pool.query(`
            SELECT u.id, u.username, u.display_name, u.bio, u.website, u.location,
                   COALESCE(u.profile_pic, u.avatar_url, u.profile_photo) AS profile_pic,
                   u.is_verified, u.is_live, u.followers_count, u.following_count,
                   u.posts_count, u.is_private, u.created_at,
                   ${viewerId ? `
                   (SELECT COUNT(*) FROM followers 
                    WHERE follower_id = ? AND following_id = u.id) AS is_following,
                   (SELECT COUNT(*) FROM blocked_users 
                    WHERE blocker_id = ? AND blocked_id = u.id) AS is_blocked
                   ` : '0 AS is_following, 0 AS is_blocked'}
            FROM users u
            WHERE u.id = ?
            LIMIT 1
        `, viewerId ? [viewerId, viewerId, userId] : [userId]);

        if (!rows.length)
            return res.status(404).json({ error: 'User not found' });

        res.json({ success: true, data: rows[0] });
    } catch (e) {
        console.error('[User] getProfile:', e.message);
        res.status(500).json({ error: e.message });
    }
};

// ── GET PROFILE BY USERNAME ────────────────────────────────────────
exports.getProfileByUsername = async (req, res) => {
    try {
        const { username } = req.params;
        const [rows] = await pool.query(
            `SELECT id, username, display_name, bio, website, location,
                    COALESCE(profile_pic, avatar_url, profile_photo) AS profile_pic,
                    is_verified, is_live, followers_count, following_count, posts_count
             FROM users WHERE username = ? LIMIT 1`,
            [username.toLowerCase()]
        );
        if (!rows.length) return res.status(404).json({ error: 'User not found' });
        // Redirect to getProfile logic
        req.params.id = rows[0].id;
        res.json({ success: true, data: rows[0] });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// ── UPDATE PROFILE ────────────────────────────────────────────────
exports.updateProfile = async (req, res) => {
    try {
        const { username, display_name, bio, website, location } = req.body;
        const userId = req.user.id;
        let profilePicUrl = null;

        // Handle Cloudinary upload via multer memoryStorage
        if (req.file) {
            const result = await new Promise((resolve, reject) => {
                const stream = cloudinary.uploader.upload_stream(
                    {
                        folder:          'blink_avatars',
                        resource_type:   'image',
                        transformation:  [
                            { width: 400, height: 400, crop: 'fill', gravity: 'face' },
                            { quality: 'auto', fetch_format: 'auto' }
                        ]
                    },
                    (err, result) => err ? reject(err) : resolve(result)
                );
                stream.end(req.file.buffer);
            });
            profilePicUrl = result.secure_url;
        }

        const updates = [];
        const params  = [];

        if (username) {
            const clean = username.trim().toLowerCase().replace(/[^a-z0-9_.]/g, '');
            updates.push('username = ?');
            params.push(clean);
        }
        if (display_name !== undefined) { updates.push('display_name = ?'); params.push(display_name); }
        if (bio         !== undefined) { updates.push('bio = ?');          params.push(bio); }
        if (website     !== undefined) { updates.push('website = ?');      params.push(website); }
        if (location    !== undefined) { updates.push('location = ?');     params.push(location); }
        if (profilePicUrl) {
            updates.push('profile_pic = ?', 'avatar_url = ?', 'profile_photo = ?');
            params.push(profilePicUrl, profilePicUrl, profilePicUrl);
        }

        if (updates.length > 0) {
            params.push(userId);
            await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
        }

        const [user] = await pool.query(
            'SELECT id, username, display_name, bio, website, location, profile_pic, is_verified FROM users WHERE id = ?',
            [userId]
        );

        res.json({ success: true, data: user[0] });
    } catch (e) {
        console.error('[User] updateProfile:', e.message);
        if (e.code === 'ER_DUP_ENTRY')
            return res.status(409).json({ error: 'Username already taken' });
        res.status(500).json({ error: e.message });
    }
};

// ── FOLLOW ────────────────────────────────────────────────────────
exports.follow = async (req, res) => {
    try {
        const followerId  = req.user.id;
        const followingId = parseInt(req.params.id, 10);

        if (followerId === followingId)
            return res.status(400).json({ error: 'You cannot follow yourself' });

        const [existing] = await pool.query(
            'SELECT id FROM followers WHERE follower_id = ? AND following_id = ?',
            [followerId, followingId]
        );

        if (existing.length > 0) {
            // Unfollow
            await pool.query(
                'DELETE FROM followers WHERE follower_id = ? AND following_id = ?',
                [followerId, followingId]
            );
            await pool.query('UPDATE users SET followers_count = GREATEST(followers_count - 1, 0) WHERE id = ?', [followingId]);
            await pool.query('UPDATE users SET following_count = GREATEST(following_count - 1, 0) WHERE id = ?', [followerId]);
            return res.json({ success: true, following: false, message: 'Unfollowed' });
        }

        // Follow
        await pool.query(
            'INSERT INTO followers (follower_id, following_id) VALUES (?, ?)',
            [followerId, followingId]
        );
        await pool.query('UPDATE users SET followers_count = followers_count + 1 WHERE id = ?', [followingId]);
        await pool.query('UPDATE users SET following_count = following_count + 1 WHERE id = ?', [followerId]);

        // Create notification
        await pool.query(
            'INSERT INTO notifications (user_id, actor_id, type, entity_type, entity_id, message) VALUES (?, ?, ?, ?, ?, ?)',
            [followingId, followerId, 'follow', 'user', followerId, 'started following you']
        ).catch(() => {});

        res.json({ success: true, following: true, message: 'Following' });
    } catch (e) {
        console.error('[User] follow:', e.message);
        res.status(500).json({ error: e.message });
    }
};

// ── SEARCH USERS ──────────────────────────────────────────────────
exports.searchUsers = async (req, res) => {
    try {
        const q    = (req.query.q || '').trim();
        const page = Math.max(parseInt(req.query.page || '1', 10), 1);
        const limit = Math.min(parseInt(req.query.limit || '15', 10), 50);
        const offset = (page - 1) * limit;

        if (!q) return res.json({ users: [], total: 0 });

        const [users] = await pool.query(`
            SELECT id, username, display_name, bio,
                   COALESCE(profile_pic, avatar_url, profile_photo) AS profile_photo,
                   is_verified, followers_count, is_live
            FROM users
            WHERE (username LIKE ? OR display_name LIKE ? OR bio LIKE ?)
            ORDER BY followers_count DESC, is_verified DESC
            LIMIT ? OFFSET ?
        `, [`%${q}%`, `%${q}%`, `%${q}%`, limit, offset]);

        res.json({ users });
    } catch (e) {
        console.error('[User] search:', e.message);
        res.status(500).json({ error: e.message });
    }
};

// ── GET FOLLOWERS ─────────────────────────────────────────────────
exports.getFollowers = async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT u.id, u.username, COALESCE(u.profile_pic, u.avatar_url) AS profile_pic,
                   u.is_verified, u.followers_count
            FROM followers f
            JOIN users u ON u.id = f.follower_id
            WHERE f.following_id = ?
            ORDER BY f.created_at DESC
        `, [req.params.id]);
        res.json({ followers: rows });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// ── GET FOLLOWING ─────────────────────────────────────────────────
exports.getFollowing = async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT u.id, u.username, COALESCE(u.profile_pic, u.avatar_url) AS profile_pic,
                   u.is_verified, u.followers_count
            FROM followers f
            JOIN users u ON u.id = f.following_id
            WHERE f.follower_id = ?
            ORDER BY f.created_at DESC
        `, [req.params.id]);
        res.json({ following: rows });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// ── GET SUGGESTED USERS ───────────────────────────────────────────
exports.getSuggested = async (req, res) => {
    try {
        const userId = req.user?.id;
        const [rows] = await pool.query(`
            SELECT id, username, display_name,
                   COALESCE(profile_pic, avatar_url) AS profile_pic,
                   is_verified, followers_count
            FROM users
            WHERE id != ?
            AND id NOT IN (
                SELECT following_id FROM followers WHERE follower_id = ?
            )
            ORDER BY followers_count DESC, RAND()
            LIMIT 10
        `, [userId || 0, userId || 0]);
        res.json({ users: rows });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// ── GET USER POSTS ────────────────────────────────────────────────
exports.getUserPosts = async (req, res) => {
    try {
        const page   = Math.max(parseInt(req.query.page || '1', 10), 1);
        const limit  = Math.min(parseInt(req.query.limit || '12', 10), 50);
        const offset = (page - 1) * limit;

        const [posts] = await pool.query(`
            SELECT id, media_url, thumbnail_url, media_type, caption,
                   likes_count, comments_count, views_count, created_at
            FROM posts
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
        `, [req.params.id, limit, offset]);

        res.json({ posts });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};
