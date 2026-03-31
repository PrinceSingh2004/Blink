const express = require('express');
const router = express.Router();
const { toggleFollow, addComment, getComments } = require('../controllers/engagementController');
const { protect } = require('../middleware/auth');

// POST /api/social/follow - Pulse a social link
router.post('/follow', protect, toggleFollow);

// POST /api/social/comment - Share a thought
router.post('/comment', protect, addComment);

// GET /api/social/comments/:videoId - Load video dialogue
router.get('/comments/:videoId', getComments);

module.exports = router;
