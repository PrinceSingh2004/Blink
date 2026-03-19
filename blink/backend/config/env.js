const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// ── Validate required production variables ────────────────────
const REQUIRED_IN_PROD = ['JWT_SECRET', 'DB_HOST', 'DB_USER', 'DB_NAME'];
if (process.env.NODE_ENV === 'production') {
    REQUIRED_IN_PROD.forEach(key => {
        if (!process.env[key]) {
            console.error(`[Config] FATAL: Missing required env var: ${key}`);
            process.exit(1);
        }
    });
}

module.exports = {
    NODE_ENV:     process.env.NODE_ENV     || 'development',
    PORT:         parseInt(process.env.PORT) || 4000,

    // Database
    DB_HOST:      process.env.DB_HOST      || 'localhost',
    DB_USER:      process.env.DB_USER      || 'root',
    DB_PASSWORD:  process.env.DB_PASSWORD  || '',
    DB_NAME:      process.env.DB_NAME      || 'blink_app',
    DB_PORT:      parseInt(process.env.DB_PORT) || 3306,
    DB_SSL:       process.env.DB_SSL === 'true',

    // Auth
    JWT_SECRET:   process.env.JWT_SECRET   || 'blink_super_secret_change_in_production',
    JWT_EXPIRES:  process.env.JWT_EXPIRES  || '7d',

    // Email (for OTP / password reset)
    EMAIL_USER:   process.env.EMAIL_USER   || '',
    EMAIL_PASS:   process.env.EMAIL_PASS   || '',

    // CORS / Frontend origin
    CLIENT_URL:   process.env.CLIENT_URL   || '',
};
