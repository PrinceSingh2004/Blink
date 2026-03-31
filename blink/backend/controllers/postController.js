const pool = require('../config/db');
const cloudinary = require('../config/cloudinary');
const fs = require('fs');

/**
 * @route   POST /api/upload/video
 * @desc    Standardized Production Video Upload (Cloudinary Large Support)
 * @access  Private
 */
exports.createPost = async (req, res) => {
    console.log("🚀 [Blink] Initializing Pulse Upload Sequence...");
    const filePath = req.file?.path;
    
    try {
        const { caption, hashtags } = req.body;
        const userId = req.user.id; 

        if (!filePath) {
            return res.status(400).json({ success: false, error: "No video file received." });
        }

        // --- 1. CLOUDINARY UPLOAD (Chunked for Stability) ---
        console.log("📤 Transmitting to Cloudinary...");
        const result = await cloudinary.uploader.upload(filePath, {
            resource_type: "video",
            folder: "blink_production",
            chunk_size: 6000000, // 6MB Chunks for reliability
            eager: [{ width: 400, height: 711, crop: "pad", audio_codec: "none" }],
            eager_async: true
        });

        console.log("✅ Cloudinary Sync Success:", result.public_id);

        // --- 2. GENERATE THUMBNAIL (1 second into the video) ---
        // Cloudinary transformation magic: Seek to 1s (so_1), web-optimized width
        const thumbUrl = result.secure_url
            .replace("/video/upload/", "/video/upload/so_1,w_500,c_fill/")
            .replace(/\.[^/.]+$/, ".jpg"); 

        console.log("📸 Thumbnail generated:", thumbUrl);

        // --- 3. DATABASE PERSISTENCE ---
        const [dbResult] = await pool.execute(
            `INSERT INTO videos 
                (user_id, video_url, public_id, thumbnail_url, caption, hashtags, duration) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                userId, 
                result.secure_url, 
                result.public_id,
                thumbUrl, 
                caption || 'A Blink Moment', 
                hashtags || '#foryou',
                result.duration || 0
            ]
        );

        // Clean up temporary local file
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

        return res.status(201).json({
            success: true,
            id: dbResult.insertId,
            video_url: result.secure_url,
            message: "Scene synchronized successfully!"
        });

    } catch (err) {
        console.error("❌ UPLOAD ENGINE FAILURE:", err);
        // Clean up on failure
        if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
        return res.status(500).json({ success: false, error: "Universe pulse failure: " + err.message });
    }
};

exports.getPosts = async (req, res) => {
    console.log("🔍 Fetching global feed...");
    try {
        const [rows] = await pool.query(
            `SELECT 
                v.id,
                v.user_id,
                v.video_url,
                v.thumbnail_url,
                v.caption,
                v.hashtags,
                v.duration,
                v.views_count,
                v.likes_count,
                v.created_at,
                u.username, 
                u.profile_pic 
             FROM videos v 
             INNER JOIN users u ON v.user_id = u.id 
             WHERE v.is_active = TRUE
             ORDER BY v.created_at DESC 
             LIMIT 50`
        );
        res.json({ success: true, videos: rows });
    } catch (err) {
        console.error("❌ SQL ERROR (/api/videos):", err.message);
        res.status(500).json({ error: "Failed to load moments." });
    }
};

exports.getMyPosts = async (req, res) => {
  const userId = req.user?.id;
  console.log(`🔍 Fetching momentum for user ID: ${userId}`);
  
  if (!userId) return res.status(401).json({ error: "Unauthorized access" });

  try {
    const [posts] = await pool.query(
      `SELECT 
        id, 
        user_id, 
        caption, 
        video_url, 
        thumbnail_url,
        views_count,
        likes_count,
        created_at 
      FROM videos
      WHERE user_id = ?
      ORDER BY created_at DESC`,
      [userId]
    );

    res.json({
      success: true,
      posts: posts
    });

  } catch (err) {
    console.error('❌ SQL ERROR (getMyPosts):', err.message);
    res.status(500).json({ error: "Failed to load individual universe." });
  }
};

// ── TASK 5: INTERACTION & METRICS ────────────────────────────
exports.likeVideo = async (req, res) => {
    try {
        const { id } = req.body;
        const userId = req.user.id;
        
        // Atomic update for persistence
        await pool.execute("UPDATE videos SET likes_count = likes_count + 1 WHERE id = ?", [id]);
        
        // (Optional) Track specific user like link
        // await pool.execute("INSERT IGNORE INTO likes (user_id, video_id) VALUES (?, ?)", [userId, id]);

        res.json({ success: true, message: "Moment liked!" });
    } catch (err) {
        res.status(500).json({ error: "Failed to pulse like." });
    }
};

exports.viewVideo = async (req, res) => {
    try {
        const { id } = req.body;
        await pool.execute("UPDATE videos SET views_count = views_count + 1 WHERE id = ?", [id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Failed to synchronize vision." });
    }
};
