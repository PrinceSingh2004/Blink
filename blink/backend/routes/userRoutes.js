const router  = require('express').Router();
const uc      = require('../controllers/userController');
const { requireAuth } = require('../middleware/authMiddleware');
const { uploadAvatar } = require('../middleware/uploadMiddleware');

router.get('/search',            requireAuth, uc.searchUsers);
router.get('/profile',           requireAuth, (req,res) => { req.params.id = req.user.id; uc.getProfile(req,res); });

// Avatar upload routes (with multer middleware)
router.post('/upload-profile',   requireAuth, uploadAvatar, uc.updateAvatar);
router.post('/profile/avatar',   requireAuth, uploadAvatar, uc.updateAvatar);

// Profile update routes
router.post('/update-profile',   requireAuth, uploadAvatar, uc.updateProfile);
router.post('/profile/update',   requireAuth, uc.updateProfile); 
router.put('/profile/update',    requireAuth, uc.updateProfile);

// Other user routes
router.get('/:id',               uc.getProfile);
router.put('/profile/password',  requireAuth, uc.changePassword);
router.post('/go-live',          requireAuth, uc.goLive);
router.post('/stop-live',        requireAuth, uc.stopLive);
router.delete('/profile',        requireAuth, uc.deleteAccount);

module.exports = router;
