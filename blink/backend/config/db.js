/**
 * backend/config/db.js
 * ═══════════════════════════════════════════════════════════
 * Railway MySQL Connection Pool – Cloud Production Config
 * ═══════════════════════════════════════════════════════════
 */

const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
    host:               process.env.DB_HOST,
    user:               process.env.DB_USER,
    password:           process.env.DB_PASSWORD,
    database:           process.env.DB_NAME,
    port:               parseInt(process.env.DB_PORT) || 3306,
    waitForConnections:  true,
    connectionLimit:    20, 
    queueLimit:         0,
    connectTimeout:     10000 
});

// Test connection on startup (Production logging)
(async () => {
    try {
        const conn = await pool.getConnection();
        console.log(`[DB] ✅ Railway MySQL Connected: ${process.env.DB_NAME}`);
        conn.release();
    } catch (err) {
        console.error('[DB] ❌ Railway Connection Failed.');
        console.error('[DB] Error:', err.message);
    }
})();

module.exports = pool;
