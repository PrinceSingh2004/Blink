/**
 * routes/uploadRoutes.js
 */
const express = require('express');
const router = express.Router();
const { uploadVideo, uploadProfilePhoto } = require('../controllers/uploadController');
const { protect } = require('../middleware/auth');
const { upload } = require('../middleware/upload');

router.post('/video', protect, upload.single('video'), uploadVideo);
router.post('/profile-photo', protect, upload.single('photo'), uploadProfilePhoto);

module.exports = router;
