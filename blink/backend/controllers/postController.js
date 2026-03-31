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
    console.log("🚀 [Blink] Starting Video Upload Sequence...");
    try {
        const { caption } = req.body;
        const userId = req.user.id; // From Protect Middleware

        if (!req.file) {
            return res.status(400).json({ success: false, error: "Missing scene file." });
        }

        // Cloudinary Stream Upload
        const streamUpload = (buffer) => {
            return new Promise((resolve, reject) => {
                const stream = cloudinary.uploader.upload_stream(
                    {
                        resource_type: "video",
                        folder: "blink_production",
                        format: "mp4"
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
        console.log("✅ Cloudinary Success:", result.secure_url);

        // Standardized Insert (Production Schema)
        const [dbResult] = await pool.execute(
            `INSERT INTO videos 
                (user_id, video_url, thumbnail_url, caption, created_at) 
             VALUES (?, ?, ?, ?, NOW())`,
            [userId, result.secure_url, result.thumbnail_url || null, caption || '']
        );

        console.log("✅ Database Insight Created ID:", dbResult.insertId);

        return res.status(201).json({
            success: true,
            video: {
                id: dbResult.insertId,
                video_url: result.secure_url,
                caption: caption || ''
            }
        });

    } catch (err) {
        console.error("❌ COMPONENT FAILURE (Upload):", err);
        return res.status(500).json({ success: false, error: "Universe synchronization failed." });
    }
};

exports.getPosts = async (req, res) => {
    console.log("🔍 Fetching global feed...");
    try {
        const [rows] = await pool.query(
            `SELECT 
                v.*, 
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
