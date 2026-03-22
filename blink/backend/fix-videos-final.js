require('dotenv').config();
const mysql = require('mysql2/promise');

// Official Google Chrome Media Test Videos (100% reliable, no CORS issues, no 404s, no 403s)
const GOOGLE_TEST_VIDEOS = [
    'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
    'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
    'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4',
    'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4',
    'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4',
    'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
    'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/SubaruOutbackOnStreetAndDirt.mp4',
    'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4'
];

(async () => {
    const db = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT) || 3306,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
    });

    console.log('[fix] Connected to DB to apply Google Test Videos');

    const [videos] = await db.query('SELECT id FROM videos');
    
    for (let i = 0; i < videos.length; i++) {
        const v = videos[i];
        const newUrl = GOOGLE_TEST_VIDEOS[i % GOOGLE_TEST_VIDEOS.length];
        await db.query('UPDATE videos SET video_url = ? WHERE id = ?', [newUrl, v.id]);
        console.log(`[fix] Video #${v.id} -> ${newUrl}`);
    }

    console.log('[fix] Updated all videos with 100% reliable Google Test URLs.');
    await db.end();
})().catch(err => console.error(err.message));
