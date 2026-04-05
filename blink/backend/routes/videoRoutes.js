/**
 * routes/videoRoutes.js
 */
const express = require('express');
const router = express.Router();
const { getFeed, searchVideos, likeVideo, viewVideo, getUserVideos } = require('../controllers/videoController');
const { protect, optionalAuth } = require('../middleware/auth');

router.get('/feed', optionalAuth, getFeed);
router.get('/search', searchVideos);
router.get('/user/:userId', getUserVideos);
router.post('/:id/like', protect, likeVideo);
router.post('/:id/view', viewVideo);

module.exports = router;
