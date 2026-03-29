const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const {
    getProfile, getProfileByUsername, updateProfile, follow,
    searchUsers, getFollowers, getFollowing, getSuggested, getUserPosts
} = require('../controllers/userController');
const { protect, optionalAuth } = require('../middleware/auth');

const upload = multer({
    storage: multer.memoryStorage(),
    limits:  { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (req, file, cb) => {
        if (!file.mimetype.startsWith('image/'))
            return cb(new Error('Only image files are allowed for profile photos'));
        cb(null, true);
    }
});

router.get('/search',             searchUsers);
router.get('/suggested',          protect, getSuggested);
router.get('/by/:username',       optionalAuth, getProfileByUsername);
router.get('/:id',                optionalAuth, getProfile);
router.put('/profile',            protect, upload.single('avatar'), updateProfile);
router.post('/:id/follow',        protect, follow);
router.get('/:id/followers',      getFollowers);
router.get('/:id/following',      getFollowing);
router.get('/:id/posts',          getUserPosts);

module.exports = router;
