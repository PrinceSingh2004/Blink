const express = require('express');
const router = express.Router();
const { createPost, getPosts } = require('../controllers/postController');
const { protect } = require('../middleware/auth');

router.post('/', protect, createPost);
router.get('/', getPosts); // Public feed
module.exports = router;
