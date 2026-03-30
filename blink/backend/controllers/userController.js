/**
 * controllers/userController.js – Blink User Management
 * ═══════════════════════════════════════════════════════════════════════════════
 * Profile, Follow, Search, Avatar/Cover Upload
 * ═══════════════════════════════════════════════════════════════════════════════
 */

const pool = require('../config/db');
const multer = require('multer');

// ── Safe Cloudinary Import ──────────────────────────────────────────────────────
let cloudinary = null;
try {
    const cfg = require('../config/cloudinary');
    cloudinary = cfg.cloudinary || cfg;
} catch (err) {
    console.warn('[User] Cloudinary not configured:', err.message);
}

// ── Multer Memory Storage (exported for routes) ─────────────────────────────────
const uploadMiddleware = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'), false);
        }
    }
});

// ════════════════════════════════════════════════════════════════════════════════
// GET USER (own profile — requires auth)
// ════════════════════════════════════════════════════════════════════════════════
const getUser = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ error: 'Not authenticated' });

        const [rows] = await pool.query(
            `SELECT id, username, display_name, bio, website, location,
                    COALESCE(profile_pic, avatar_url) AS profile_pic,
                    cover_pic, is_verified, is_live,
                    followers_count, following_count, posts_count,
                    created_at
             FROM users WHERE id = ?`,
            [userId]
        );

        if (!rows.length) return res.status(404).json({ error: 'User not found' });
        res.json({ success: true, data: rows[0] });
    } catch (err) {
        console.error('[User] getUser:', err.message);
        res.status(500).json({ error: err.message });
    }
};

// ════════════════════════════════════════════════════════════════════════════════
// GET USER PROFILE (public — by username)
// ════════════════════════════════════════════════════════════════════════════════
const getUserProfile = async (req, res) => {
    try {
        const { username } = req.params;
        if (!username) return res.status(400).json({ error: 'Username is required' });

        const [rows] = await pool.query(
            `SELECT id, username, display_name, bio, website, location,
                    COALESCE(profile_pic, avatar_url) AS profile_pic,
                    cover_pic, is_verified, is_live,
                    followers_count, following_count, posts_count,
                    created_at
             FROM users WHERE username = ?`,
            [username.toLowerCase()]
        );

        if (!rows.length) return res.status(404).json({ error: 'Profile not found' });
        res.json({ success: true, data: rows[0] });
    } catch (err) {
        console.error('[User] getUserProfile:', err.message);
        res.status(500).json({ error: err.message });
    }
};

// ════════════════════════════════════════════════════════════════════════════════
// UPDATE PROFILE (text fields only)
// ════════════════════════════════════════════════════════════════════════════════
const updateProfile = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ error: 'Not authenticated' });

        const { display_name, bio, website, location } = req.body;

        const updates = [];
        const params = [];

        if (display_name !== undefined) { updates.push('display_name = ?'); params.push(display_name); }
        if (bio !== undefined) { updates.push('bio = ?'); params.push(bio); }
        if (website !== undefined) { updates.push('website = ?'); params.push(website); }
        if (location !== undefined) { updates.push('location = ?'); params.push(location); }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields provided to update' });
        }

        params.push(userId);
        await pool.execute(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);

        // Return updated user
        const [user] = await pool.query(
            `SELECT id, username, display_name, bio, website, location,
                    COALESCE(profile_pic, avatar_url) AS profile_pic,
                    is_verified
             FROM users WHERE id = ?`,
            [userId]
        );

        res.json({ success: true, message: 'Profile updated', data: user[0] });
    } catch (err) {
        console.error('[User] updateProfile:', err.message);
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'Username already taken' });
        }
        res.status(500).json({ error: err.message });
    }
};

// ════════════════════════════════════════════════════════════════════════════════
// UPLOAD AVATAR (profile picture)
// ════════════════════════════════════════════════════════════════════════════════
const updateProfilePic = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ error: 'Not authenticated' });
        if (!req.file) return res.status(400).json({ error: 'No image file provided' });

        if (!cloudinary) {
            return res.status(503).json({ error: 'Image upload service not configured' });
        }

        // Upload to Cloudinary using upload_stream (works with memoryStorage)
        const result = await new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
                {
                    folder: 'blink/avatars',
                    public_id: `avatar_${userId}_${Date.now()}`,
                    resource_type: 'image',
                    transformation: [
                        { width: 400, height: 400, crop: 'fill', gravity: 'face' },
                        { quality: 'auto', fetch_format: 'auto' }
                    ]
                },
                (error, result) => {
                    if (error) reject(error);
                    else resolve(result);
                }
            );
            stream.end(req.file.buffer);
        });

        // Update all avatar columns for compatibility
        await pool.execute(
            `UPDATE users SET profile_pic = ?, avatar_url = ? WHERE id = ?`,
            [result.secure_url, result.secure_url, userId]
        );

        res.json({ success: true, url: result.secure_url });
    } catch (err) {
        console.error('[User] updateProfilePic:', err.message);
        res.status(500).json({ error: err.message });
    }
};

