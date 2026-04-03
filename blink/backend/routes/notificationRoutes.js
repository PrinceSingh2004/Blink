const express = require('express');
const router = express.Router();
const { getNotifications, markAllRead, markRead, getUnreadCount } = require('../controllers/notificationController');
const { protect } = require('../middleware/auth');

// GET /api/notifications - Get all user notifications
router.get('/', protect, getNotifications);

// GET /api/notifications/unread - Get unread count
router.get('/unread', protect, getUnreadCount);

// PUT /api/notifications/mark-read - Mark all as read
router.put('/mark-read', protect, markAllRead);

// PUT /api/notifications/:id/read - Mark one as read
router.put('/:id/read', protect, markRead);

module.exports = router;
