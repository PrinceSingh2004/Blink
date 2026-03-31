const pool = require('../config/db');

exports.getProfile = async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT id, username, email, profile_pic, created_at FROM users WHERE id = ?',
            [req.user.id]
        );
        res.json({ success: true, user: rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ── TASK 3: FIX getUser controller (v6.0 Fix) ────────────────
exports.getUser = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        error: true,
        message: 'Not authenticated'
      });
    }

    const [rows] = await pool.query(
      `SELECT 
        id, 
        username, 
        profile_pic,
        created_at,
        (SELECT COUNT(*) FROM videos WHERE user_id = u.id) AS posts_count,
        0 AS followers_count,
        0 AS following_count,
        'Experience the universe through Blink.' AS bio
      FROM users u
      WHERE id = ?`,
      [userId]
    );

    if (!rows.length) {
      return res.status(404).json({
        error: true,
        message: 'User not found'
      });
    }

    res.json({ success: true, data: rows[0] });

  } catch (err) {
    console.error('❌ getUser:', err.message);
    res.status(500).json({
      error: true,
      message: 'Failed to load profile'
    });
  }
};

exports.updateProfile = async (req, res) => {
    try {
        const { profile_pic } = req.body; // URL from Cloudinary
        await pool.execute('UPDATE users SET profile_pic = ? WHERE id = ?', [profile_pic, req.user.id]);
        res.json({ success: true, message: "Profile updated" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