// ════════════════════════════════════════════════════════════════════════════════
// UPLOAD COVER PHOTO
// ════════════════════════════════════════════════════════════════════════════════
const updateCoverPic = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ error: 'Not authenticated' });
        if (!req.file) return res.status(400).json({ error: 'No image file provided' });

        if (!cloudinary) {
            return res.status(503).json({ error: 'Image upload service not configured' });
        }

        const result = await new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
                {
                    folder: 'blink/covers',
                    public_id: `cover_${userId}_${Date.now()}`,
                    resource_type: 'image',
                    transformation: [
                        { width: 1080, height: 360, crop: 'fill' },
                        { quality: 'auto', fetch_format: 'auto' }
                    ]
                },
                (error, result) => {
                    if (error) reject(error);
                    else resolve(result);
                }
            );
            stream.end(req.file.buffer);
        });

        await pool.execute(
            'UPDATE users SET cover_pic = ? WHERE id = ?',
            [result.secure_url, userId]
        );

        res.json({ success: true, url: result.secure_url });
    } catch (err) {
        console.error('[User] updateCoverPic:', err.message);
        res.status(500).json({ error: err.message });
    }
};

// ════════════════════════════════════════════════════════════════════════════════
// FOLLOW USER
// ════════════════════════════════════════════════════════════════════════════════
const followUser = async (req, res) => {
    try {
        const followerId = req.user?.id;
        if (!followerId) return res.status(401).json({ error: 'Not authenticated' });

        const followingId = parseInt(req.params.userId, 10);

        // Self-follow guard
        if (followerId === followingId) {
            return res.status(400).json({ error: 'You cannot follow yourself' });
        }

        // Check if already following (toggle behavior)
        const [existing] = await pool.query(
            'SELECT id FROM followers WHERE follower_id = ? AND following_id = ?',
            [followerId, followingId]
        );

        if (existing.length > 0) {
            // Already following — unfollow instead
            await pool.execute(
                'DELETE FROM followers WHERE follower_id = ? AND following_id = ?',
                [followerId, followingId]
            );
            await pool.execute('UPDATE users SET followers_count = GREATEST(followers_count - 1, 0) WHERE id = ?', [followingId]);
            await pool.execute('UPDATE users SET following_count = GREATEST(following_count - 1, 0) WHERE id = ?', [followerId]);
            return res.json({ success: true, following: false, message: 'Unfollowed' });
        }

        // Follow
        await pool.execute(
            'INSERT INTO followers (follower_id, following_id) VALUES (?, ?)',
            [followerId, followingId]
        );
        await pool.execute('UPDATE users SET followers_count = followers_count + 1 WHERE id = ?', [followingId]);
        await pool.execute('UPDATE users SET following_count = following_count + 1 WHERE id = ?', [followerId]);

        res.json({ success: true, following: true, message: 'Following' });
    } catch (err) {
        console.error('[User] followUser:', err.message);
        res.status(500).json({ error: err.message });
    }
};

// ════════════════════════════════════════════════════════════════════════════════
// UNFOLLOW USER
// ════════════════════════════════════════════════════════════════════════════════
const unfollowUser = async (req, res) => {
    try {
        const followerId = req.user?.id;
        if (!followerId) return res.status(401).json({ error: 'Not authenticated' });

        const followingId = parseInt(req.params.userId, 10);

        await pool.execute(
            'DELETE FROM followers WHERE follower_id = ? AND following_id = ?',
            [followerId, followingId]
        );
        await pool.execute('UPDATE users SET followers_count = GREATEST(followers_count - 1, 0) WHERE id = ?', [followingId]);
        await pool.execute('UPDATE users SET following_count = GREATEST(following_count - 1, 0) WHERE id = ?', [followerId]);

        res.json({ success: true, following: false, message: 'Unfollowed' });
    } catch (err) {
        console.error('[User] unfollowUser:', err.message);
        res.status(500).json({ error: err.message });
    }
};

