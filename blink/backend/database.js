const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'railway',
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 15,
    queueLimit: 0
});

pool.getConnection()
    .then(conn => {
        console.log('✅ Connected exclusively to MySQL (Railway)');
        conn.release();
    })
    .catch(err => {
        console.error('❌ Database connection error:', err);
    });

module.exports = pool;
