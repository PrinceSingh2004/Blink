/**
 * config/db.js — Single MySQL Connection Pool (Railway)
 * ═══════════════════════════════════════════════════════
 * One pool. One export. No duplicates.
 */

const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
    host:     process.env.DB_HOST || 'localhost',
    user:     process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'blink_db',
    port:     parseInt(process.env.DB_PORT, 10) || 3306,
    waitForConnections: true,
    connectionLimit:    10,
    queueLimit:         0,
    connectTimeout:     30000,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined
});

/**
 * Initialize database schema — idempotent
 */
const initDB = async () => {
    try {
        console.log('🔄 Syncing database schema...');

        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(100) UNIQUE NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                profile_photo TEXT DEFAULT NULL,
                bio TEXT DEFAULT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS sessions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                token TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS videos (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                video_url TEXT NOT NULL,
                thumbnail_url TEXT DEFAULT NULL,
                caption TEXT DEFAULT NULL,
                hashtags TEXT DEFAULT NULL,
                duration INT DEFAULT 0,
                likes_count INT DEFAULT 0,
                views_count INT DEFAULT 0,
                comments_count INT DEFAULT 0,
                is_active TINYINT(1) DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS likes (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                video_id INT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY unique_like (user_id, video_id),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS comments (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                video_id INT NOT NULL,
                text VARCHAR(1000) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS views (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT DEFAULT NULL,
                video_id INT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
                FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
            )
        `);

        // Safe migrations: check and add user_id column to videos if userId exists or if both missing
        const [vCols] = await pool.query(`SHOW COLUMNS FROM videos`);
        const colNames = vCols.map(c => c.Field);
        
        if (colNames.includes('userId') && !colNames.includes('user_id')) {
            await pool.query(`ALTER TABLE videos CHANGE userId user_id INT NOT NULL`);
            console.log('✅ Migrated videos.userId to user_id');
        } else if (!colNames.includes('user_id')) {
            await pool.query(`ALTER TABLE videos ADD COLUMN user_id INT NOT NULL AFTER id`);
            console.log('✅ Added missing user_id column to videos.');
        }

        // Fix remaining tables
        const tables = ['likes', 'comments', 'views'];
        for (const table of tables) {
            const [tCols] = await pool.query(`SHOW COLUMNS FROM ${table}`);
            const tColNames = tCols.map(c => c.Field);
            if (tColNames.includes('userId') && !tColNames.includes('user_id')) {
                await pool.query(`ALTER TABLE ${table} CHANGE userId user_id INT NOT NULL`);
            }
            if (tColNames.includes('videoId') && !tColNames.includes('video_id')) {
                await pool.query(`ALTER TABLE ${table} CHANGE videoId video_id INT NOT NULL`);
            }
        }

        await pool.query(`
            CREATE TABLE IF NOT EXISTS conversations (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user1_id INT NOT NULL,
                user2_id INT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY unique_pals (user1_id, user2_id),
                FOREIGN KEY (user1_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (user2_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS messages (
                id INT AUTO_INCREMENT PRIMARY KEY,
                conversation_id INT NOT NULL,
                sender_id INT NOT NULL,
                text TEXT DEFAULT NULL,
                media_url TEXT DEFAULT NULL,
                seen TINYINT(1) DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
                FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        console.log('✅ Database schema synchronized.');
    } catch (err) {
        console.error('❌ Schema sync error:', err.message);
    }
};

/**
 * Test database connection
 */
const testConnection = async () => {
    try {
        const conn = await pool.getConnection();
        console.log('✅ Database connected successfully.');
        conn.release();
        return { success: true, message: 'Connected' };
    } catch (err) {
        console.error('❌ Database connection failed:', err.message);
        return { success: false, message: err.message };
    }
};

module.exports = { pool, initDB, testConnection };
