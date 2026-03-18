require('dotenv').config();
const mysql = require('mysql2');

async function initDatabase() {
    // Step 1: Create database if it doesn't exist
    const rawPool = mysql.createPool({
        host:               process.env.DB_HOST     || 'localhost',
        user:               process.env.DB_USER     || 'root',
        password:           process.env.DB_PASSWORD || '',
        waitForConnections: true,
        connectionLimit:    2
    }).promise();

    const dbName = process.env.DB_NAME || 'blink_app';
    await rawPool.query(
        `CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    await rawPool.end();

    // Step 2: Use the app pool
    const db = require('./db');

    // ── Helper: check if column exists ───────────────────────
    async function columnExists(table, column) {
        const [rows] = await db.query(
            `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
            [table, column]
        );
        return rows[0].cnt > 0;
    }

    // ── Helper: check if table exists ─────────────────────────
    async function tableExists(table) {
        const [rows] = await db.query(
            `SELECT COUNT(*) AS cnt FROM information_schema.TABLES
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
            [table]
        );
        return rows[0].cnt > 0;
    }

    // ── USERS: migrate or create ──────────────────────────────
    const usersExist = await tableExists('users');

    if (usersExist) {
        // Detect old schema (old server used 'contact' instead of 'email')
        const hasContact      = await columnExists('users', 'contact');
        const hasPasswordHash = await columnExists('users', 'password_hash');

        if (hasContact || !hasPasswordHash) {
            console.log('[DB] ⚠️  Detected old users schema – migrating…');
            // Drop foreign key constraints first so we can drop the table
            try {
                const [fks] = await db.query(
                    `SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
                     WHERE TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME = 'users'`
                );
                for (const fk of fks) {
                    const [[{ tbl }]] = await db.query(
                        `SELECT TABLE_NAME AS tbl FROM information_schema.KEY_COLUMN_USAGE
                         WHERE TABLE_SCHEMA = DATABASE() AND CONSTRAINT_NAME = ?`, [fk.CONSTRAINT_NAME]
                    );
                    await db.query(`ALTER TABLE \`${tbl}\` DROP FOREIGN KEY \`${fk.CONSTRAINT_NAME}\``).catch(() => {});
                }
            } catch {}
            // Now drop and recreate
            await db.query('SET FOREIGN_KEY_CHECKS=0').catch(() => {});
            await db.query('DROP TABLE IF EXISTS messages').catch(() => {});
            await db.query('DROP TABLE IF EXISTS followers').catch(() => {});
            await db.query('DROP TABLE IF EXISTS comments').catch(() => {});
            await db.query('DROP TABLE IF EXISTS video_likes').catch(() => {});
            await db.query('DROP TABLE IF EXISTS videos').catch(() => {});
            await db.query('DROP TABLE IF EXISTS users').catch(() => {});
            await db.query('SET FOREIGN_KEY_CHECKS=1').catch(() => {});
            console.log('[DB] 🗑️  Old tables dropped. Recreating with new schema…');
        } else {
            // New schema: just add missing columns
            if (!(await columnExists('users', 'profile_picture'))) await db.query('ALTER TABLE users ADD COLUMN profile_picture VARCHAR(500) DEFAULT NULL').catch(() => {});
            if (!(await columnExists('users', 'bio')))             await db.query('ALTER TABLE users ADD COLUMN bio TEXT DEFAULT NULL').catch(() => {});
            if (!(await columnExists('users', 'followers_count'))) await db.query('ALTER TABLE users ADD COLUMN followers_count INT DEFAULT 0').catch(() => {});
            if (!(await columnExists('users', 'following_count'))) await db.query('ALTER TABLE users ADD COLUMN following_count INT DEFAULT 0').catch(() => {});
            if (!(await columnExists('users', 'total_likes')))     await db.query('ALTER TABLE users ADD COLUMN total_likes INT DEFAULT 0').catch(() => {});
            if (!(await columnExists('users', 'is_live')))         await db.query('ALTER TABLE users ADD COLUMN is_live TINYINT(1) DEFAULT 0').catch(() => {});
        }
    }

    // ── Create tables (safe – IF NOT EXISTS) ──────────────────
    await db.query(`
        CREATE TABLE IF NOT EXISTS users (
            id              INT AUTO_INCREMENT PRIMARY KEY,
            username        VARCHAR(50)  UNIQUE NOT NULL,
            email           VARCHAR(100) UNIQUE NOT NULL,
            password_hash   VARCHAR(255) NOT NULL,
            profile_picture VARCHAR(500) DEFAULT NULL,
            bio             TEXT         DEFAULT NULL,
            followers_count INT          DEFAULT 0,
            following_count INT          DEFAULT 0,
            total_likes     INT          DEFAULT 0,
            is_live         TINYINT(1)   DEFAULT 0,
            created_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS videos (
            id             INT AUTO_INCREMENT PRIMARY KEY,
            user_id        INT          NOT NULL,
            video_url      VARCHAR(500) NOT NULL,
            caption        TEXT         DEFAULT NULL,
            likes_count    INT          DEFAULT 0,
            comments_count INT          DEFAULT 0,
            shares_count   INT          DEFAULT 0,
            mood_category  VARCHAR(50)  DEFAULT 'General',
            created_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS video_likes (
            id         INT AUTO_INCREMENT PRIMARY KEY,
            video_id   INT NOT NULL,
            user_id    INT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY unique_like (video_id, user_id),
            FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id)  REFERENCES users(id)  ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS comments (
            id           INT AUTO_INCREMENT PRIMARY KEY,
            video_id     INT  NOT NULL,
            user_id      INT  NOT NULL,
            comment_text TEXT NOT NULL,
            created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id)  REFERENCES users(id)  ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS followers (
            id           INT AUTO_INCREMENT PRIMARY KEY,
            follower_id  INT NOT NULL,
            following_id INT NOT NULL,
            created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY unique_follow (follower_id, following_id),
            FOREIGN KEY (follower_id)  REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (following_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS messages (
            id           INT AUTO_INCREMENT PRIMARY KEY,
            sender_id    INT  NOT NULL,
            receiver_id  INT  NOT NULL,
            message_text TEXT NOT NULL,
            is_read      TINYINT(1) DEFAULT 0,
            created_at   TIMESTAMP  DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (sender_id)   REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    
    await db.query(`
        CREATE TABLE IF NOT EXISTS live_streams (
            id            INT AUTO_INCREMENT PRIMARY KEY,
            user_id       INT NOT NULL,
            stream_title  VARCHAR(255) DEFAULT 'Live Stream',
            status        ENUM('live', 'offline') DEFAULT 'live',
            viewer_count  INT DEFAULT 0,
            started_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS live_viewers (
            id         INT AUTO_INCREMENT PRIMARY KEY,
            stream_id  INT NOT NULL,
            user_id    INT NOT NULL,
            joined_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (stream_id) REFERENCES live_streams(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id)   REFERENCES users(id)        ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS live_chat (
            id         INT AUTO_INCREMENT PRIMARY KEY,
            stream_id  INT NOT NULL,
            user_id    INT NOT NULL,
            message    TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (stream_id) REFERENCES live_streams(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id)   REFERENCES users(id)        ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS contact_messages (
            id         INT AUTO_INCREMENT PRIMARY KEY,
            name       VARCHAR(100) NOT NULL,
            email      VARCHAR(100) NOT NULL,
            message    TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS password_resets (
            id         INT AUTO_INCREMENT PRIMARY KEY,
            email      VARCHAR(100) NOT NULL,
            otp        VARCHAR(6) NOT NULL,
            expires_at TIMESTAMP NOT NULL,
            attempts   INT DEFAULT 0,
            INDEX (email)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    console.log('[DB] ✅ All tables ready.');
}


module.exports = { initDatabase };
