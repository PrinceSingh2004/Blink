// One-time migration: add all needed columns to the videos table
require('dotenv').config();
const mysql = require('mysql2/promise');

async function migrate() {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'blink_app'
    });

    const needed = [
        ['video_url',       'VARCHAR(500)'],
        ['thumbnail_url',   'VARCHAR(500)'],
        ['caption',         'TEXT'],
        ['hashtags',        'VARCHAR(255)'],
        ['mood_category',   "VARCHAR(50) DEFAULT 'General'"],
        ['is_blink_moment', 'TINYINT(1) DEFAULT 0'],
        ['likes',           'INT DEFAULT 0'],
        ['views',           'INT DEFAULT 0'],
        ['user_id',         'INT DEFAULT 1'],
    ];

    for (const [col, def] of needed) {
        const [[{ cnt }]] = await conn.query(
            `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'videos' AND COLUMN_NAME = ?`,
            [process.env.DB_NAME || 'blink_app', col]
        );
        if (cnt === 0) {
            await conn.query(`ALTER TABLE videos ADD COLUMN \`${col}\` ${def}`);
            console.log(`✅ Added: ${col}`);
        } else {
            console.log(`⏭  Already exists: ${col}`);
        }
    }

    // Seed if empty
    const [[{ cnt }]] = await conn.query("SELECT COUNT(*) AS cnt FROM videos WHERE video_url IS NOT NULL AND video_url != ''");
    if (cnt === 0) {
        console.log('Seeding demo videos...');
        const url = 'https://www.w3schools.com/html/mov_bbb.mp4';
        const seeds = [
            ['demo_1.mp4', url, url, 'Building the future of AI! 🚀 #tech #coding',    '#tech #coding #ai', 'Learning',   0, 124000,  980000, 1],
            ['demo_2.mp4', url, url, 'Epic boss fight! 🎮🔥',                            '#gaming #boss',    'Gaming',     1,3000000,14000000, 1],
            ['demo_3.mp4', url, url, 'Never give up! 💪 Stay focused #motivation',      '#motivation',      'Motivation', 0, 800000, 4200000, 1],
            ['demo_4.mp4', url, url, 'Late night coding vibes ✨ #dev',                 '#dev #code',       'Learning',   0,  45000,  210000, 1],
            ['demo_5.mp4', url, url, 'My weekend project went viral! 😱',               '#project #viral',  'General',    0,2100000, 9800000, 1],
            ['demo_6.mp4', url, url, 'That moment when it COMPILES 🙌',                '#coding #life',    'Learning',   0, 560000, 3100000, 1],
            ['demo_7.mp4', url, url, 'Gaming at 3AM hits different 🌙',                '#gaming #night',   'Gaming',     1,1200000, 5600000, 1],
            ['demo_8.mp4', url, url, '🎵 New music drop — feel the beat',              '#music #vibe',     'Music',      0, 340000, 1500000, 1],
            ['demo_9.mp4', url, url, 'Happy moments 😊🌸 #happy #life',               '#happy #life',     'Happy',      0,  89000,  420000, 1],
            ['demo_10.mp4',url, url, 'Day in the life of a dev 👨‍💻',              '#devlife #tech',   'Learning',   0,  76000,  340000, 1],
        ];
        await conn.query(
            `INSERT INTO videos (filename, filepath, video_url, caption, hashtags, mood_category, is_blink_moment, likes, views, user_id) VALUES ?`,
            [seeds]
        );
        console.log('✅ Seeded 10 demo videos.');
    } else {
        console.log(`⏭  ${cnt} videos already exist with video_url, skipping seed.`);
    }

    await conn.end();
    console.log('Migration complete!');
}

migrate().catch(e => { console.error('Migration failed:', e.message); process.exit(1); });
