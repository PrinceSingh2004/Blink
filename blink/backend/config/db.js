const mysql = require('mysql2');
const env   = require('./env');

// ── Production-safe connection pool ───────────────────────────
const poolOptions = {
    host:               env.DB_HOST,
    port:               env.DB_PORT,
    user:               env.DB_USER,
    password:           env.DB_PASSWORD,
    database:           env.DB_NAME,
    waitForConnections: true,
    connectionLimit:    10,
    queueLimit:         0,
    charset:            'utf8mb4',
    timezone:           '+00:00',
    enableKeepAlive:    true,
    keepAliveInitialDelay: 30000,
    connectTimeout: 10000,
    // Add SSL support if required by provider (Aiven, DigitalOcean, etc.)
    ssl: env.DB_SSL ? { rejectUnauthorized: false } : undefined
};

const pool = mysql.createPool(poolOptions);
const db = pool.promise();

// ── Test connection on startup ─────────────────────────────────
pool.getConnection((err, conn) => {
    if (err) {
        console.error(`[DB] ❌ Connection failed [${err.code}]:`, err.message);
        console.error(`     Target: ${env.DB_HOST}:${env.DB_PORT} (User: ${env.DB_USER})`);
    } else {
        console.log(`[DB] ✅ MySQL pool connected to ${env.DB_HOST}`);
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
