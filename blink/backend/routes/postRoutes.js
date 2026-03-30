/**
 * routes/postRoutes.js
 * ═══════════════════════════════════════════════════════════════════════════════
 * Unified Post/Video/Reels Routes
 * ═══════════════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const { protect, optionalAuth } = require('../middleware/auth');

// IMPORT UFIED POST CONTROLLER
const postController = require('../controllers/postController');

// ════════════════════════════════════════════════════════════════════════════════
// DEBUG VALIDATION (Prevents 'Route.post() requires a callback function' error)
// ════════════════════════════════════════════════════════════════════════════════
const validateHandlers = (handlers) => {
    Object.keys(handlers).forEach(key => {
        if (typeof handlers[key] === 'undefined' || handlers[key] === null) {
            console.error(`❌ [POST ROUTES] Controller function '${key}' is UNDEFINED. Check exports in postController.js.`);
        }
    });
};

validateHandlers(postController);

// ════════════════════════════════════════════════════════════════════════════════
// PUBLIC ROUTES
// ════════════════════════════════════════════════════════════════════════════════
router.get('/feed', optionalAuth, postController.getFeed);
router.get('/user/:username', postController.getUserVideos);
router.get('/:postId/comments', postController.getComments);

// ════════════════════════════════════════════════════════════════════════════════
// PROTECTED ROUTES
// ════════════════════════════════════════════════════════════════════════════════
router.post('/upload', protect, postController.createPost);
router.post('/:postId/like', protect, postController.likePost);
router.post('/:postId/unlike', protect, postController.unlikePost);
router.post('/:postId/comment', protect, postController.addComment);
router.delete('/:postId', protect, postController.deletePost);

module.exports = router;
