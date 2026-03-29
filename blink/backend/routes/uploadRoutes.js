/**
 * routes/uploadRoutes.js
 * ═══════════════════════════════════════════════════════════════════════════════
 * Video & Image Upload Endpoints
 * ═══════════════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
    uploadVideo,
    uploadProfilePhoto,
    uploadCoverPhoto,
    getUploadSignature
} = require('../controllers/uploadController');

// Protected routes - all require authentication
router.post('/video', protect, uploadVideo);
router.post('/profile-photo', protect, uploadProfilePhoto);
router.post('/cover-photo', protect, uploadCoverPhoto);
router.get('/signature', protect, getUploadSignature);

module.exports = router;
