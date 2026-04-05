/**
 * controllers/chatController.js — Real-time Messaging
 * ═══════════════════════════════════════════════════
 */

const { pool } = require('../config/db');

/**
 * GET /api/conversations — Get user's chat list
 */
exports.getConversations = async (req, res) => {
    try {
        const userId = req.user.id;

        const [rows] = await pool.query(`
            SELECT 
                c.id, 
                c.created_at,
                u.id AS other_user_id,
                u.username AS other_username,
                u.profile_photo AS other_profile_photo,
                (SELECT text FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_message,
                (SELECT created_at FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_message_at,
                (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id AND sender_id != ? AND seen = 0) AS unread_count
            FROM conversations c
            JOIN users u ON (c.user1_id = u.id OR c.user2_id = u.id)
            WHERE (c.user1_id = ? OR c.user2_id = ?) AND u.id != ?
            ORDER BY last_message_at DESC
        `, [userId, userId, userId, userId]);

        res.json({ success: true, conversations: rows });
    } catch (err) {
        console.error('Get conversations error:', err.message);
        res.status(500).json({ error: 'Failed to load conversations' });
    }
};

/**
 * GET /api/messages/:convId — Get message history
 */
exports.getMessages = async (req, res) => {
    try {
        const userId = req.user.id;
        const convId = req.params.convId;

        // Verify participance
        const [[conv]] = await pool.query(
            'SELECT id FROM conversations WHERE id = ? AND (user1_id = ? OR user2_id = ?)',
            [convId, userId, userId]
        );

        if (!conv) return res.status(403).json({ error: 'Unauthorized' });

        const [messages] = await pool.query(
            'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC',
            [convId]
        );

        // Mark as seen
        await pool.query(
            'UPDATE messages SET seen = 1 WHERE conversation_id = ? AND sender_id != ?',
            [convId, userId]
        );

        res.json({ success: true, messages });
    } catch (err) {
        res.status(500).json({ error: 'Failed to load messages' });
    }
};

/**
 * POST /api/messages — Send a message (also starts conv if needed)
 */
exports.sendMessage = async (req, res) => {
    try {
        const senderId = req.user.id;
        const { receiverId, text, mediaUrl } = req.body;

        if (!receiverId) return res.status(400).json({ error: 'Receiver required' });

        // Find or create conversation
        const u1 = Math.min(senderId, receiverId);
        const u2 = Math.max(senderId, receiverId);

        let [[conv]] = await pool.query(
            'SELECT id FROM conversations WHERE user1_id = ? AND user2_id = ?',
            [u1, u2]
        );

        if (!conv) {
            const [result] = await pool.query(
                'INSERT INTO conversations (user1_id, user2_id) VALUES (?, ?)',
                [u1, u2]
            );
            conv = { id: result.insertId };
        }

        const [msgResult] = await pool.query(
            'INSERT INTO messages (conversation_id, sender_id, text, media_url) VALUES (?, ?, ?, ?)',
            [conv.id, senderId, text || null, mediaUrl || null]
        );

        res.status(201).json({ 
            success: true, 
            messageId: msgResult.insertId,
            conversationId: conv.id 
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to send message' });
    }
};
