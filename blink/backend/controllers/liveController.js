const db = require('../config/db');

// ─── START LIVE (Simple WebRTC — no stream keys / HLS) ────────
exports.startLive = async (req, res) => {
    try {
        const { title } = req.body;
        
        // End any existing live streams for this user
        await db.query(
            'UPDATE live_streams SET status = "ended", ended_at = NOW(), viewer_count = 0 WHERE user_id = ? AND status = "live"',
            [req.user.id]
        );

        // Create new stream record
        const [result] = await db.query(
            'INSERT INTO live_streams (user_id, title, status, viewer_count, started_at) VALUES (?, ?, "live", 0, NOW())',
            [req.user.id, title || 'Live Session']
        );

        // Update user status
        await db.query('UPDATE users SET is_live = 1 WHERE id = ?', [req.user.id]);

        const io = req.app.get('io');
        if (io) io.emit('live_discovery_update');

        res.json({ message: 'Stream started', stream_id: result.insertId });
    } catch (err) {
        console.error('[Live] start:', err.message);
        res.status(500).json({ error: 'Failed to start stream' });
    }
};

// ─── END LIVE ─────────────────────────────────────────────────
exports.endLive = async (req, res) => {
    try {
        const [streams] = await db.query(
            'SELECT id FROM live_streams WHERE user_id = ? AND status = "live"',
            [req.user.id]
        );

        await db.query(
            'UPDATE live_streams SET status = "ended", ended_at = NOW(), viewer_count = 0 WHERE user_id = ? AND status = "live"',
            [req.user.id]
        );
        await db.query('DELETE FROM live_viewers WHERE stream_id IN (SELECT id FROM live_streams WHERE user_id = ?)', [req.user.id]);
        await db.query('UPDATE users SET is_live = 0 WHERE id = ?', [req.user.id]);

        const io = req.app.get('io');
        if (io && streams.length) {
            streams.forEach(s => {
                const room = `live_${s.id}`;
                io.to(room).emit('live_ended', { by: req.user.username });
                io.to(room).emit('viewer_update', { count: 0 });
            });
            io.emit('live_discovery_update');
        }

        res.json({ message: 'Stream ended' });
    } catch (err) {
        console.error('[Live] endLive error:', err.message);
        res.status(500).json({ error: 'Failed to end stream' });
    }
};

// ─── GET LIVE NOW (for discovery) ──────────────────────────────
exports.getLiveNow = async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT ls.id as stream_id, ls.title as stream_title, 
                    u.id as user_id, u.username, u.profile_photo, ls.viewer_count
             FROM live_streams ls
             JOIN users u ON ls.user_id = u.id
             WHERE ls.status = 'live' AND u.is_live = 1
             ORDER BY ls.started_at DESC`
        );
        res.json({ streams: rows });
    } catch (err) {
        console.error('[Live] getLiveNow:', err.message);
        res.status(500).json({ error: 'Server error' });
    }
};

// ─── GET STREAM DETAILS ──────────────────────────────────────
exports.getStreamDetails = async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT ls.*, u.username, u.profile_photo 
             FROM live_streams ls
             JOIN users u ON ls.user_id = u.id
             WHERE ls.id = ?`,
            [req.params.id]
        );
        if (!rows.length) return res.status(404).json({ error: 'Stream not found' });
        res.json({ stream: rows[0] });
    } catch (err) {
        console.error('[Live] getStreamDetails:', err.message);
        res.status(500).json({ error: 'Server error' });
    }
};

// ─── GET CHAT HISTORY ────────────────────────────────────────
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
        console.error('[Live] getChatHistory:', err.message);
        res.status(500).json({ error: 'Server error' });
    }
};
