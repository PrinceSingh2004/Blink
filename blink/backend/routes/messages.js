const express = require('express');
const router  = express.Router();
const { getOrCreateRoom, getConversations } = require('../controllers/messageController');
const { protect } = require('../middleware/auth');

router.get('/conversations',     protect, getConversations);
router.get('/room/:userId',      protect, getOrCreateRoom);

module.exports = router;
