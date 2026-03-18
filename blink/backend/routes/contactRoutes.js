const router = require('express').Router();
const contact = require('../controllers/contactController');

router.post('/', contact.submitContact);

module.exports = router;
