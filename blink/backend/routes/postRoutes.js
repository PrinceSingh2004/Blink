const express = require('express');
const router = express.Router();
const { createPost, getPosts } = require('../controllers/postController');
const { protect } = require('../middleware/auth');
const { upload } = require('../middleware/upload');

// POST /api/posts - Create new post with video
router.post('/', protect, upload.single('video'), createPost);

// GET /api/posts - Public feed
router.get('/', getPosts);

module.exports = router;
