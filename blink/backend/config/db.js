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
            CREATE TABLE IF NOT EXISTS videos (
                id INT AUTO_INCREMENT PRIMARY KEY,
                userId INT NOT NULL,
                videoUrl TEXT NOT NULL,
                thumbnailUrl TEXT DEFAULT NULL,
                caption TEXT DEFAULT NULL,
                hashtags TEXT DEFAULT NULL,
                duration INT DEFAULT 0,
                likes_count INT DEFAULT 0,
                views_count INT DEFAULT 0,
                comments_count INT DEFAULT 0,
                is_active TINYINT(1) DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS likes (
                id INT AUTO_INCREMENT PRIMARY KEY,
                userId INT NOT NULL,
                videoId INT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY unique_like (userId, videoId),
                FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (videoId) REFERENCES videos(id) ON DELETE CASCADE
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS comments (
                id INT AUTO_INCREMENT PRIMARY KEY,
                userId INT NOT NULL,
                videoId INT NOT NULL,
                text VARCHAR(1000) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (videoId) REFERENCES videos(id) ON DELETE CASCADE
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS views (
                id INT AUTO_INCREMENT PRIMARY KEY,
                userId INT DEFAULT NULL,
                videoId INT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (userId) REFERENCES users(id) ON DELETE SET NULL,
                FOREIGN KEY (videoId) REFERENCES videos(id) ON DELETE CASCADE
            )
        `);

        // Safe schema migrations — compatible with MySQL 5.7 and 8.0
        // Check if comments_count column exists before adding
        const [cols] = await pool.query(`
            SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'videos'
              AND COLUMN_NAME = 'comments_count'
        `);
        if (cols.length === 0) {
            await pool.query(`ALTER TABLE videos ADD COLUMN comments_count INT DEFAULT 0`);
            console.log('✅ Added missing comments_count column.');
        }

        await pool.query(`
            CREATE TABLE IF NOT EXISTS conversations (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user1_id INT NOT NULL,
                user2_id INT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY unique_conv (user1_id, user2_id),
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

        await pool.query(`
            CREATE TABLE IF NOT EXISTS follows (
                id INT AUTO_INCREMENT PRIMARY KEY,
                follower_id INT NOT NULL,
                following_id INT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY unique_follow (follower_id, following_id),
                FOREIGN KEY (follower_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (following_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        // Safe schema migrations
        const [mCols] = await pool.query(`
            SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'messages'
              AND COLUMN_NAME = 'conversation_id'
        `);
        if (mCols.length === 0) {
            await pool.query(`ALTER TABLE messages ADD COLUMN conversation_id INT NOT NULL`);
            console.log('✅ Added missing conversation_id column to messages.');
        }

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
