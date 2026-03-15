const router = require('express').Router();
const fc     = require('../controllers/followController');
const { requireAuth } = require('../middleware/authMiddleware');

router.get('/status/:id', requireAuth, fc.checkStatus);
router.get('/live/following', requireAuth, fc.getFollowedLive);
router.post('/:id',       requireAuth, fc.follow);
router.delete('/:id',     requireAuth, fc.unfollow);
router.get('/followers/:userId', fc.getFollowers);
router.get('/following/:userId', fc.getFollowing);

module.exports = router;
