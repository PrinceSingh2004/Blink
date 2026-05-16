/**
 * routes/chatRoutes.js — Messaging Routes
 * ══════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const { getConversations, getMessages, sendMessage, markAsRead, searchChats } = require('../controllers/chatController');
const { protect } = require('../middleware/auth');

router.get('/search', protect, searchChats);
router.get('/', protect, getConversations);
router.get('/:userId', protect, getMessages);
router.post('/:userId', protect, sendMessage);
router.put('/:userId/read', protect, markAsRead);

module.exports = router;
