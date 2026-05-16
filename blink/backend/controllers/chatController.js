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
        // Using raw SQL for the complex conversation grouping
        const [rows] = await sequelize.query(`
            SELECT 
                u.id AS other_user_id,
                u.username AS other_username,
                u.name AS other_name,
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
        `, {
            replacements: [userId, userId, userId, userId, userId, userId],
            type: sequelize.QueryTypes.SELECT
        });

        res.json({ success: true, conversations: rows });
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

    console.log("GET MESSAGES DEBUG:", { currentUserId, otherUserId });

    const messages = await Message.findAll({
      where: {
        [Op.or]: [
          {
            sender_id: currentUserId,
            receiver_id: otherUserId,
          },
          {
            sender_id: otherUserId,
            receiver_id: currentUserId,
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

    console.log("SEND MESSAGE DEBUG:", { senderId, receiverId, text });

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
        [Op.or]: [
          { name: { [Op.iLike]: `%${q}%` } },
          { username: { [Op.iLike]: `%${q}%` } },
          { email: { [Op.iLike]: `%${q}%` } },
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
