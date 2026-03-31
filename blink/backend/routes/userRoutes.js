const express = require('express');
const router = express.Router();
const { getProfile, updateProfile, getUser } = require('../controllers/userController');
const { protect } = require('../middleware/auth'); // Auth middleware

// GET /api/users - Fetch own universe profile (Self)
router.get('/', protect, getUser);

// GET /api/users/:id - Fetch another universe profile (Public)
router.get('/:id', getUser);

// POST /api/users/update-profile - Modify profile photo
router.post('/update-profile', protect, updateProfile);

module.exports = router;
