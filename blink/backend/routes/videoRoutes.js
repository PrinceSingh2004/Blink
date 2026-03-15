const router  = require('express').Router();
const vc      = require('../controllers/videoController');
const { requireAuth, optionalAuth } = require('../middleware/authMiddleware');
const { uploadVideo }               = require('../middleware/uploadMiddleware');

router.get('/',                 optionalAuth,  vc.getFeed);
router.get('/user/:userId',     optionalAuth,  vc.getUserVideos);
router.get('/:id',              optionalAuth,  vc.getVideo);
router.post('/upload',          requireAuth,   uploadVideo, vc.uploadVideo);
router.post('/:id/like',        requireAuth,   vc.toggleLike);
router.post('/:id/share',       optionalAuth,  vc.incrementShare);
router.delete('/:id',           requireAuth,   vc.deleteVideo);

module.exports = router;
