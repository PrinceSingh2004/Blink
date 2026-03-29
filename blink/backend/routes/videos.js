const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const {
    getFeed, getVideo, recordView, toggleLike,
    getComments, postComment, uploadVideo, getUserVideos
} = require('../controllers/videoController');
const { protect, optionalAuth } = require('../middleware/auth');

const upload = multer({
    storage: multer.memoryStorage(),
    limits:  { fileSize: 200 * 1024 * 1024 }, // 200MB
    fileFilter: (req, file, cb) => {
        if (!file.mimetype.startsWith('video/'))
            return cb(new Error('Only video files are allowed'));
        cb(null, true);
    }
});

router.get('/feed',                optionalAuth, getFeed);
router.get('/:id',                 optionalAuth, getVideo);
router.post('/:id/view',                         recordView);
router.post('/toggle-like/:id',    protect,      toggleLike);
router.post('/:id/like',           protect,      toggleLike); // alias
router.get('/:id/comments',                      getComments);
router.post('/:id/comment',        protect,      postComment);
router.post('/upload',             protect,      upload.single('video'), uploadVideo);
router.get('/user/:id',                          getUserVideos);

module.exports = router;
