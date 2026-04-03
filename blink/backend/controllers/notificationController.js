/**
 * controllers/notificationController.js
 */
const pool = require('../config/db');

// ── GET NOTIFICATIONS ─────────────────────────────────────────────
exports.getNotifications = async (req, res) => {
    try {
        const userId = req.user.id;
        const limit  = Math.min(parseInt(req.query.limit || '20', 10), 50);
        const offset = parseInt(req.query.offset || '0', 10);

        const [notifications] = await pool.query(`
            SELECT n.id, n.type, n.entity_type, n.entity_id, n.message, n.is_read, n.created_at,
                   u.id AS actor_id, u.username AS actor_username,
                   COALESCE(u.profile_pic, u.avatar_url) AS actor_avatar
            FROM notifications n
            JOIN users u ON u.id = n.actor_id
            WHERE n.user_id = ?
            ORDER BY n.created_at DESC
            LIMIT ? OFFSET ?
        `, [userId, limit, offset]);

        const [unreadCount] = await pool.query(
            'SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND is_read = 0',
            [userId]
        );

        res.json({ notifications, unread: unreadCount[0].count });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// ── MARK ALL AS READ ──────────────────────────────────────────────
exports.markAllRead = async (req, res) => {
    try {
        await pool.query('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [req.user.id]);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// ── MARK ONE AS READ ──────────────────────────────────────────────
exports.markRead = async (req, res) => {
    try {
        await pool.query(
            'UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?',
            [req.params.id, req.user.id]
        );
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// ── UNREAD COUNT ──────────────────────────────────────────────────
exports.getUnreadCount = async (req, res) => {
    try {
        const [[row]] = await pool.query(
            'SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND is_read = 0',
            [req.user.id]
        );
        res.json({ count: row.count });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};
