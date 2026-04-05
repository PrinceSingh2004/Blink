/**
 * routes/chatRoutes.js — Messaging Routes
 * ══════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const { getConversations, getMessages, sendMessage } = require('../controllers/chatController');
const { protect } = require('../middleware/auth');

router.get('/conversations', protect, getConversations);
router.get('/messages/:convId', protect, getMessages);
router.post('/messages', protect, sendMessage);

module.exports = router;
