require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');

(async () => {
    const db = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT) || 3306,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
    });

    const [videos] = await db.query('SELECT id, video_url FROM videos ORDER BY id');
    const result = JSON.stringify(videos, null, 2);
    fs.writeFileSync('c:/tmp/blink_diag.json', result, 'utf8');
    console.log('DONE - ' + videos.length + ' videos');
    await db.end();
})().catch(err => console.error(err.message));
