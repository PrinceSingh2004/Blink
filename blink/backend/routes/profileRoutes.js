/**
 * routes/profile.js
 * ═══════════════════════════════════════════════════════════
 * Blink Profile System — Expert Backend
 * Implementation: Instagram/TikTok parity
 * Security: JWT Protected, Input Validation, Sharp Processing
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const router  = express.Router();
const db      = require('../config/db');
const sharp   = require('sharp');
const { requireAuth } = require('../middleware/authMiddleware');
const { uploadAvatar } = require('../middleware/uploadMiddleware');
const { uploadToCloudinary, deleteFromCloudinary } = require('../config/cloudinary');

// ── Completion Score Logic ───────────────────────────────────
const calculateCompletion = (u) => {
    let score = 0;
    if (u.profile_pic)      score += 10;
    if (u.full_name)        score += 10;
    if (u.bio)              score += 10;
    if (u.location)         score += 10;
    if (u.website)          score += 10;
    if (u.profession)       score += 10;
    if (u.skills)           score += 10;
    if (u.social_instagram || u.social_youtube || u.social_twitter) score += 10;
    if (u.cover_photo)      score += 10;
    // +10 for having at least one service/post
    if (u.post_count > 0)   score += 10;
    return Math.min(score, 100);
};

// ── GET PROFILE BY USERNAME ──────────────────────────────────
router.get('/:username', async (req, res) => {
    try {
        const { username } = req.params;
        const viewerId     = req.user ? req.user.id : null;

        const [rows] = await db.query(
            "SELECT * FROM users WHERE username = ?",
            [username.toLowerCase()]
        );

        if (!rows.length) return res.status(404).json({ error: 'User not found' });

        const u = rows[0];
        const isOwner = viewerId === u.id;

        // Check if blocked
        if (viewerId && !isOwner) {
            const [block] = await db.query(
                "SELECT id FROM user_blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)",
                [viewerId, u.id, u.id, viewerId]
            );
            if (block.length) return res.status(403).json({ error: 'This content is not available' });
        }

        // Check follow status (if logged in)
        let isFollowing = false;
        if (viewerId && !isOwner) {
            const [follow] = await db.query(
                "SELECT id FROM followers WHERE follower_id = ? AND following_id = ?",
                [viewerId, u.id]
            );
            isFollowing = follow.length > 0;
        }

        // Privacy Logic
        if (u.is_private && !isOwner && !isFollowing) {
            return res.json({
                user: {
                    id: u.id,
                    username: u.username,
                    full_name: u.full_name,
                    profile_pic: u.profile_pic || u.profile_photo,
                    is_verified: u.is_verified,
                    is_private: true,
                    follower_count: u.follower_count,
                    following_count: u.following_count,
                    post_count: u.post_count
                },
                is_following: false,
                is_own_profile: false
            });
        }

        // Fetch recent posts
        const [posts] = await db.query(
            "SELECT id, video_url, thumbnail_url, view_count FROM videos WHERE user_id = ? ORDER BY created_at DESC LIMIT 9",
            [u.id]
        );

        // Increment Views
        if (!isOwner) {
            await db.query("UPDATE users SET profile_views = profile_views + 1 WHERE id = ?", [u.id]);
        }

        const { password_hash, ...safeUser } = u;
        res.json({
            user: safeUser,
            posts,
            is_following: isFollowing,
            is_own_profile: isOwner
        });

    } catch (err) {
        console.error('[Profile] GET Error:', err.message);
        res.status(500).json({ error: 'Server error' });
    }
});

// ── GET ME (OWN DATA) ────────────────────────────────────────
router.get('/me', requireAuth, async (req, res) => {
    try {
        const [rows] = await db.query("SELECT * FROM users WHERE id = ?", [req.user.id]);
        if (!rows.length) return res.status(404).json({ error: 'User not found' });

        const u = rows[0];
        const score = calculateCompletion(u);
        const tips = [];
        if (!u.profile_pic) tips.push({ msg: "Add a profile photo", score: 10 });
        if (!u.bio)         tips.push({ msg: "Write a short bio", score: 10 });
        if (!u.skills)      tips.push({ msg: "Add your skills", score: 10 });

        const { password_hash, ...safeUser } = u;
        res.json({ user: safeUser, score, tips });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── UPDATE PROFILE FIELDS ────────────────────────────────────
router.put('/update', requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const b = req.body;

        const updates = [];
        const params  = [];

        // Validation for critical fields
        if (b.username) {
            const cleanUser = b.username.toLowerCase().trim().replace(/\s/g, '');
            if (cleanUser.length < 3) return res.status(400).json({ error: 'Username too short' });
            updates.push('username = ?');
            params.push(cleanUser);
        }

        const fields = [
            'full_name', 'bio', 'website', 'location', 'profession', 'company',
            'skills', 'pronouns', 'gender', 'languages', 'experience_years',
            'social_instagram', 'social_youtube', 'social_twitter', 'social_linkedin',
            'social_whatsapp', 'social_telegram', 'social_facebook',
            'show_online_status', 'is_private', 'account_type'
        ];

        fields.forEach(f => {
            if (b[f] !== undefined) {
                updates.push(`${f} = ?`);
                params.push(b[f]);
            }
        });

        if (updates.length) {
            params.push(userId);
            await db.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
        }

        // Recalculate score
        const [u] = await db.query("SELECT * FROM users WHERE id = ?", [userId]);
        const score = calculateCompletion(u[0]);
        await db.query("UPDATE users SET profile_complete_score = ? WHERE id = ?", [score, userId]);

        res.json({ success: true, message: 'Profile updated', score });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── UPLOAD COVER PHOTO ───────────────────────────────────────
router.post('/upload-cover', requireAuth, uploadAvatar, async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No image provided' });

        const buffer = await sharp(req.file.buffer)
            .resize(1080, 360, { fit: 'cover' })
            .webp({ quality: 80 })
            .toBuffer();

        const result = await uploadToCloudinary(buffer, { folder: 'blink/covers' });
        
        // Cleanup old
        const [current] = await db.query("SELECT cover_public_id FROM users WHERE id = ?", [req.user.id]);
        if (current[0]?.cover_public_id) {
            await deleteFromCloudinary(current[0].cover_public_id);
        }

        await db.query("UPDATE users SET cover_photo = ?, cover_public_id = ? WHERE id = ?", [
            result.secure_url, result.public_id, req.user.id
        ]);

        res.json({ success: true, url: result.secure_url });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
