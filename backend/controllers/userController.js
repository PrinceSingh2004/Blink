/**
 * controllers/userController.js
 * ═══════════════════════════════════════════════════════════
 * Blink — User & Profile Controller
 * Implementation: Sharp Resizing, Cloudinary Stream,
 *                 Persistence Tracking, Follow/Unfollow
 * ═══════════════════════════════════════════════════════════ */

const db = require('../config/db');
const sharp = require('sharp');
const cloudinary = require('../config/cloudinary');
const streamifier = require('streamifier');

// ── GET PROFILE ──────────────────────────────────────────────
exports.getProfile = async (req, res) => {
    try {
        const { id } = req.params;
        const [rows] = await db.query(
            "SELECT id, username, bio, COALESCE(profile_pic, profile_photo) as profile_pic, follower_count, following_count FROM users WHERE id = ?",
            [id]
        );
        if (!rows.length) return res.status(404).json({ error: "User not found" });
        res.json({ success: true, user: rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ── UPDATE PROFILE (AVATAR + TEXT) ───────────────────────────
exports.updateAvatar = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: "No image provided" });

        // Step 1: Optimize with Sharp (Mobile-Friendly Buffer)
        const optimizedBuffer = await sharp(req.file.buffer)
            .resize(300, 300, { fit: 'cover' })
            .webp({ quality: 70 })
            .toBuffer();

        // Step 2: Streamify to Cloudinary (Production standard)
        const uploadStream = cloudinary.uploader.upload_stream(
            { folder: "blink/avatars", public_id: `user_${req.user.id}` },
            async (error, result) => {
                if (error) return res.status(500).json({ error: "Upload failed" });

                // Step 3: MySQL Persistence
                await db.query(
                    "UPDATE users SET profile_pic = ?, profile_photo = ? WHERE id = ?",
                    [result.secure_url, result.secure_url, req.user.id]
                );

                res.json({ success: true, url: result.secure_url });
            }
        );

        streamifier.createReadStream(optimizedBuffer).pipe(uploadStream);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ── FOLLOW / UNFOLLOW SYSTEM ────────────────────────────────
exports.toggleFollow = async (req, res) => {
    try {
        const followerId = req.user.id;
        const { targetId } = req.body;

        if (followerId == targetId) return res.status(400).json({ error: "Cannot follow yourself" });

        // Check if already following
        const [existing] = await db.query(
            "SELECT * FROM followers WHERE follower_id = ? AND following_id = ?",
            [followerId, targetId]
        );

        if (existing.length) {
            // Unfollow
            await db.query("DELETE FROM followers WHERE follower_id = ? AND following_id = ?", [followerId, targetId]);
            await db.query("UPDATE users SET follower_count = GREATEST(0, follower_count - 1) WHERE id = ?", [targetId]);
            await db.query("UPDATE users SET following_count = GREATEST(0, following_count - 1) WHERE id = ?", [followerId]);
            res.json({ success: true, following: false });
        } else {
            // Follow
            await db.query("INSERT INTO followers (follower_id, following_id) VALUES (?, ?)", [followerId, targetId]);
            await db.query("UPDATE users SET follower_count = follower_count + 1 WHERE id = ?", [targetId]);
            await db.query("UPDATE users SET following_count = following_count + 1 WHERE id = ?", [followerId]);
            res.json({ success: true, following: true });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
