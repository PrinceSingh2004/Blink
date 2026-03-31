const express = require('express');
const router = express.Router();
const { getProfile, updateProfile, getUser } = require('../controllers/userController');
const { protect } = require('../middleware/auth'); // Auth middleware

router.get('/profile', protect, getProfile);
router.get('/me', protect, getUser); // Added for Profile fix
router.put('/profile', protect, updateProfile);
module.exports = router;
