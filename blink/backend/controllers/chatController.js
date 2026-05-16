const { Op } = require("sequelize");
const Message = require("../models/Message");
const User = require("../models/User");
const sequelize = require("../config/db");

/**
 * GET /api/chats — Get user's chat list (Conversations)
 */
exports.getConversations = async (req, res) => {
    try {
        const userId = req.user.id;

        // Fetch unique users the current user has messaged or received messages from
        // In Sequelize v6+ with SELECT type, it returns just the rows array
        const rows = await sequelize.query(`
            WITH LatestMessages AS (
                SELECT 
                    CASE 
                        WHEN sender_id = :userId THEN receiver_id 
                        ELSE sender_id 
                    END AS partner_id,
                    id,
                    message,
                    "createdAt",
                    is_read,
                    sender_id
                FROM messages
                WHERE (sender_id = :userId AND deleted_for_sender = false) 
                   OR (receiver_id = :userId AND deleted_for_receiver = false)
            ),
            PartnerLatest AS (
                SELECT partner_id, MAX("createdAt") as max_created
                FROM LatestMessages
                GROUP BY partner_id
            )
            SELECT 
                u.id AS other_user_id,
                u.username AS other_username,
                u.name AS other_name,
                u.profile_photo AS other_profile_photo,
                lm.message AS last_message,
                lm."createdAt" AS last_message_at,
                (
                    SELECT COUNT(*) 
                    FROM messages 
                    WHERE receiver_id = :userId 
                      AND sender_id = u.id 
                      AND is_read = 0
                      AND deleted_for_receiver = false
                ) AS unread_count
            FROM users u
            JOIN PartnerLatest pl ON u.id = pl.partner_id
            JOIN LatestMessages lm ON u.id = lm.partner_id AND lm."createdAt" = pl.max_created
            WHERE u.id != :userId
            ORDER BY last_message_at DESC
        `, {
            replacements: { userId },
            type: sequelize.QueryTypes.SELECT
        });

        res.json({ success: true, conversations: rows || [] });
    } catch (err) {
        console.error('Get conversations error:', err.message);
        res.status(500).json({ error: 'Failed to load conversations' });
    }
};

/**
 * GET /api/chats/:userId — Get full message history
 */
exports.getMessages = async (req, res) => {
  try {
    const currentUserId = Number(req.user.id);
    const otherUserId = Number(req.params.userId);

    if (currentUserId === otherUserId) {
        return res.status(400).json({
            success: false,
            message: "You cannot open chat with yourself",
        });
    }

    console.log("GET MESSAGES DEBUG:", { currentUserId, otherUserId });

    const messages = await Message.findAll({
      where: {
        [Op.or]: [
          {
            sender_id: currentUserId,
            receiver_id: otherUserId,
            deleted_for_sender: false
          },
          {
            sender_id: otherUserId,
            receiver_id: currentUserId,
            deleted_for_receiver: false
          },
        ],
      },
      order: [["createdAt", "ASC"]],
    });

    console.log("MESSAGES FOUND DEBUG:", messages.length);

    // Auto-mark as read when loading history
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

    return res.json({
      success: true,
      messages,
    });
  } catch (error) {
    console.error("GET MESSAGES ERROR DEBUG:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load history",
      error: error.message,
    });
  }
};

/**
 * POST /api/chats/:userId — Send message
 */
exports.sendMessage = async (req, res) => {
  try {
    const senderId = Number(req.user.id);
    const receiverId = Number(req.params.userId);
    const text = req.body.message;

    if (senderId === receiverId) {
      return res.status(400).json({
        success: false,
        message: "You cannot message yourself",
      });
    }

    if (!text || !text.trim()) {
      return res.status(400).json({
        success: false,
        message: "Message cannot be empty",
      });
    }

    const savedMessage = await Message.create({
      sender_id: senderId,
      receiver_id: receiverId,
      message: text.trim(),
      is_read: 0,
      is_forwarded: req.body.is_forwarded || false
    });

    console.log("MESSAGE SAVED DEBUG:", savedMessage.id);

    const io = req.app.get("io");

    if (io) {
      // Emit to specific user rooms (Instagram style)
      io.to(`user_${receiverId}`).emit("receive_message", savedMessage);
      io.to(`user_${senderId}`).emit("receive_message", savedMessage);
      
      // Also emit notification for sidebar updates
      io.to(`user_${receiverId}`).emit("new_message_notification", {
          sender_id: senderId,
          message: text.trim()
      });
    } else {
      console.warn("⚠️ Socket.IO not available on req.app, message saved without real-time emit");
    }

    return res.status(201).json({
      success: true,
      message: savedMessage,
    });
  } catch (error) {
    console.error("SEND MESSAGE ERROR DEBUG:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to send message",
      error: error.message,
    });
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

/**
 * GET /api/chats/search — Search users and messages
 */
exports.searchChats = async (req, res) => {
  try {
    const q = req.query.q;
    const currentUserId = req.user.id;

    if (!q || !q.trim()) {
      return res.json({ success: true, users: [], messages: [] });
    }

    const users = await User.findAll({
      where: {
        id: { [Op.ne]: currentUserId },
        [Op.or]: [
          { name: { [Op.iLike]: `%${q}%` } },
          { username: { [Op.iLike]: `%${q}%` } },
        ],
      },
      attributes: ['id', 'name', 'username', 'profile_photo'],
      limit: 10,
    });

    const messages = await Message.findAll({
      where: {
        message: { [Op.iLike]: `%${q}%` },
        [Op.or]: [
          { sender_id: currentUserId },
          { receiver_id: currentUserId },
        ],
      },
      order: [["createdAt", "DESC"]],
      limit: 20,
    });

    res.json({
      success: true,
      users,
      messages,
    });
  } catch (error) {
    console.error("Search chats error:", error);
    res.status(500).json({ success: false, message: "Search failed" });
  }
};

/**
 * DELETE /api/chats/messages/:messageId — Delete message
 */
exports.deleteMessage = async (req, res) => {
    try {
        const userId = req.user.id;
        const messageId = req.params.messageId;
        const type = req.query.type; // 'me' or 'everyone'

        const message = await Message.findByPk(messageId);
        if (!message) return res.status(404).json({ error: 'Message not found' });

        if (type === 'everyone') {
            if (message.sender_id !== userId) {
                return res.status(403).json({ error: 'You can only delete your own messages for everyone' });
            }
            await message.destroy();
        } else {
            // Delete for me
            if (message.sender_id === userId) {
                message.deleted_for_sender = true;
            } else if (message.receiver_id === userId) {
                message.deleted_for_receiver = true;
            }
            await message.save();
        }

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete message' });
    }
};

/**
 * POST /api/chats/forward — Forward message to multiple users
 */
exports.forwardMessage = async (req, res) => {
    try {
        const senderId = req.user.id;
        const { userIds, text } = req.body;

        if (!userIds || !Array.isArray(userIds) || !text) {
            return res.status(400).json({ error: 'Missing recipients or text' });
        }

        const messages = await Promise.all(userIds.map(async (receiverId) => {
            const msg = await Message.create({
                sender_id: senderId,
                receiver_id: receiverId,
                message: text,
                is_forwarded: true
            });
            
            const io = req.app.get("io");
            if (io) {
                io.to(`user_${receiverId}`).emit("receive_message", msg);
                io.to(`user_${senderId}`).emit("receive_message", msg);
            }
            return msg;
        }));

        res.json({ success: true, count: messages.length });
    } catch (err) {
        res.status(500).json({ error: 'Failed to forward message' });
    }
};
