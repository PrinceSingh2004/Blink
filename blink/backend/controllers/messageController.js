/**
 * controllers/messageController.js – Real-Time Chat History
 */
const pool = require('../db/config');

// ── GET/CREATE CHAT ROOM ──────────────────────────────────────────
exports.getOrCreateRoom = async (req, res) => {
    try {
        const me      = req.user.id;
        const otherId = parseInt(req.params.userId, 10);

        if (me === otherId) return res.status(400).json({ error: 'Cannot chat with yourself' });

        const roomId = [me, otherId].sort().join('_');

        // Ensure room exists
        await pool.query(
            `INSERT IGNORE INTO chat_rooms (room_id, user1_id, user2_id) VALUES (?, ?, ?)`,
            [roomId, Math.min(me, otherId), Math.max(me, otherId)]
        );

        // Load messages
        const [messages] = await pool.query(`
            SELECT m.id, m.room_id, m.sender_id, m.message, m.media_url,
                   m.is_read, m.created_at,
                   u.username, COALESCE(u.profile_pic, u.avatar_url) AS avatar
            FROM messages m
            JOIN users u ON u.id = m.sender_id
            WHERE m.room_id = ?
            ORDER BY m.created_at ASC
            LIMIT 100
        `, [roomId]);

        // Mark as read
        await pool.query(
            'UPDATE messages SET is_read = 1 WHERE room_id = ? AND sender_id != ?',
            [roomId, me]
        );

        res.json({ roomId, messages });
    } catch (e) {
        console.error('[Chat] getOrCreateRoom:', e.message);
        res.status(500).json({ error: e.message });
    }
};

// ── GET CONVERSATION LIST ─────────────────────────────────────────
exports.getConversations = async (req, res) => {
    try {
        const userId = req.user.id;

        const [convs] = await pool.query(`
            SELECT 
                r.room_id,
                IF(r.user1_id = ?, r.user2_id, r.user1_id) AS other_user_id,
                u.username, u.display_name,
                COALESCE(u.profile_pic, u.avatar_url) AS avatar,
                u.is_verified,
                (SELECT message FROM messages WHERE room_id = r.room_id ORDER BY created_at DESC LIMIT 1) AS last_message,
                (SELECT created_at FROM messages WHERE room_id = r.room_id ORDER BY created_at DESC LIMIT 1) AS last_message_time,
                (SELECT COUNT(*) FROM messages WHERE room_id = r.room_id AND sender_id != ? AND is_read = 0) AS unread_count
            FROM chat_rooms r
            JOIN users u ON u.id = IF(r.user1_id = ?, r.user2_id, r.user1_id)
            WHERE r.user1_id = ? OR r.user2_id = ?
            ORDER BY last_message_time DESC
        `, [userId, userId, userId, userId, userId]);

        res.json({ conversations: convs });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// ── SAVE MESSAGE (called by socket handler) ───────────────────────
exports.saveMessage = async (roomId, senderId, message) => {
    try {
        const [result] = await pool.query(
            'INSERT INTO messages (room_id, sender_id, message) VALUES (?, ?, ?)',
            [roomId, senderId, message]
        );
        return result.insertId;
    } catch (e) {
        console.error('[Chat] saveMessage:', e.message);
        return null;
    }
};
