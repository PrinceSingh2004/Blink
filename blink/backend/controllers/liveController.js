/**
 * controllers/liveController.js – Live Streaming
 */
const pool   = require('../db/config');
const crypto = require('crypto');

// ── START LIVE ────────────────────────────────────────────────────
exports.startLive = async (req, res) => {
    try {
        const userId  = req.user.id;
        const { title = 'Live Stream', description = '' } = req.body;
        const streamKey = crypto.randomUUID();

        // End any previous live sessions
        await pool.query(
            'UPDATE live_streams SET is_live = 0, ended_at = NOW() WHERE host_id = ? AND is_live = 1',
            [userId]
        );

        const [result] = await pool.query(
            'INSERT INTO live_streams (host_id, title, description, stream_key) VALUES (?, ?, ?, ?)',
            [userId, title, description, streamKey]
        );

        await pool.query('UPDATE users SET is_live = 1 WHERE id = ?', [userId]);

        res.status(201).json({
            success: true,
            stream: { id: result.insertId, stream_key: streamKey, title }
        });
    } catch (e) {
        console.error('[Live] startLive:', e.message);
        res.status(500).json({ error: e.message });
    }
};

// ── END LIVE ──────────────────────────────────────────────────────
exports.endLive = async (req, res) => {
    try {
        const userId = req.user.id;
        await pool.query(
            'UPDATE live_streams SET is_live = 0, ended_at = NOW() WHERE host_id = ? AND is_live = 1',
            [userId]
        );
        await pool.query('UPDATE users SET is_live = 0 WHERE id = ?', [userId]);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// ── GET LIVE STREAMS ──────────────────────────────────────────────
exports.getLiveStreams = async (req, res) => {
    try {
        const [streams] = await pool.query(`
            SELECT ls.id, ls.title, ls.viewers, ls.started_at,
                   u.id AS host_id, u.username,
                   COALESCE(u.profile_pic, u.avatar_url) AS avatar,
                   u.is_verified
            FROM live_streams ls
            JOIN users u ON u.id = ls.host_id
            WHERE ls.is_live = 1
            ORDER BY ls.viewers DESC
        `);
        res.json({ streams });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// ── GET SINGLE STREAM ─────────────────────────────────────────────
exports.getStream = async (req, res) => {
    try {
        const [[stream]] = await pool.query(`
            SELECT ls.*, u.username,
                   COALESCE(u.profile_pic, u.avatar_url) AS avatar,
                   u.is_verified
            FROM live_streams ls
            JOIN users u ON u.id = ls.host_id
            WHERE ls.id = ?
        `, [req.params.id]);

        if (!stream) return res.status(404).json({ error: 'Stream not found' });
        res.json({ stream });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// ── GET LIVE CHAT HISTORY ─────────────────────────────────────────
exports.getChatHistory = async (req, res) => {
    try {
        const [messages] = await pool.query(`
            SELECT id, user_id, username, text, created_at
            FROM live_chat
            WHERE stream_id = ?
            ORDER BY created_at ASC
            LIMIT 100
        `, [req.params.id]);
        res.json({ messages });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};
