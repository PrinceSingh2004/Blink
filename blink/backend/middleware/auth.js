/**
 * middleware/auth.js — JWT Authentication Middleware
 * ══════════════════════════════════════════════════════
 * Exports: protect, optionalAuth
 */

const jwt = require('jsonwebtoken');

/**
 * REQUIRED AUTH — Returns 401 if token is missing or invalid
 */
const protect = (req, res, next) => {
    if (!process.env.JWT_SECRET) {
        console.error('❌ JWT_SECRET not configured');
        return res.status(500).json({ error: 'Server configuration error' });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Access denied — no token provided' });
    }

    const token = authHeader.split(' ')[1];
    if (!token || token === 'null' || token === 'undefined') {
        return res.status(401).json({ error: 'Invalid token format' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = { id: decoded.id };
        next();
    } catch (err) {
        const message = err.name === 'TokenExpiredError'
            ? 'Token expired — please log in again'
            : 'Invalid token';
        return res.status(401).json({ error: message });
    }
};

/**
 * OPTIONAL AUTH — Decodes token if present, continues regardless
 */
const optionalAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        if (token && token !== 'null' && token !== 'undefined') {
            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                req.user = { id: decoded.id };
            } catch {
                // Invalid token — continue without auth
            }
        }
    }
    next();
};

module.exports = { protect, optionalAuth };
