/**
 * db/config.js – MySQL Connection Pool (Railway Ready)
 */
const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
    host:               process.env.DB_HOST     || 'localhost',
    user:               process.env.DB_USER     || 'root',
    password:           process.env.DB_PASSWORD || '',
    database:           process.env.DB_NAME     || 'blink_db',
    port:               parseInt(process.env.DB_PORT || '3306', 10),
    ssl:                process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    waitForConnections: true,
    connectionLimit:    20,
    queueLimit:         0,
    connectTimeout:     30000,
    timezone:           '+00:00'
});

// Test connection on startup
pool.getConnection()
    .then(conn => {
        console.log('✅ MySQL connected to Railway');
        conn.release();
    })
    .catch(err => {
        console.error('❌ MySQL connection failed:', err.message);
    });

module.exports = pool;
