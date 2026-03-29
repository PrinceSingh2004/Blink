/**
 * routes/users.js
 * ═══════════════════════════════════════════════════════════════════════════════
 * User Management Routes
 * ═══════════════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
    getUserProfile,
    updateProfile,
    updateProfilePic,
    updateCoverPic,
    followUser,
    unfollowUser,
    getFollowers,
    getFollowing,
    searchUsers
} = require('../controllers/userController');

// Public routes
router.get('/search', searchUsers);
router.get('/profile/:username', getUserProfile);
router.get('/:userId/followers', getFollowers);
router.get('/:userId/following', getFollowing);

// Protected routes
router.put('/profile', protect, updateProfile);
router.post('/profile-pic', protect, updateProfilePic);
router.post('/cover-pic', protect, updateCoverPic);
router.post('/follow/:userId', protect, followUser);
router.post('/unfollow/:userId', protect, unfollowUser);

module.exports = router;
