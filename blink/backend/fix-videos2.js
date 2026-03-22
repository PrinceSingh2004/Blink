require('dotenv').config();
const mysql = require('mysql2/promise');

const RELIABLE_VIDEOS = [
    'https://res.cloudinary.com/demo/video/upload/v1688040434/elephants.mp4',
    'https://res.cloudinary.com/demo/video/upload/v1688040434/sea-turtle.mp4',
    'https://res.cloudinary.com/demo/video/upload/v1642152862/docs/cld-mountain-video.mp4',
    'https://res.cloudinary.com/demo/video/upload/v1688040434/skiing.mp4',
    'https://res.cloudinary.com/demo/video/upload/v1688040434/skater.mp4',
    'https://www.w3schools.com/html/mov_bbb.mp4',
    'https://res.cloudinary.com/demo/video/upload/q_auto,f_auto/docs/hotel.mp4'
];

(async () => {
    const db = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT) || 3306,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
    });

    console.log('[fix] Connected to DB to apply reliable CDN URLs');

    const [videos] = await db.query('SELECT id FROM videos');
    
    for (let i = 0; i < videos.length; i++) {
        const v = videos[i];
        const newUrl = RELIABLE_VIDEOS[i % RELIABLE_VIDEOS.length];
        await db.query('UPDATE videos SET video_url = ? WHERE id = ?', [newUrl, v.id]);
        console.log(`[fix] Video #${v.id} -> ${newUrl}`);
    }

    console.log('[fix] Updated all videos with reliable Cloudinary/W3S URLs.');
    await db.end();
})().catch(err => console.error(err.message));
