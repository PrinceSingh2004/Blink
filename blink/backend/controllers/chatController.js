const sequelize = require('../config/db');
const { Op } = require('sequelize');
const Message = require('../models/Message');
const User = require('../models/User');

async function dbQuery(sql, params = []) {
    let isInsert = sql.trim().toUpperCase().startsWith('INSERT');
    if (isInsert && !sql.toUpperCase().includes('RETURNING')) {
        sql += ' RETURNING id';
    }
    try {
        const [results] = await sequelize.query(sql, { replacements: params });
        if (isInsert) {
            return [{ insertId: results && results.length > 0 ? results[0].id : null }];
        }
        return [results];
    } catch (err) {
        if (err.name === 'SequelizeUniqueConstraintError' || err.parent?.code === '23505') {
            err.code = 'ER_DUP_ENTRY';
        }
        throw err;
    }
}

/**
 * GET /api/chats — Get user's chat list
 */
exports.getConversations = async (req, res) => {
    try {
        const userId = req.user.id;

        // Fetch unique users the current user has messaged or received messages from
        const [rows] = await dbQuery(`
            SELECT 
                u.id AS other_user_id,
                u.username AS other_username,
                u.profile_photo AS other_profile_photo,
                m.message AS last_message,
                m."createdAt" AS last_message_at,
                (SELECT COUNT(*) FROM messages WHERE receiver_id = ? AND sender_id = u.id AND is_read = 0) AS unread_count
            FROM users u
            JOIN messages m ON (m.sender_id = u.id AND m.receiver_id = ?) OR (m.sender_id = ? AND m.receiver_id = u.id)
            WHERE m.id IN (
                SELECT MAX(id) FROM messages 
                WHERE (sender_id = ? OR receiver_id = ?) 
                GROUP BY CASE 
                    WHEN sender_id = ? THEN receiver_id 
                    ELSE sender_id 
                END
            )
            ORDER BY last_message_at DESC
        `, [userId, userId, userId, userId, userId, userId]);

        res.json({ success: true, conversations: rows });
    } catch (err) {
        console.error('Get conversations error:', err.message);
        res.status(500).json({ error: 'Failed to load conversations' });
    }
};

/**
 * GET /api/chats/:userId — Get message history between two users
 */
exports.getMessages = async (req, res) => {
    try {
        const currentUserId = req.user.id;
        const otherUserId = Number(req.params.userId);

        if (!otherUserId) {
            return res.status(400).json({ success: false, message: "Other user ID is required" });
        }

        const messages = await Message.findAll({
            where: {
                [Op.or]: [
                    { sender_id: currentUserId, receiver_id: otherUserId },
                    { sender_id: otherUserId, receiver_id: currentUserId }
                ]
            },
            order: [['createdAt', 'ASC']]
        });

        // Mark as read (use 1/0 for smallint)
        await Message.update(
            { is_read: 1 },
            { 
                where: { 
                    receiver_id: currentUserId, 
                    sender_id: otherUserId,
                    is_read: 0 
                } 
            }
        );

        res.json({ success: true, messages });
    } catch (err) {
        console.error('🔥 Get messages error:', err.message);
        res.status(500).json({ success: false, message: 'Failed to load messages' });
    }
};

/**
 * POST /api/chats/:userId — Send a message
 */
exports.sendMessage = async (req, res) => {
    try {
        const senderId = req.user.id;
        const receiverId = Number(req.params.userId);
        const { message } = req.body;

        if (!message || !message.trim()) {
            return res.status(400).json({ success: false, message: "Message cannot be empty" });
        }

        if (senderId === receiverId) {
            return res.status(400).json({ success: false, message: "You cannot message yourself" });
        }

        // Debug logs
        console.log("sender:", senderId, "receiver:", receiverId, "message:", message);

        // Find or create conversation for grouping (optional but good for backwards compat)
        const u1 = Math.min(senderId, receiverId);
        const u2 = Math.max(senderId, receiverId);
        let [[conv]] = await dbQuery('SELECT id FROM conversations WHERE user1_id = ? AND user2_id = ?', [u1, u2]);
        if (!conv) {
            const [result] = await dbQuery('INSERT INTO conversations (user1_id, user2_id) VALUES (?, ?)', [u1, u2]);
            conv = { id: result.insertId };
        }

        const savedMessage = await Message.create({
            sender_id: senderId,
            receiver_id: receiverId,
            message: message.trim(),
            is_read: 0,
            conversation_id: conv.id
        });

        console.log("saved message:", savedMessage.id);

        // Real-time emit to both sender and receiver rooms
        const io = req.app.get('io');
        if (io) {
            const emitData = {
                id: savedMessage.id,
                sender_id: senderId,
                receiver_id: receiverId,
                message: savedMessage.message,
                conversation_id: conv.id,
                createdAt: savedMessage.createdAt
            };
            io.to(`user_${receiverId}`).emit('receive_message', emitData);
            io.to(`user_${senderId}`).emit('receive_message', emitData);
        }

        res.status(201).json({ 
            success: true, 
            message: savedMessage
        });

    } catch (err) {
        console.error('🔥 Send message error:', err.message);
        res.status(500).json({ success: false, message: 'Failed to send message' });
    }
};

/**
 * PUT /api/chats/:userId/read — Mark messages as read
 */
exports.markAsRead = async (req, res) => {
    try {
        const receiverId = req.user.id;
        const senderId = Number(req.params.userId);

        await Message.update(
            { is_read: 1 },
            { 
                where: { 
                    receiver_id: receiverId, 
                    sender_id: senderId,
                    is_read: 0 
                } 
            }
        );

        res.json({ success: true });
    } catch (err) {
        console.error('🔥 Mark as read error:', err.message);
        res.status(500).json({ success: false, message: 'Failed to mark as read' });
    }
};
