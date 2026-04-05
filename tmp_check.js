const mysql = require('mysql2/promise');
require('dotenv').config({ path: './blink/backend/.env' });

async function check() {
    const pool = mysql.createPool({
        host:     process.env.DB_HOST,
        user:     process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port:     parseInt(process.env.DB_PORT, 10),
        ssl: { rejectUnauthorized: false }
    });

    try {
        const [rows] = await pool.query('SHOW COLUMNS FROM videos');
        console.log(rows);
    } catch (e) {
        console.error(e);
    }
    process.exit();
}
check();
