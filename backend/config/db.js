/**
 * config/db.js
 * ═══════════════════════════════════════════════════════════
 * Blink – High-Performance MySQL Connection Pool
 * Features: Auto-reconnect, Promise support, Production-ready
 * ═══════════════════════════════════════════════════════════ */
const mysql = require('mysql2');
const dotenv = require('dotenv');

dotenv.config();

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'blink_db',
    waitForConnections: true,
    connectionLimit: 15,
    queueLimit: 0,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : null
}).promise();

module.exports = pool;
