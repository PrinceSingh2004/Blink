const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const { uploadStory, getStories, markAsSeen } = require('../controllers/storyController');
const { protect, optionalAuth } = require('../middleware/auth');

const upload = multer({
    storage: multer.memoryStorage(),
    limits:  { fileSize: 50 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = /image\/(jpeg|jpg|png|gif|webp)|video\/(mp4|mov|avi|webm)/;
        if (!allowed.test(file.mimetype))
            return cb(new Error('Unsupported file type'));
        cb(null, true);
    }
});

router.get('/feed',              optionalAuth, getStories);
router.post('/upload',           protect, upload.single('story'), uploadStory);
router.post('/:storyId/seen',    protect, markAsSeen);

module.exports = router;
