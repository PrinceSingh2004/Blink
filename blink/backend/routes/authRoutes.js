/**
 * routes/authRoutes.js
 */
const express = require('express');
const router = express.Router();
const { register, login, getMe, logout, logoutAll } = require('../controllers/authController');
const { protect } = require('../middleware/auth');

router.post('/register', register);
router.post('/login', login);
router.get('/me', protect, getMe);
router.post('/logout', protect, logout);
router.post('/logout-all', protect, logoutAll);

module.exports = router;
