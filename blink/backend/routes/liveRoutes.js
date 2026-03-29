/**
 * routes/live.js
 * ═══════════════════════════════════════════════════════════════════════════════
 * Live Streaming Routes (Real-time via Socket.io + REST endpoints for state)
 * ═══════════════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const { protect, optionalAuth } = require('../middleware/auth');
const pool = require('../config/db');

// ════════════════════════════════════════════════════════════════════════════════
// GET ACTIVE LIVE STREAMS
// ════════════════════════════════════════════════════════════════════════════════
router.get('/active', optionalAuth, async (req, res) => {
    try {
        const [streams] = await pool.query(`
            SELECT ls.*, u.username, u.display_name, u.profile_pic,
                   (SELECT COUNT(*) FROM live_viewers WHERE live_stream_id = ls.id) as viewer_count
            FROM live_streams ls
            JOIN users u ON ls.user_id = u.id
            WHERE ls.status = 'LIVE'
            ORDER BY ls.started_at DESC
        `);

        res.json({ success: true, streams });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ════════════════════════════════════════════════════════════════════════════════
// GET STREAM BY ID
// ════════════════════════════════════════════════════════════════════════════════
router.get('/:streamId', optionalAuth, async (req, res) => {
    try {
        const { streamId } = req.params;

        const [streams] = await pool.query(`
            SELECT ls.*, u.username, u.display_name, u.profile_pic,
                   (SELECT COUNT(*) FROM live_viewers WHERE live_stream_id = ls.id) as viewer_count
            FROM live_streams ls
            JOIN users u ON ls.user_id = u.id
            WHERE ls.id = ?
        `, [streamId]);

        if (!streams[0]) {
            return res.status(404).json({ error: 'Stream not found.' });
        }

        res.json({ success: true, stream: streams[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ════════════════════════════════════════════════════════════════════════════════
// GET USER STREAMS
// ════════════════════════════════════════════════════════════════════════════════
router.get('/user/:username', async (req, res) => {
    try {
        const { username } = req.params;

        const [user] = await pool.query('SELECT id FROM users WHERE username = ?', [username]);
        if (!user.length) {
            return res.status(404).json({ error: 'User not found.' });
        }

        const [streams] = await pool.query(`
            SELECT * FROM live_streams
            WHERE user_id = ?
            ORDER BY started_at DESC
            LIMIT 20
        `, [user[0].id]);

        res.json({ success: true, streams });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ════════════════════════════════════════════════════════════════════════════════
// STREAM HISTORY
// ════════════════════════════════════════════════════════════════════════════════
router.get('/history/:username', async (req, res) => {
    try {
        const { username } = req.params;
        const limit = parseInt(req.query.limit) || 20;
        const offset = parseInt(req.query.offset) || 0;

        const [user] = await pool.query('SELECT id FROM users WHERE username = ?', [username]);
        if (!user.length) {
            return res.status(404).json({ error: 'User not found.' });
        }

        const [streams] = await pool.query(`
            SELECT * FROM live_streams
            WHERE user_id = ? AND status = 'ENDED'
            ORDER BY ended_at DESC
            LIMIT ? OFFSET ?
        `, [user[0].id, limit, offset]);

        res.json({ success: true, streams });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
