const express = require('express');
const router = express.Router();
const { upload } = require('../middleware/upload');
const { createPost } = require('../controllers/postController');
const { protect } = require('../middleware/auth');

/**
 * @route   POST /api/upload/video
 * @desc    Dedicated video upload endpoint (as requested in Step 4)
 * @access  Private
 */
router.post('/video', protect, upload.single('video'), createPost);

module.exports = router;
