const express = require('express');
const router  = express.Router();
const { getNotifications, markAllRead, markRead, getUnreadCount } = require('../controllers/notificationController');
const { protect } = require('../middleware/auth');

router.get('/',             protect, getNotifications);
router.get('/unread',       protect, getUnreadCount);
router.put('/read-all',     protect, markAllRead);
router.put('/:id/read',     protect, markRead);

module.exports = router;
