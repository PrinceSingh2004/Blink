/**
 * routes/userRoutes.js
 * ═══════════════════════════════════════════════════════════════════════════════
 * User Management Routes
 * ═══════════════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');

// ════════════════════════════════════════════════════════════════════════════════
// IMPORT CONTROLLER FUNCTIONS
// ════════════════════════════════════════════════════════════════════════════════
const userController = require('../controllers/userController');

// ════════════════════════════════════════════════════════════════════════════════
// DEBUG VALIDATION (Saves server from crashing on undefined imports)
// ════════════════════════════════════════════════════════════════════════════════
const validateHandlers = (handlers) => {
    Object.keys(handlers).forEach(key => {
        if (!handlers[key]) {
            console.error(`❌ [USER ROUTES] Controller function '${key}' is UNDEFINED. Check your controllers/userController.js exports.`);
        }
    });
};
validateHandlers(userController);

const {
    getUser,
    getUserProfile,
    updateProfile,
    updateProfilePic,
    updateCoverPic,
    followUser,
    unfollowUser,
    getFollowers,
    getFollowing,
    searchUsers
} = userController;

// ════════════════════════════════════════════════════════════════════════════════
// PUBLIC ROUTES
// ════════════════════════════════════════════════════════════════════════════════
router.get('/profile/:username', getUserProfile); // Fetch by username
router.get('/search', searchUsers);               // Search users
router.get('/:userId/followers', getFollowers);   // Get followers of someone
router.get('/:userId/following', getFollowing);   // Get who someone follows

// ════════════════════════════════════════════════════════════════════════════════
// PROTECTED ROUTES
// ════════════════════════════════════════════════════════════════════════════════
router.get('/profile', protect, getUser);          // Get own profile (Example requested)
router.put('/profile', protect, updateProfile);    // Update profile text
router.post('/profile-pic', protect, updateProfilePic); // Update profile picture
router.post('/cover-pic', protect, updateCoverPic);   // Update cover picture
router.post('/follow/:userId', protect, followUser);  // Follow user
router.post('/unfollow/:userId', protect, unfollowUser); // Unfollow user

module.exports = router;
