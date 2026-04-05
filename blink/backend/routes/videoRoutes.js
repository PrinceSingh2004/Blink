/**
 * routes/videoRoutes.js — Video + Comments Routes
 */
const express = require('express');
const router = express.Router();
const {
    getFeed, searchVideos, likeVideo, viewVideo,
    getUserVideos, getComments, addComment, deleteComment
} = require('../controllers/videoController');
const { protect, optionalAuth } = require('../middleware/auth');

// Feed & Search
router.get('/feed', optionalAuth, getFeed);
router.get('/search', searchVideos);
router.get('/user/:userId', getUserVideos);

// Interactions
router.post('/:id/like', protect, likeVideo);
router.post('/:id/view', viewVideo);

// Comments
router.get('/:id/comments', getComments);
router.post('/:id/comments', protect, addComment);

module.exports = router;
