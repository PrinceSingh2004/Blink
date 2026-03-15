const express = require('express');
const router  = express.Router();
const lc      = require('../controllers/liveController');
const { requireAuth } = require('../middleware/authMiddleware');

router.post('/start', requireAuth, lc.startLive);
router.post('/end',   requireAuth, lc.endLive);
router.get('/now',          lc.getLiveNow);
router.get('/:id',          lc.getStreamDetails);
router.get('/:id/chat',     lc.getChatHistory);

module.exports = router;
