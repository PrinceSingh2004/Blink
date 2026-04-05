/**
 * routes/videoRoutes.js — Video + Comments Routes
 */
const express = require('express');
const router = express.Router();
const videoController = require('../controllers/videoController');
const { protect, optionalAuth } = require('../middleware/auth');

console.log('--- Registering Video Routes ---');
console.log('getFeed:', typeof videoController.getFeed);
console.log('searchVideos:', typeof videoController.searchVideos);

// Feed & Search
router.get('/feed', optionalAuth, videoController.getFeed);
router.get('/search', videoController.searchVideos);
router.get('/user/:userId', videoController.getUserVideos);

// Interactions
router.post('/:id/like', protect, videoController.likeVideo);
router.post('/:id/view', optionalAuth, videoController.viewVideo);

// Comments
router.get('/:id/comments', videoController.getComments);
router.post('/:id/comments', protect, videoController.addComment);

module.exports = router;
