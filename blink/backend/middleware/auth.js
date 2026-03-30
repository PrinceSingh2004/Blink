/**
 * middleware/auth.js – JWT Authentication Middleware
 * ═══════════════════════════════════════════════════════════════════════════════
 * Exports: protect, optionalAuth, adminOnly
 * ═══════════════════════════════════════════════════════════════════════════════
 */

const jwt = require('jsonwebtoken');

// ════════════════════════════════════════════════════════════════════════════════
// REQUIRED AUTH — Returns 401 if token is missing or invalid
// ════════════════════════════════════════════════════════════════════════════════
const protect = (req, res, next) => {
    // Check JWT_SECRET is configured
    if (!process.env.JWT_SECRET) {
        console.error('❌ JWT_SECRET is not set in environment variables');
        return res.status(500).json({ error: 'Server configuration error' });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            error: true,
            message: 'Not authorized – token missing',
            redirect: '/pages/login.html'
        });
    }

    const token = authHeader.split(' ')[1];

    // Guard against string "null" or "undefined" tokens
    if (!token || token === 'null' || token === 'undefined') {
        return res.status(401).json({
            error: true,
            message: 'Invalid token format',
            redirect: '/pages/login.html'
        });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        req.userId = decoded.id;
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({
                error: true,
                message: 'Token expired – please log in again',
                redirect: '/pages/login.html'
            });
        }
        return res.status(401).json({
            error: true,
            message: 'Invalid token',
            redirect: '/pages/login.html'
        });
    }
};

// ════════════════════════════════════════════════════════════════════════════════
// OPTIONAL AUTH — Decodes token if present, but doesn't fail if missing
// ════════════════════════════════════════════════════════════════════════════════
const optionalAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        if (token && token !== 'null' && token !== 'undefined') {
            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                req.user = decoded;
                req.userId = decoded.id;
            } catch {
                // Token invalid — proceed without auth (don't fail)
            }
        }
    }
    next();
};

// ════════════════════════════════════════════════════════════════════════════════
// ADMIN ONLY — Requires req.user.isAdmin to be true
// ════════════════════════════════════════════════════════════════════════════════
const adminOnly = (req, res, next) => {
    if (!req.user?.isAdmin) {
        return res.status(403).json({
            error: true,
            message: 'Admin access required'
        });
    }
    next();
};

// ════════════════════════════════════════════════════════════════════════════════
// EXPORT — Every middleware used in any route file MUST be listed here
// ════════════════════════════════════════════════════════════════════════════════
module.exports = { protect, optionalAuth, adminOnly };
