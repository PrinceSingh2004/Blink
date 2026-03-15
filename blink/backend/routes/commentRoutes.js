const router = require('express').Router();
const cc     = require('../controllers/commentController');
const { requireAuth } = require('../middleware/authMiddleware');

router.get('/:videoId',    cc.getComments);
router.post('/:videoId',   requireAuth, cc.addComment);
router.delete('/:id',      requireAuth, cc.deleteComment);

module.exports = router;
