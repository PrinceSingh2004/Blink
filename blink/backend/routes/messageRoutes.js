/**
 * routes/messages.js
 * ═══════════════════════════════════════════════════════════════════════════════
 * Real-time Messaging Routes
 * ═══════════════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');

// Routes - Real-time messaging handled via Socket.io
// These endpoints are for retrieving message history

router.get('/conversation/:userId', protect, async (req, res) => {
    try {
        const { userId } = req.params;
        const limit = parseInt(req.query.limit) || 50;
        const offset = parseInt(req.query.offset) || 0;
        const currentUserId = req.user.id;

        const pool = require('../config/db');
        const [messages] = await pool.query(`
            SELECT * FROM messages
            WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
        `, [currentUserId, userId, userId, currentUserId, limit, offset]);

        res.json({ success: true, messages: messages.reverse() });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/list', protect, async (req, res) => {
    try {
        const pool = require('../config/db');
        const [conversations] = await pool.query(`
            SELECT DISTINCT 
                CASE 
                    WHEN sender_id = ? THEN receiver_id 
                    ELSE sender_id 
                END as user_id,
                MAX(created_at) as last_message_time
            FROM messages
            WHERE sender_id = ? OR receiver_id = ?
            GROUP BY user_id
            ORDER BY last_message_time DESC
            LIMIT 50
        `, [req.user.id, req.user.id, req.user.id]);

        res.json({ success: true, conversations });
    } catch (err)  {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
