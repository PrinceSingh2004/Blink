/**
 * routes/postRoutes.js
 * ═══════════════════════════════════════════════════════════════════════════════
 * Video/Reels Routes
 * ═══════════════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const { protect, optionalAuth } = require('../middleware/auth');
const {
    getFeed,
    getUserVideos,
    uploadVideo,
    likeVideo,
    unlikeVideo,
    addComment,
    getComments,
    deleteVideo
} = require('../controllers/videoController');

// Public routes
router.get('/feed', optionalAuth, getFeed);
router.get('/user/:username', getUserVideos);
router.get('/:videoId/comments', getComments);

// Protected routes
router.post('/upload', protect, uploadVideo);
router.post('/:videoId/like', protect, likeVideo);
router.post('/:videoId/unlike', protect, unlikeVideo);
router.post('/:videoId/comment', protect, addComment);
router.delete('/:videoId', protect, deleteVideo);

module.exports = router;
