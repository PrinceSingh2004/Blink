require('dotenv').config();
const mysql = require('mysql2/promise');

async function fix() {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'blink_app'
    });

    const [cols] = await conn.query('DESCRIBE videos');
    const [rows] = await conn.query('SELECT COUNT(*) AS cnt FROM videos');
    const fs = require('fs');
    const lines = cols.map(c => `${c.Field} | ${c.Type} | null=${c.Null} | default=${c.Default}`);
    lines.push('');
    lines.push('Row count: ' + rows[0].cnt);
    fs.writeFileSync('db_check_result.txt', lines.join('\n'));
    console.log('Written to db_check_result.txt');
    await conn.end();
}

fix().catch(e => console.error(e.message));
