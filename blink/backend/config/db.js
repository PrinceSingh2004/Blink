/**
 * backend/config/db.js
 * ═══════════════════════════════════════════════════════════
 * Railway MySQL Connection Pool – Production Grade (SSL Enabled)
 * ═══════════════════════════════════════════════════════════
 */

const mysql = require('mysql2/promise');
require('dotenv').config();

// 🛡️ Pre-connection verification
const requiredEnv = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'DB_PORT'];
const missing = requiredEnv.filter(k => !process.env[k]);
if (missing.length > 0) {
    console.error(`[DB ERROR] ❌ Missing environment variables: ${missing.join(', ')}`);
}

const pool = mysql.createPool({
    host:               process.env.DB_HOST || 'autorack.proxy.rlwy.net',
    user:               process.env.DB_USER || 'root',
    password:           process.env.DB_PASSWORD,
    database:           process.env.DB_NAME || 'railway',
    port:               parseInt(process.env.DB_PORT) || 3306,
    ssl: {
        rejectUnauthorized: false // 🛡️ Required for secure Railway connections
    },
    waitForConnections:  true,
    connectionLimit:    10,
    queueLimit:         0,
    connectTimeout:     20000 // Increased for remote cloud handshake
});

// 🧪 Promised Connection Test Helper
pool.testConnection = async () => {
    try {
        const conn = await pool.getConnection();
        const [rows] = await conn.query('SELECT 1 as connection_test');
        conn.release();
        return { success: true, message: "Database Connected Successfully" };
    } catch (err) {
        let errMsg = err.message;
        if (err.code === 'ECONNREFUSED') errMsg = "Connection Refused: Check DB_HOST and DB_PORT.";
        if (err.code === 'ER_ACCESS_DENIED_ERROR') errMsg = "Access Denied: Check DB_USER and DB_PASSWORD.";
        return { success: false, code: err.code, message: errMsg };
    }
};

module.exports = pool;
