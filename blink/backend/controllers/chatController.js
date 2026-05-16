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
 * GET /api/conversations — Get user's chat list
 */
exports.getConversations = async (req, res) => {
    try {
        const userId = req.user.id;

        const [rows] = await dbQuery(`
            SELECT 
                c.id, 
                c.created_at,
                u.id AS other_user_id,
                u.username AS other_username,
                u.profile_photo AS other_profile_photo,
                (SELECT message FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_message,
                (SELECT created_at FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_message_at,
                (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id AND sender_id != ? AND is_read = 0) AS unread_count
            FROM conversations c
            JOIN users u ON (c.user1_id = u.id OR c.user2_id = u.id)
            WHERE (c.user1_id = ? OR c.user2_id = ?) AND u.id != ?
            ORDER BY last_message_at DESC NULLS LAST
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
        const currentUserId = req.user.id;
        const { convId, userId: otherUserId } = req.params;

        let messages;

        if (otherUserId) {
            // Fetch by user pair (Instagram style)
            messages = await Message.findAll({
                where: {
                    [Op.or]: [
                        { sender_id: currentUserId, receiver_id: otherUserId },
                        { sender_id: otherUserId, receiver_id: currentUserId }
                    ]
                },
                order: [['created_at', 'ASC']]
            });

            // Mark as read
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
        } else if (convId) {
            // Fetch by conversation ID
            messages = await Message.findAll({
                where: { conversation_id: convId },
                order: [['created_at', 'ASC']]
            });

            // Mark as read
            await Message.update(
                { is_read: 1 },
                { 
                    where: { 
                        conversation_id: convId, 
                        receiver_id: currentUserId,
                        is_read: 0 
                    } 
                }
            );
        }

        res.json({ success: true, messages });
    } catch (err) {
        console.error('🔥 Get messages error:', err.message);
        res.status(500).json({ error: 'Failed to load messages' });
    }
};

/**
 * POST /api/chat/:userId — Send a message
 */
exports.sendMessage = async (req, res) => {
    try {
        const senderId = req.user.id;
        const receiverId = req.params.userId || req.body.receiverId;
        const text = req.body.text || req.body.message;

        if (!receiverId) {
            return res.status(400).json({ error: 'Receiver ID is required' });
        }

        // 1. Find or Create Conversation
        const u1 = Math.min(senderId, receiverId);
        const u2 = Math.max(senderId, receiverId);

        let [[conv]] = await dbQuery(
            'SELECT id FROM conversations WHERE user1_id = ? AND user2_id = ?',
            [u1, u2]
        );

        if (!conv) {
            const [result] = await dbQuery(
                'INSERT INTO conversations (user1_id, user2_id) VALUES (?, ?)',
                [u1, u2]
            );
            conv = { id: result.insertId };
        }

        // 2. Save message
        const newMessage = await Message.create({
            conversation_id: conv.id,
            sender_id: senderId,
            receiver_id: receiverId,
            message: text.trim(),
            is_read: 0
        });

        res.status(201).json({ 
            success: true, 
            message: newMessage,
            conversationId: conv.id 
        });

    } catch (err) {
        console.error('🔥 Send message error:', err.message);
        res.status(500).json({ error: 'Failed to send message' });
    }
};
