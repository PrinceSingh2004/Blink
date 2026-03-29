/**
 * backend/config/db.js
 * ═══════════════════════════════════════════════════════════
 * Railway MySQL Connection Pool – Production Grade (SSL Enabled)
 * ═══════════════════════════════════════════════════════════
 */

const mysql = require('mysql2/promise');
require('dotenv').config();

// ════════════════════════════════════════════════════════════════════════════════
// ENVIRONMENT VALIDATION
// ════════════════════════════════════════════════════════════════════════════════
const requiredEnv = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
const missing = requiredEnv.filter(k => !process.env[k]);

if (missing.length > 0 && process.env.NODE_ENV === 'production') {
    console.error(`[DB ERROR] ❌ Missing environment variables: ${missing.join(', ')}`);
    console.error('Configure .env file with:');
    missing.forEach(k => console.error(`  - ${k}`));
}

// ════════════════════════════════════════════════════════════════════════════════
// CREATE CONNECTION POOL
// ════════════════════════════════════════════════════════════════════════════════
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'railway',
    port: parseInt(process.env.DB_PORT) || 3306,
    ssl: process.env.DB_HOST?.includes('proxy.rlwy.net') ? {
        rejectUnauthorized: false
    } : undefined,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelayMs: 0,
    connectTimeout: 20000
});

// ════════════════════════════════════════════════════════════════════════════════
// CONNECTION TEST HELPER
// ════════════════════════════════════════════════════════════════════════════════
pool.testConnection = async () => {
    try {
        const conn = await pool.getConnection();
        const [rows] = await conn.query('SELECT 1 as connection_test');
        conn.release();
        console.log('✅ [DB] Connection successful');
        return { success: true, message: 'Database Connected Successfully' };
    } catch (err) {
        console.error('❌ [DB ERROR]', err.message);
        let errMsg = err.message;
        
        if (err.code === 'ECONNREFUSED') 
            errMsg = 'Connection Refused: Check DB_HOST and DB_PORT.';
        if (err.code === 'ER_ACCESS_DENIED_ERROR') 
            errMsg = 'Access Denied: Check DB_USER and DB_PASSWORD.';
        if (err.code === 'ER_BAD_DB_ERROR')
            errMsg = 'Database does not exist: Create database first.';
            
        return { success: false, code: err.code, message: errMsg };
    }
};

// ════════════════════════════════════════════════════════════════════════════════
// AUTO TEST CONNECTION ON STARTUP
// ════════════════════════════════════════════════════════════════════════════════
setTimeout(() => {
    pool.testConnection().then(result => {
        if (!result.success && process.env.NODE_ENV === 'production') {
            console.error('[CRITICAL] Database connection failed in production');
        }
    });
}, 1000);

module.exports = pool;
