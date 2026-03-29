/**
 * middleware/auth.js – JWT Protection Middleware
 */
const jwt = require('jsonwebtoken');

// ── REQUIRED AUTH ────────────────────────────────────────────────
const protect = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer '))
        return res.status(401).json({ error: 'Not authorized – token missing' });

    const token = authHeader.split(' ')[1];
    try {
        req.user = jwt.verify(token, process.env.JWT_SECRET);
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError')
            return res.status(401).json({ error: 'Token expired – please log in again' });
        res.status(401).json({ error: 'Invalid token' });
    }
};

// ── OPTIONAL AUTH (doesn't fail if missing) ────────────────────
const optionalAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        try {
            req.user = jwt.verify(token, process.env.JWT_SECRET);
        } catch { /* ignore */ }
    }
    next();
};

module.exports = { protect, optionalAuth };
