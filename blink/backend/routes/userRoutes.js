const router  = require('express').Router();
const uc      = require('../controllers/userController');
const { requireAuth } = require('../middleware/authMiddleware');
const { uploadAvatar } = require('../middleware/uploadMiddleware');

router.get('/search',           requireAuth, uc.searchUsers);
router.get('/:id',              uc.getProfile);
router.put('/profile/update',   requireAuth, uc.updateProfile);
router.post('/profile/avatar',  requireAuth, uploadAvatar, uc.updateAvatar);
router.put('/profile/password', requireAuth, uc.changePassword);
router.post('/go-live',         requireAuth, uc.goLive);
router.post('/stop-live',       requireAuth, uc.stopLive);
router.delete('/profile',        requireAuth, uc.deleteAccount);

module.exports = router;
