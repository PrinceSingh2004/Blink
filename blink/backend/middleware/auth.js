// middleware/auth.js – Legacy alias, forwards to authMiddleware.js
// Kept for backward compatibility with any older files that require('./auth')
module.exports = require('./authMiddleware').requireAuth;
