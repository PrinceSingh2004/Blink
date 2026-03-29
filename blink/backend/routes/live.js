const express = require('express');
const router  = express.Router();
const { startLive, endLive, getLiveStreams, getStream, getChatHistory } = require('../controllers/liveController');
const { protect } = require('../middleware/auth');

router.get('/',             getLiveStreams);
router.post('/start',       protect, startLive);
router.post('/end',         protect, endLive);
router.get('/:id',          getStream);
router.get('/:id/chat',     getChatHistory);

module.exports = router;
