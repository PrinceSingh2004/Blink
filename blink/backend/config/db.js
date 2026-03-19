const mysql = require('mysql2');
const env   = require('./env');

// ── Production-safe connection pool ───────────────────────────
const pool = mysql.createPool({
    host:               env.DB_HOST,
    port:               env.DB_PORT,
    user:               env.DB_USER,
    password:           env.DB_PASSWORD,
    database:           env.DB_NAME,
    waitForConnections: true,
    connectionLimit:    10,      // max concurrent connections
    queueLimit:         0,       // unlimited queue
    charset:            'utf8mb4',
    timezone:           '+00:00', // always UTC
    enableKeepAlive:    true,
    keepAliveInitialDelay: 30000,
    // Auto-reconnect on stale connections
    connectTimeout: 10000,
});

const db = pool.promise();

// ── Test connection on startup ─────────────────────────────────
pool.getConnection((err, conn) => {
    if (err) {
        console.error('[DB] ❌ Connection failed:', err.message);
    } else {
        console.log('[DB] ✅ MySQL pool connected.');
        conn.release();
    }
});

// ── Handle pool errors gracefully ─────────────────────────────
pool.on('error', (err) => {
    console.error('[DB] Pool error:', err.message);
    if (err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ECONNRESET') {
        console.log('[DB] Reconnecting...');
    }
});

module.exports = db;
