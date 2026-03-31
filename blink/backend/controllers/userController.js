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

// ── TASK 3: ADVANCED PROFILE ENGINE (v6.0) ──────────────────
exports.getUser = async (req, res) => {
  try {
    // Priority: Explicit ID (View Other) > Auth ID (View Self)
    const targetUserId = req.params.id || req.user?.id;

    if (!targetUserId) {
      return res.status(401).json({ error: true, message: 'Identity pulse missing.' });
    }

    const [rows] = await pool.query(
      `SELECT 
        u.id, 
        u.username, 
        u.profile_pic,
        u.created_at,
        (SELECT COUNT(*) FROM videos WHERE user_id = u.id) AS posts_count,
        (SELECT COUNT(*) FROM followers WHERE following_id = u.id) AS followers_count,
        (SELECT COUNT(*) FROM followers WHERE follower_id = u.id) AS following_count,
        'Member of the Blink universe since ' + DATE_FORMAT(u.created_at, '%M %Y') AS bio
      FROM users u
      WHERE u.id = ?`,
      [targetUserId]
    );

    if (!rows.length) {
        return res.status(404).json({ error: true, message: 'Universe inhabitant not found.' });
    }

    res.json({ success: true, data: rows[0] });

  } catch (err) {
    console.error('❌ PROFILE ENGINE ERROR:', err.message);
    res.status(500).json({ error: true, message: 'Failed to synchronize user universe.' });
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
