const mysql = require('mysql2');

const pool = mysql.createPool({
    host:     process.env.DB_HOST     || 'localhost',
    user:     process.env.DB_USER     || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME     || 'blink_app',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Promisify the pool for async/await usage
const db = pool.promise();

// Initialize the blink_app database tables on startup
async function initDatabase() {
    try {
        // Ensure database exists first (connect without db to create it)
        const rawPool = mysql.createPool({
            host:     process.env.DB_HOST     || 'localhost',
            user:     process.env.DB_USER     || 'root',
            password: process.env.DB_PASSWORD || '',
            waitForConnections: true,
            connectionLimit: 2
        });
        const rawDb = rawPool.promise();
        await rawDb.query(`CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME || 'blink_app'}\``);
        await rawDb.end(); // FIX: call .end() on the promise pool directly

        // Users table
        await db.query(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                email VARCHAR(100) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                display_name VARCHAR(100),
                profile_photo VARCHAR(255) DEFAULT '/default-avatar.png',
                bio TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Videos table – migration-safe (works even if table already exists)
        await db.query(`
            CREATE TABLE IF NOT EXISTS videos (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT DEFAULT 1,
                video_url VARCHAR(500) NOT NULL,
                thumbnail_url VARCHAR(500),
                caption TEXT,
                hashtags VARCHAR(255),
                mood_category VARCHAR(50) DEFAULT 'General',
                is_blink_moment TINYINT(1) DEFAULT 0,
                likes INT DEFAULT 0,
                views INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Migration helper: add a column only if it doesn't already exist
        async function addColumnIfMissing(table, column, definition) {
            const [[{ cnt }]] = await db.query(
                `SELECT COUNT(*) AS cnt
                 FROM INFORMATION_SCHEMA.COLUMNS
                 WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
                [process.env.DB_NAME || 'blink_app', table, column]
            );
            if (cnt === 0) {
                await db.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
                console.log(`[DB] Added column: ${table}.${column}`);
            }
        }

        // Ensure all required columns exist in the videos table
        await addColumnIfMissing('videos', 'video_url',       'VARCHAR(500)');
        await addColumnIfMissing('videos', 'thumbnail_url',   'VARCHAR(500)');
        await addColumnIfMissing('videos', 'caption',         'TEXT');
        await addColumnIfMissing('videos', 'hashtags',        'VARCHAR(255)');
        await addColumnIfMissing('videos', 'mood_category',   "VARCHAR(50) DEFAULT 'General'");
        await addColumnIfMissing('videos', 'is_blink_moment', 'TINYINT(1) DEFAULT 0');
        await addColumnIfMissing('videos', 'likes',           'INT DEFAULT 0');
        await addColumnIfMissing('videos', 'views',           'INT DEFAULT 0');
        await addColumnIfMissing('videos', 'user_id',         'INT DEFAULT 1');

        // Ensure all required columns exist in the users table
        await addColumnIfMissing('users', 'display_name',   'VARCHAR(100)');
        await addColumnIfMissing('users', 'profile_photo',  "VARCHAR(255) DEFAULT '/default-avatar.png'");
        await addColumnIfMissing('users', 'bio',            'TEXT');

        // Seed demo videos only if the table has no rows with a video_url
        const [rows] = await db.query("SELECT COUNT(*) AS cnt FROM videos WHERE video_url IS NOT NULL AND video_url != ''");
        if (rows[0].cnt === 0) {
            console.log('[DB] Seeding demo videos...');
            const DEMO_URL = 'https://www.w3schools.com/html/mov_bbb.mp4';
            // FIX: Only insert columns that exist in the CREATE TABLE schema
            const demoVideos = [
                [1, DEMO_URL, null, 'Building the future of AI! 🚀 #tech #coding',    '#tech #coding #ai', 'Learning',    0, 124000,   980000],
                [1, DEMO_URL, null, 'Epic boss fight! 🎮🔥',                           '#gaming #boss',     'Gaming',      1, 3000000, 14000000],
                [1, DEMO_URL, null, 'Never give up! 💪 Stay focused #motivation',     '#motivation',       'Motivation',  0, 800000,  4200000],
                [1, DEMO_URL, null, 'Late night coding vibes ✨ #dev',                '#dev #code',        'Learning',    0,  45000,   210000],
                [1, DEMO_URL, null, 'My weekend project went viral! 😱',              '#project #viral',   'General',     0, 2100000, 9800000],
                [1, DEMO_URL, null, 'That moment when it COMPILES 🙌',               '#coding #life',     'Learning',    0, 560000,  3100000],
                [1, DEMO_URL, null, 'Gaming at 3AM hits different 🌙',               '#gaming #night',    'Gaming',      1, 1200000, 5600000],
                [1, DEMO_URL, null, '🎵 New music drop — feel the beat',             '#music #vibe',      'Music',       0, 340000,  1500000],
                [1, DEMO_URL, null, 'Happy moments 😊🌸 #happy #life',               '#happy #life',      'Happy',       0,  89000,   420000],
                [1, DEMO_URL, null, 'Day in the life of a dev 👨‍💻',              '#devlife #tech',    'Learning',    0,  76000,   340000],
            ];
            await db.query(
                `INSERT INTO videos (user_id, video_url, thumbnail_url, caption, hashtags, mood_category, is_blink_moment, likes, views) VALUES ?`,
                [demoVideos]
            );
            console.log('[DB] Seeded 10 demo videos.');
        }

        console.log('[DB] All tables initialized.');
    } catch (err) {
        console.error('[DB] Init error:', err.message);
    }
}

module.exports = { db, initDatabase };
