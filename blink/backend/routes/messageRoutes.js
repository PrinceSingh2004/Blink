const router = require('express').Router();
const mc     = require('../controllers/messageController');
const { requireAuth } = require('../middleware/authMiddleware');

router.get('/conversations',  requireAuth, mc.getConversations);
router.get('/:userId',        requireAuth, mc.getMessages);
router.post('/:userId',       requireAuth, mc.sendMessage);
router.patch('/:userId/read', requireAuth, mc.markRead);

module.exports = router;
