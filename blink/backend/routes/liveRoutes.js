const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/authMiddleware');
const liveController = require('../controllers/liveController');

// ── WebRTC Live Streaming Routes ──────────────────────────────
router.post('/start',  requireAuth, liveController.startLive);
router.post('/end',    requireAuth, liveController.endLive);
router.get('/now',                  liveController.getLiveNow);
router.get('/:id',                  liveController.getStreamDetails);
router.get('/chat/:id',             liveController.getChatHistory);

module.exports = router;
