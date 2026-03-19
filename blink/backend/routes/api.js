// routes/api.js
// Legacy compatibility file – individual feature routes are in their own files.
// This file is kept for reference only. New routes are in:
//   /routes/authRoutes.js, videoRoutes.js, userRoutes.js, etc.

const express = require('express');
const router  = express.Router();

router.get('/status', (req, res) => {
    res.json({ status: 'Blink API running', version: '2.0.0' });
});

module.exports = router;
