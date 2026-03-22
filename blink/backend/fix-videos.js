/**
 * fix-videos.js — Replace broken local video_urls with public sample videos
 * 
 * Problem: The database has URLs like /uploads/videos/1774030932622.mp4
 *          but those files don't exist locally (they were uploaded to a different server).
 *
 * Solution: Replace them with real public MP4 URLs so videos actually play.
 *           These are royalty-free Pexels videos (all vertical/9:16 for Reels format).
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

// Public vertical (9:16) sample videos — royalty-free from Pexels CDN
const SAMPLE_VIDEOS = [
    'https://videos.pexels.com/video-files/4434242/4434242-hd_1080_1920_30fps.mp4',  // City lights
    'https://videos.pexels.com/video-files/3571264/3571264-uhd_1440_2560_30fps.mp4',  // Ocean waves
    'https://videos.pexels.com/video-files/4763824/4763824-uhd_1440_2560_24fps.mp4',  // Nature sunset
    'https://videos.pexels.com/video-files/5532771/5532771-hd_1080_1920_25fps.mp4',  // Abstract art
    'https://videos.pexels.com/video-files/3209828/3209828-uhd_1440_2560_25fps.mp4',  // Clouds timelapse
    'https://videos.pexels.com/video-files/4625518/4625518-hd_1080_1920_30fps.mp4',  // Neon lights
    'https://videos.pexels.com/video-files/4434149/4434149-hd_1080_1920_30fps.mp4',  // City traffic
];

(async () => {
    const db = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT) || 3306,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
    });

    console.log('[fix] Connected to Railway DB');

    // Get all videos with local URLs
    const [videos] = await db.query('SELECT id, video_url FROM videos WHERE video_url NOT LIKE "http%"');
    console.log(`[fix] Found ${videos.length} videos with local URLs (broken)`);

    if (videos.length === 0) {
        console.log('[fix] No broken URLs found. All good!');
        await db.end();
        return;
    }

    // Update each one with a sample video
    for (let i = 0; i < videos.length; i++) {
        const v = videos[i];
        const newUrl = SAMPLE_VIDEOS[i % SAMPLE_VIDEOS.length];
        await db.query('UPDATE videos SET video_url = ? WHERE id = ?', [newUrl, v.id]);
        console.log(`[fix] Video #${v.id}: ${v.video_url} -> ${newUrl.substring(0, 60)}...`);
    }

    console.log(`[fix] Updated ${videos.length} videos with public CDN URLs`);
    console.log('[fix] Videos should now play in the feed!');

    await db.end();
})().catch(err => {
    console.error('[fix] Error:', err.message);
    process.exit(1);
});
