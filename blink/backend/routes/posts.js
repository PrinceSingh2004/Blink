const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const {
    getFeed, createPost, toggleLike, getComments,
    postComment, getPost, deletePost
} = require('../controllers/postController');
const { protect, optionalAuth } = require('../middleware/auth');

const upload = multer({
    storage: multer.memoryStorage(),
    limits:  { fileSize: 100 * 1024 * 1024 }, // 100MB
    fileFilter: (req, file, cb) => {
        const allowed = /image\/(jpeg|jpg|png|gif|webp)|video\/(mp4|mov|avi|webm)/;
        if (!allowed.test(file.mimetype))
            return cb(new Error('Unsupported file type'));
        cb(null, true);
    }
});

router.get('/feed',              optionalAuth, getFeed);
router.post('/',                 protect, upload.single('media'), createPost);
router.get('/:id',               optionalAuth, getPost);
router.delete('/:id',            protect, deletePost);
router.post('/:id/like',         protect, toggleLike);
router.get('/:id/comments',               getComments);
router.post('/:id/comment',      protect, postComment);

module.exports = router;
