/**
 * backend/middleware/errorMiddleware.js
 * ═══════════════════════════════════════════════════════════
 * Global Production Error Orchestration
 * ═══════════════════════════════════════════════════════════
 */

exports.errorHandler = (err, req, res, next) => {
    const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
    
    // Log error for production monitoring
    console.error(`[ApiError] ${req.method} ${req.originalUrl}:`, err.message);

    res.status(statusCode).json({
        success: false,
        error: err.message,
        stack: process.env.NODE_ENV === 'production' ? '🥞' : err.stack
    });
};

exports.notFound = (req, res, next) => {
    const error = new Error(`Resource Not Found – ${req.originalUrl}`);
    res.status(404);
    next(error);
};
