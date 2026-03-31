const pool = require('../config/db');
const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');

/**
 * @route   POST /api/posts
 * @desc    Upload video to Cloudinary and save to MySQL
 * @access  Private
 */
// ── TASK 3 & 4: FIX VIDEO UPLOAD & FEED ──────────────────────
exports.createPost = async (req, res) => {
    console.log("🚀 [Blink] Starting Advanced Upload Sequence...");
    try {
        const { caption, hashtags } = req.body;
        const userId = req.user.id; 

        if (!req.file) {
            return res.status(400).json({ success: false, error: "Missing scene file." });
        }

        // --- SMART: DUPLICATE DETECTION ---
        const [existing] = await pool.query(
            "SELECT id FROM videos WHERE user_id = ? AND caption = ? AND created_at > (NOW() - INTERVAL 5 MINUTE)",
            [userId, caption || '']
        );
        if (existing.length > 0) {
            return res.status(400).json({ success: false, error: "Duplicate upload detected. Space-time rift prevented." });
        }

        // Cloudinary Stream Upload
        const streamUpload = (buffer) => {
            return new Promise((resolve, reject) => {
                const stream = cloudinary.uploader.upload_stream(
                    {
                        resource_type: "video",
                        folder: "blink_production",
                        format: "mp4",
                        image_metadata: true
                    },
                    (error, result) => {
                        if (result) resolve(result);
                        else reject(error);
                    }
                );
                streamifier.createReadStream(buffer).pipe(stream);
            });
        };

        const result = await streamUpload(req.file.buffer);
        console.log("✅ Cloudinary Insight:", result.secure_url, "Duration:", result.duration);

        // Standardized Insert (Production Schema)
        const [dbResult] = await pool.execute(
            `INSERT INTO videos 
                (user_id, video_url, thumbnail_url, caption, hashtags, duration, created_at) 
             VALUES (?, ?, ?, ?, ?, ?, NOW())`,
            [
                userId, 
                result.secure_url, 
                result.thumbnail_url || result.secure_url.replace('.mp4', '.jpg'), 
                caption || 'Untitled Blink', 
                hashtags || '#foryou #trending',
                result.duration || 0
            ]
        );

        console.log("✅ Database Insight Created ID:", dbResult.insertId);

        return res.status(201).json({
            success: true,
            video: {
                id: dbResult.insertId,
                video_url: result.secure_url,
                caption: caption || '',
                duration: result.duration
            }
        });

    } catch (err) {
        console.error("❌ COMPONENT FAILURE (Upload):", err);
        return res.status(500).json({ success: false, error: "Universe synchronization failed. " + err.message });
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
