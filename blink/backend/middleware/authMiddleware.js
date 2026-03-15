const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'blink_jwt_super_secret_key_2024';

// Required auth - returns 401 if no/invalid token
module.exports.requireAuth = (req, res, next) => {
    const header = req.headers['authorization'];
    if (!header || !header.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    const token = header.slice(7);
    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
};

// Optional auth - attaches user if token present, but doesn't block
module.exports.optionalAuth = (req, res, next) => {
    const header = req.headers['authorization'];
    if (header && header.startsWith('Bearer ')) {
        try {
            req.user = jwt.verify(header.slice(7), JWT_SECRET);
        } catch { /* ignore */ }
    }
    next();
};
