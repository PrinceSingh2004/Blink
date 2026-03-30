/**
 * routes/userRoutes.js
 * ═══════════════════════════════════════════════════════════════════════════════
 * User Management Routes — Profile, Follow, Search, Upload
 * ═══════════════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const { protect, optionalAuth } = require('../middleware/auth');

// ════════════════════════════════════════════════════════════════════════════════
// IMPORT CONTROLLER
// ════════════════════════════════════════════════════════════════════════════════
const {
    getUser,
    getUserProfile,
    updateProfile,
    updateProfilePic,
    updateCoverPic,
    followUser,
    unfollowUser,
    searchUsers,
    getFollowers,
    getFollowing,
    checkFollowStatus,
    deleteAccount,
    uploadMiddleware
} = require('../controllers/userController');

// ════════════════════════════════════════════════════════════════════════════════
// STARTUP VALIDATION — Catches undefined callbacks BEFORE Express throws
// ════════════════════════════════════════════════════════════════════════════════
const REQUIRED_HANDLERS = {
    getUser, getUserProfile, updateProfile,
    updateProfilePic, updateCoverPic,
    followUser, unfollowUser,
    searchUsers, getFollowers, getFollowing,
    checkFollowStatus, deleteAccount,
    uploadMiddleware
};

const missing = Object.entries(REQUIRED_HANDLERS)
    .filter(([, fn]) => typeof fn !== 'function' && fn !== uploadMiddleware)
    .map(([name]) => name);

if (missing.length > 0) {
    throw new Error(
        `❌ [USER ROUTES] Undefined handlers: ${missing.join(', ')}. ` +
        `Check exports in controllers/userController.js`
    );
}

// ════════════════════════════════════════════════════════════════════════════════
// ROUTES — Specific paths MUST come before parameterized paths
// ════════════════════════════════════════════════════════════════════════════════

// ── Own Profile (auth required) ─────────────────────────────────────────────────
router.get('/me', protect, getUser);                      // GET /api/users/me
router.put('/profile', protect, updateProfile);            // PUT /api/users/profile

// ── Search ──────────────────────────────────────────────────────────────────────
router.get('/search', searchUsers);                        // GET /api/users/search?q=

// ── Image Uploads (auth + multer) ───────────────────────────────────────────────
router.post('/profile-pic',
    protect,
    uploadMiddleware.single('avatar'),
    updateProfilePic
);                                                          // POST /api/users/profile-pic

router.post('/cover-pic',
    protect,
    uploadMiddleware.single('cover'),
    updateCoverPic
);                                                          // POST /api/users/cover-pic

// ── Follow Actions ──────────────────────────────────────────────────────────────
router.post('/follow/:userId', protect, followUser);        // POST /api/users/follow/:userId
router.post('/unfollow/:userId', protect, unfollowUser);    // POST /api/users/unfollow/:userId
router.get('/follow/status/:userId', protect, checkFollowStatus); // GET /api/users/follow/status/:userId

// ── Account ─────────────────────────────────────────────────────────────────────
router.delete('/account', protect, deleteAccount);          // DELETE /api/users/account

// ── Parameterized routes LAST (so they don't swallow /me, /search, etc.) ────────
router.get('/:userId/followers', getFollowers);             // GET /api/users/:userId/followers
router.get('/:userId/following', getFollowing);             // GET /api/users/:userId/following
router.get('/profile/:username', getUserProfile);           // GET /api/users/profile/:username

module.exports = router;