// ════════════════════════════════════════════════════════════════════════════════
// SEARCH USERS
// ════════════════════════════════════════════════════════════════════════════════
const searchUsers = async (req, res) => {
    try {
        const q = (req.query.q || '').trim();

        if (!q) {
            return res.json({ success: true, users: [] });
        }

        const [rows] = await pool.query(
            `SELECT id, username, display_name,
                    COALESCE(profile_pic, avatar_url) AS profile_pic,
                    is_verified, followers_count
             FROM users
             WHERE username LIKE ? OR display_name LIKE ?
             ORDER BY followers_count DESC
             LIMIT 20`,
            [`%${q}%`, `%${q}%`]
        );

        res.json({ success: true, users: rows });
    } catch (err) {
        console.error('[User] searchUsers:', err.message);
        res.status(500).json({ error: err.message });
    }
};

// ════════════════════════════════════════════════════════════════════════════════
// GET FOLLOWERS (paginated)
// ════════════════════════════════════════════════════════════════════════════════
const getFollowers = async (req, res) => {
    try {
        const { userId } = req.params;
        const page = Math.max(parseInt(req.query.page || '1', 10), 1);
        const limit = Math.min(parseInt(req.query.limit || '20', 10), 50);
        const offset = (page - 1) * limit;

        const [rows] = await pool.query(
            `SELECT u.id, u.username, u.display_name,
                    COALESCE(u.profile_pic, u.avatar_url) AS profile_pic,
                    u.is_verified, u.followers_count
             FROM followers f
             JOIN users u ON u.id = f.follower_id
             WHERE f.following_id = ?
             ORDER BY f.created_at DESC
             LIMIT ? OFFSET ?`,
            [userId, limit, offset]
        );

        res.json({ success: true, followers: rows });
    } catch (err) {
        console.error('[User] getFollowers:', err.message);
        res.status(500).json({ error: err.message });
    }
};

// ════════════════════════════════════════════════════════════════════════════════
// GET FOLLOWING (paginated)
// ════════════════════════════════════════════════════════════════════════════════
const getFollowing = async (req, res) => {
    try {
        const { userId } = req.params;
        const page = Math.max(parseInt(req.query.page || '1', 10), 1);
        const limit = Math.min(parseInt(req.query.limit || '20', 10), 50);
        const offset = (page - 1) * limit;

        const [rows] = await pool.query(
            `SELECT u.id, u.username, u.display_name,
                    COALESCE(u.profile_pic, u.avatar_url) AS profile_pic,
                    u.is_verified, u.followers_count
             FROM followers f
             JOIN users u ON u.id = f.following_id
             WHERE f.follower_id = ?
             ORDER BY f.created_at DESC
             LIMIT ? OFFSET ?`,
            [userId, limit, offset]
        );

        res.json({ success: true, following: rows });
    } catch (err) {
        console.error('[User] getFollowing:', err.message);
        res.status(500).json({ error: err.message });
    }
};

// ════════════════════════════════════════════════════════════════════════════════
// CHECK FOLLOW STATUS
// ════════════════════════════════════════════════════════════════════════════════
const checkFollowStatus = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ error: 'Not authenticated' });

        const [rows] = await pool.query(
            'SELECT 1 FROM followers WHERE follower_id = ? AND following_id = ?',
            [userId, req.params.userId]
        );

        res.json({ success: true, following: rows.length > 0 });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ════════════════════════════════════════════════════════════════════════════════
// DELETE ACCOUNT (soft delete)
// ════════════════════════════════════════════════════════════════════════════════
const deleteAccount = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ error: 'Not authenticated' });

        await pool.execute('UPDATE users SET is_active = FALSE WHERE id = ?', [userId]);
        res.json({ success: true, message: 'Account deactivated' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ════════════════════════════════════════════════════════════════════════════════
// EXPORT — Every function used in routes MUST be listed here
// ════════════════════════════════════════════════════════════════════════════════
module.exports = {
    getUser,
    getUserProfile,
    updateProfile,
    updateProfilePic,
    updateCoverPic,
    followUser,
    unfollowUser,
    searchUsers,
    getFollowers,
    getFollowing,
    checkFollowStatus,
    deleteAccount,
    uploadMiddleware
};
