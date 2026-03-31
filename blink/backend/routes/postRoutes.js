const express = require('express');
const router = express.Router();
const { createPost, getPosts, getMyPosts } = require('../controllers/postController');
const { protect } = require('../middleware/auth');
const { upload } = require('../middleware/upload');

// POST /api/posts - Create new post with video
router.post('/', protect, upload.single('video'), createPost);

// GET /api/posts - Public feed
router.get('/', getPosts);

// GET /api/posts/my - User's private collection
router.get('/my', protect, getMyPosts);

// POST /api/posts/like - Like a moment
router.post('/like', protect, likeVideo);

// POST /api/posts/view - Register a view (Pulse)
router.post('/view', viewVideo);

module.exports = router;
