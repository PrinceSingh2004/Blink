const mysql = require('mysql2');
const env   = require('./env');

async function initDatabase() {
    // ── Step 1: Create DB if not exists ───────────────────────
    const rawPool = mysql.createPool({
        host:               env.DB_HOST,
        port:               env.DB_PORT,
        user:               env.DB_USER,
        password:           env.DB_PASSWORD,
        waitForConnections: true,
        connectionLimit:    2
    }).promise();

    try {
        await rawPool.query(
            `CREATE DATABASE IF NOT EXISTS \`${env.DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
        );
        console.log(`[DB] Database "${env.DB_NAME}" ensured.`);
    } catch (err) {
        if (err.code === 'ER_DBACCESS_DENIED_ERROR' || err.code === 'ER_ACCESS_DENIED_ERROR') {
            console.warn(`[DB] Note: Could not confirm database "${env.DB_NAME}" existence via SQL.`);
        } else {
            console.error('[DB] Creation check error:', err.message);
        }
    } finally {
        await rawPool.end();
    }

    // ── Step 2: Use app pool ─────────────────────────────────
    const db = require('./db');

    // ── Helpers ──────────────────────────────────────────────
    async function columnExists(table, column) {
        const [rows] = await db.query(
            `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
            [table, column]
        );
        return rows[0].cnt > 0;
    }

    async function addCol(table, col, def) {
        if (!(await columnExists(table, col))) {
            await db.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${col}\` ${def}`).catch(() => {});
            console.log(`[DB] Added column: ${table}.${col}`);
        }
    }

    async function tableExists(table) {
        const [rows] = await db.query(
            `SELECT COUNT(*) AS cnt FROM information_schema.TABLES
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
            [table]
        );
        return rows[0].cnt > 0;
    }

    // ── Migrate old users schema if needed ────────────────────
    const usersExist = await tableExists('users');
    if (usersExist) {
        const hasContact      = await columnExists('users', 'contact');
        const hasPasswordHash = await columnExists('users', 'password_hash');
        if (hasContact || !hasPasswordHash) {
            console.log('[DB] ⚠️  Old schema detected – migrating…');
            await db.query('SET FOREIGN_KEY_CHECKS=0').catch(() => {});
            for (const t of ['live_chat', 'live_viewers', 'live_streams', 'stream_chats', 'stream_viewers', 'stream_keys', 'messages', 'followers', 'comments', 'video_likes', 'videos', 'users']) {
                await db.query(`DROP TABLE IF EXISTS \`${t}\``).catch(() => {});
            }
            await db.query('SET FOREIGN_KEY_CHECKS=1').catch(() => {});
            console.log('[DB] Old tables dropped. Recreating…');
        }
    }

    // ── Drop old live_streams if it has stream_key_id (incompatible) ─
    if (await tableExists('live_streams')) {
        const hasStreamKeyId = await columnExists('live_streams', 'stream_key_id');
        if (hasStreamKeyId) {
            console.log('[DB] ⚠️  Old live_streams schema with stream_key_id detected — rebuilding…');
            await db.query('SET FOREIGN_KEY_CHECKS=0').catch(() => {});
            await db.query('DROP TABLE IF EXISTS live_chat, live_viewers, live_streams, stream_chats, stream_viewers, stream_keys').catch(() => {});
            await db.query('SET FOREIGN_KEY_CHECKS=1').catch(() => {});
        }
    }

    // ══════════════════════════════════════════════════════════
    // ── Create tables (IF NOT EXISTS = safe) ─────────────────
    // ══════════════════════════════════════════════════════════

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
            created_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_username (username),
            INDEX idx_email (email)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS videos (
            id             INT AUTO_INCREMENT PRIMARY KEY,
            user_id        INT          NOT NULL,
            video_url      VARCHAR(500) NOT NULL,
            caption        TEXT         DEFAULT NULL,
            mood_category  VARCHAR(50)  DEFAULT 'General',
            likes_count    INT          DEFAULT 0,
            comments_count INT          DEFAULT 0,
            shares_count   INT          DEFAULT 0,
            created_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            INDEX idx_mood (mood_category),
            INDEX idx_user (user_id),
            INDEX idx_created (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await addCol('videos', 'likes_count',    'INT DEFAULT 0');
    await addCol('videos', 'comments_count', 'INT DEFAULT 0');
    await addCol('videos', 'shares_count',   'INT DEFAULT 0');
    await addCol('videos', 'mood_category',  "VARCHAR(50) DEFAULT 'General'");

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
            FOREIGN KEY (user_id)  REFERENCES users(id)  ON DELETE CASCADE,
            INDEX idx_video (video_id)
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
            FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE,
            INDEX idx_sender   (sender_id),
            INDEX idx_receiver (receiver_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // ── Live Streaming Tables (Simple WebRTC — no stream keys) ─
    await db.query(`
        CREATE TABLE IF NOT EXISTS live_streams (
            id           INT AUTO_INCREMENT PRIMARY KEY,
            user_id      INT NOT NULL,
            title        VARCHAR(150) DEFAULT 'Live Session',
            status       ENUM('live', 'ended') DEFAULT 'live',
            viewer_count INT DEFAULT 0,
            peak_viewers INT DEFAULT 0,
            started_at   TIMESTAMP NULL,
            ended_at     TIMESTAMP NULL,
            created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            INDEX idx_live_user (user_id),
            INDEX idx_live_status (status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS live_viewers (
            id         INT AUTO_INCREMENT PRIMARY KEY,
            stream_id  INT NOT NULL,
            user_id    INT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY unique_viewer (stream_id, user_id),
            FOREIGN KEY (stream_id) REFERENCES live_streams(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id)   REFERENCES users(id)  ON DELETE CASCADE,
            INDEX idx_viewer_stream (stream_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS live_chat (
            id         INT AUTO_INCREMENT PRIMARY KEY,
            stream_id  INT  NOT NULL,
            user_id    INT  NOT NULL,
            message    TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (stream_id) REFERENCES live_streams(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id)   REFERENCES users(id)  ON DELETE CASCADE,
            INDEX idx_chat_stream (stream_id)
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
            otp        VARCHAR(6)   NOT NULL,
            expires_at TIMESTAMP    NOT NULL,
            attempts   INT DEFAULT 0,
            INDEX idx_email (email)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // ── Clean up stale live streams on startup ───────────────
    await db.query('UPDATE live_streams SET status = "ended", ended_at = NOW() WHERE status = "live"').catch(() => {});
    await db.query('UPDATE users SET is_live = 0 WHERE is_live = 1').catch(() => {});
    await db.query('DELETE FROM live_viewers').catch(() => {});

    console.log('[DB] ✅ All tables ready.');
}

module.exports = { initDatabase };
