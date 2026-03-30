const mysql = require('mysql2/promise');
require('dotenv').config();

// Create the connection pool with keep-alive for Railway/Render
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: parseInt(process.env.DB_PORT) || 3306,
    ssl: { rejectUnauthorized: false }, // Required for Railway/Render SSL
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000, 
    idleTimeout: 60000 
});

// Immediate test to confirm connection
pool.getConnection()
    .then(conn => {
        console.log('✅ Railway MySQL Connected (External TCP): gondola.proxy.rlwy.net');
        conn.release();
    })
    .catch(err => {
        console.error('❌ Connection Failed! Error:', err.message);
    });

module.exports = pool;
