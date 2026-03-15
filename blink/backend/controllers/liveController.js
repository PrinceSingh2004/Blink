const db = require('../config/db');

exports.startLive = async (req, res) => {
    try {
        const { title } = req.body;
        // End any existing live streams for this user just in case
        await db.query('UPDATE live_streams SET status = "offline" WHERE user_id = ? AND status = "live"', [req.user.id]);
        
        // Create new stream record
        const [result] = await db.query(
            'INSERT INTO live_streams (user_id, stream_title) VALUES (?, ?)',
            [req.user.id, title || 'Live Session']
        );
        
        // Update user status
        await db.query('UPDATE users SET is_live = 1 WHERE id = ?', [req.user.id]);
        
        res.json({ message: 'Stream started', stream_id: result.insertId });
    } catch (err) {
        console.error('[Live] start:', err);
        res.status(500).json({ error: 'Failed to start stream' });
    }
};

exports.endLive = async (req, res) => {
    try {
        await db.query('UPDATE live_streams SET status = "offline" WHERE user_id = ? AND status = "live"', [req.user.id]);
        await db.query('UPDATE users SET is_live = 0 WHERE id = ?', [req.user.id]);
        res.json({ message: 'Stream ended' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to end stream' });
    }
};

exports.getLiveNow = async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT ls.id as stream_id, ls.stream_title, u.id as user_id, u.username, u.profile_picture, ls.viewer_count
             FROM live_streams ls
             JOIN users u ON ls.user_id = u.id
             WHERE ls.status = 'live' AND u.is_live = 1
             ORDER BY ls.started_at DESC`
        );
        res.json({ streams: rows });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
};

exports.getStreamDetails = async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT ls.*, u.username, u.profile_picture 
             FROM live_streams ls
             JOIN users u ON ls.user_id = u.id
             WHERE ls.id = ?`,
            [req.params.id]
        );
        if (!rows.length) return res.status(404).json({ error: 'Stream not found' });
        res.json({ stream: rows[0] });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
};

exports.getChatHistory = async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT lc.*, u.username 
             FROM live_chat lc
             JOIN users u ON lc.user_id = u.id
             WHERE lc.stream_id = ?
             ORDER BY lc.created_at ASC LIMIT 100`,
            [req.params.id]
        );
        res.json({ chat: rows });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
};
