/**
 * routes/userRoutes.js
 */
const express = require('express');
const router = express.Router();
const { getProfile, getUser, updateProfile, searchUsers } = require('../controllers/userController');
const { protect } = require('../middleware/auth');

router.get('/me', protect, getProfile);
router.get('/search', searchUsers);
router.get('/:id', getUser);
router.put('/profile', protect, updateProfile);

module.exports = router;
