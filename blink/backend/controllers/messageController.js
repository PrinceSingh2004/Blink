const db = require('../config/db');

// ─── GET CONVERSATIONS ────────────────────────────────────────
exports.getConversations = async (req, res) => {
    try {
        const [convs] = await db.query(
            `SELECT
                u.id, u.username, u.profile_photo,
                latest.message_text, latest.created_at,
                (SELECT COUNT(*) FROM messages m2
                 WHERE m2.sender_id = u.id AND m2.receiver_id = ? AND m2.is_read = 0) AS unread_count
             FROM (
                SELECT
                    CASE WHEN sender_id = ? THEN receiver_id ELSE sender_id END AS other_id,
                    MAX(created_at) AS max_time
                FROM messages WHERE sender_id = ? OR receiver_id = ?
                GROUP BY other_id
             ) convo
             JOIN users u ON u.id = convo.other_id
             JOIN messages latest ON latest.created_at = convo.max_time
                AND (latest.sender_id = u.id OR latest.receiver_id = u.id)
                AND (latest.sender_id = ? OR latest.receiver_id = ?)
             ORDER BY convo.max_time DESC`,
            [req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, req.user.id]
        );
        res.json({ conversations: convs });
    } catch (err) {
        console.error('[Messages] getConversations:', err.message);
        res.status(500).json({ error: 'Server error' });
    }
};

// ─── GET MESSAGES WITH A USER ─────────────────────────────────
exports.getMessages = async (req, res) => {
    try {
        const otherId = req.params.userId;
        const myId    = req.user.id;

        const [messages] = await db.query(
            `SELECT m.*, u.username AS sender_name, u.profile_photo AS sender_avatar
             FROM messages m
             LEFT JOIN users u ON m.sender_id = u.id
             WHERE (m.sender_id = ? AND m.receiver_id = ?) OR (m.sender_id = ? AND m.receiver_id = ?)
             ORDER BY m.created_at ASC
             LIMIT 100`,
            [myId, otherId, otherId, myId]
        );
        res.json({ messages });
    } catch (err) {
        console.error('[Messages] getMessages:', err.message);
        res.status(500).json({ error: 'Server error' });
    }
};

// ─── SEND MESSAGE ─────────────────────────────────────────────
exports.sendMessage = async (req, res) => {
    try {
        const { message_text } = req.body;
        const receiverId = req.params.userId;
        const senderId   = req.user.id;

        if (!message_text?.trim())
            return res.status(400).json({ error: 'Message text is required' });
        if (parseInt(senderId) === parseInt(receiverId))
            return res.status(400).json({ error: 'Cannot message yourself' });

        const [[receiver]] = await db.query('SELECT id FROM users WHERE id = ?', [receiverId]);
        if (!receiver) return res.status(404).json({ error: 'User not found' });

        const [result] = await db.query(
            'INSERT INTO messages (sender_id, receiver_id, message_text) VALUES (?, ?, ?)',
            [senderId, receiverId, message_text.trim()]
        );

        // Emit real-time event via socket
        const room = [senderId, receiverId].sort().join('_');
        req.app.get('io')?.to(room).emit('receive_message', {
            id: result.insertId, sender_id: senderId, receiver_id: receiverId,
            message_text: message_text.trim(),
            created_at: new Date().toISOString()
        });

        res.status(201).json({
            message: 'Sent',
            msg: { id: result.insertId, sender_id: senderId, receiver_id: receiverId,
                   message_text: message_text.trim(), created_at: new Date() }
        });
    } catch (err) {
        console.error('[Messages] sendMessage:', err.message);
        res.status(500).json({ error: 'Failed to send message' });
    }
};

// ─── MARK MESSAGES AS READ ────────────────────────────────────
exports.markRead = async (req, res) => {
    try {
        await db.query(
            'UPDATE messages SET is_read = 1 WHERE sender_id = ? AND receiver_id = ?',
            [req.params.userId, req.user.id]
        );
        res.json({ message: 'Marked as read' });
    } catch {
        res.status(500).json({ error: 'Server error' });
    }
};
