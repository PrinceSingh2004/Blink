const router = require('express').Router();
const auth   = require('../controllers/authController');

router.post('/register', auth.register);
router.post('/login',    auth.login);
router.post('/send-otp', auth.sendOTP);
router.post('/verify-otp', auth.verifyOTP);
router.post('/reset-password', auth.resetPassword);
router.get('/me',        require('../middleware/authMiddleware').requireAuth, auth.getMe);

module.exports = router;
