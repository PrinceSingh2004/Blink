/**
 * middleware/errorMiddleware.js
 * ═══════════════════════════════════════════════════════════════════════════════
 * PRODUCTION-GRADE ERROR HANDLING MIDDLEWARE
 * ═══════════════════════════════════════════════════════════════════════════════
 * Handles database errors, validation errors, and prevents app crashes
 * ═══════════════════════════════════════════════════════════════════════════════
 */

const fs = require('fs');
const path = require('path');

// ════════════════════════════════════════════════════════════════════════════════
// ERROR LOGGING FUNCTION
// ════════════════════════════════════════════════════════════════════════════════
const logError = (err, req = null) => {
    const timestamp = new Date().toISOString();
    const errorEntry = {
        timestamp,
        message: err.message,
        stack: err.stack,
        code: err.code,
        errno: err.errno,
        sqlState: err.sqlState,
        sqlMessage: err.sqlMessage,
        url: req ? req.url : 'N/A',
        method: req ? req.method : 'N/A',
        ip: req ? req.ip : 'N/A',
        userAgent: req ? req.get('User-Agent') : 'N/A'
    };

    // Console logging
    console.error('❌ [ERROR]', {
        message: err.message,
        code: err.code,
        url: req ? `${req.method} ${req.url}` : 'N/A',
        ip: req ? req.ip : 'N/A'
    });

    // File logging in production
    if (process.env.NODE_ENV === 'production') {
        const logDir = path.join(__dirname, '..', 'logs');
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }

        const logFile = path.join(logDir, `error-${new Date().toISOString().split('T')[0]}.log`);
        const logLine = JSON.stringify(errorEntry) + '\n';

        try {
            fs.appendFileSync(logFile, logLine);
        } catch (logErr) {
            console.error('❌ [LOG ERROR] Failed to write error log:', logErr.message);
        }
    }
};

// ════════════════════════════════════════════════════════════════════════════════
// DATABASE ERROR HANDLER
// ════════════════════════════════════════════════════════════════════════════════
const handleDatabaseError = (err) => {
    // MySQL error codes and their user-friendly messages
    const dbErrors = {
        'ECONNREFUSED': 'Database connection refused',
        'ER_ACCESS_DENIED_ERROR': 'Database access denied',
        'ER_BAD_DB_ERROR': 'Database does not exist',
        'ER_NO_SUCH_TABLE': 'Table does not exist',
        'ER_DUP_ENTRY': 'Duplicate entry',
        'ER_PARSE_ERROR': 'SQL syntax error',
        'ER_NO_REFERENCED_ROW': 'Referenced record does not exist',
        'ER_ROW_IS_REFERENCED': 'Cannot delete: record is referenced',
        'ETIMEDOUT': 'Database connection timeout',
        'PROTOCOL_CONNECTION_LOST': 'Database connection lost',
        'ER_LOCK_WAIT_TIMEOUT': 'Database lock timeout',
        'ER_LOCK_DEADLOCK': 'Database deadlock detected'
    };

    const friendlyMessage = dbErrors[err.code] || 'Database operation failed';

    return {
        type: 'database',
        code: err.code,
        message: friendlyMessage,
        details: process.env.NODE_ENV === 'development' ? err.message : undefined
    };
};

// ════════════════════════════════════════════════════════════════════════════════
// VALIDATION ERROR HANDLER
// ════════════════════════════════════════════════════════════════════════════════
const handleValidationError = (err) => {
    const errors = {};

    // Handle different validation error formats
    if (err.errors) {
        // Joi validation errors
        err.errors.forEach(error => {
            errors[error.path.join('.')] = error.message;
        });
    } else if (err.details) {
        // Another validation format
        err.details.forEach(detail => {
            errors[detail.path.join('.')] = detail.message;
        });
    } else {
        // Generic validation error
        errors.general = err.message;
    }

    return {
        type: 'validation',
        message: 'Validation failed',
        errors: errors
    };
};

// ════════════════════════════════════════════════════════════════════════════════
// MAIN ERROR HANDLING MIDDLEWARE
// ════════════════════════════════════════════════════════════════════════════════
const errorHandler = (err, req, res, next) => {
    // Log the error
    logError(err, req);

    // Default error response
    let statusCode = err.status || err.statusCode || 500;
    let errorResponse = {
        error: err.message || 'Internal server error',
    };

    // If it's a NotFoundError, ensure we use the specific format requested
    if (err.name === 'NotFoundError' || statusCode === 404) {
        errorResponse.error = `Route not found: ${req.method} ${req.originalUrl}`;
        statusCode = 404;
    } else if (err.code && err.code.startsWith('ER_')) {
        // MySQL database errors
        const dbError = handleDatabaseError(err);
        errorResponse.error = dbError.message;
        statusCode = 500;
    } else if (err.name === 'ValidationError' || err.isJoi) {
        // Validation errors
        const validationError = handleValidationError(err);
        errorResponse.error = `Validation failed: ${JSON.stringify(validationError.errors)}`;
        statusCode = 400;
    }

    // Add stack trace in development
    if (process.env.NODE_ENV === 'development') {
        errorResponse.stack = err.stack;
    }

    // Send error response
    res.status(statusCode).json(errorResponse);
};

// ════════════════════════════════════════════════════════════════════════════════
// ASYNC ERROR WRAPPER
// ════════════════════════════════════════════════════════════════════════════════
const asyncHandler = (fn) => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};

// ════════════════════════════════════════════════════════════════════════════════
// 404 HANDLER
// ════════════════════════════════════════════════════════════════════════════════
const notFoundHandler = (req, res, next) => {
    const error = new Error(`Route not found: ${req.method} ${req.originalUrl}`);
    error.name = 'NotFoundError';
    error.status = 404;
    next(error);
};

// ════════════════════════════════════════════════════════════════════════════════
// REQUEST TIMEOUT MIDDLEWARE
// ════════════════════════════════════════════════════════════════════════════════
const requestTimeout = (timeoutMs = 30000) => {
    return (req, res, next) => {
        const timeout = setTimeout(() => {
            if (!res.headersSent) {
                const error = new Error('Request timeout');
                error.status = 408;
                next(error);
            }
        }, timeoutMs);

        res.on('finish', () => {
            clearTimeout(timeout);
        });

        next();
    };
};

// ════════════════════════════════════════════════════════════════════════════════
// EXPORT MIDDLEWARE
// ════════════════════════════════════════════════════════════════════════════════
module.exports = {
    errorHandler,
    asyncHandler,
    notFoundHandler,
    requestTimeout,
    logError,
    handleDatabaseError,
    handleValidationError
};
