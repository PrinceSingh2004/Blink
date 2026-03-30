/**
 * routes/auth.js
 * ═══════════════════════════════════════════════════════════════════════════════
 * Authentication Routes: Register, Login, GetMe, Logout, Validate
 * ═══════════════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const { register, login, getMe, logout, validateToken } = require('../controllers/authController');
const { protect } = require('../middleware/auth');

// ── Startup Validation ──────────────────────────────────────────────────────────
const REQUIRED = { register, login, getMe, logout, validateToken, protect };
const missing = Object.entries(REQUIRED)
    .filter(([, fn]) => typeof fn !== 'function')
    .map(([name]) => name);

if (missing.length > 0) {
    throw new Error(`❌ [AUTH ROUTES] Undefined handlers: ${missing.join(', ')}`);
}

// ── Public Routes ───────────────────────────────────────────────────────────────
router.post('/register', register);
router.post('/login', login);

// ── Protected Routes ────────────────────────────────────────────────────────────
router.get('/me', protect, getMe);
router.post('/logout', protect, logout);
router.get('/validate', protect, validateToken);

module.exports = router;
