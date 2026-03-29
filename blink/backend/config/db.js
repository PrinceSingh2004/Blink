/**
 * backend/config/db.js
 * ═══════════════════════════════════════════════════════════════════════════════
 * PRODUCTION-GRADE MySQL Connection Pool for Railway + Render
 * ═══════════════════════════════════════════════════════════════════════════════
 * Features: SSL, Keep-Alive, Auto-Reconnect, Connection Pooling, Error Handling
 * ═══════════════════════════════════════════════════════════════════════════════
 */

const mysql = require('mysql2/promise');
require('dotenv').config();

// ════════════════════════════════════════════════════════════════════════════════
// ENVIRONMENT VALIDATION
// ════════════════════════════════════════════════════════════════════════════════
const requiredEnv = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
const missing = requiredEnv.filter(k => !process.env[k]);

if (missing.length > 0 && process.env.NODE_ENV === 'production') {
    console.error(`[DB ERROR] ❌ Missing environment variables: ${missing.join(', ')}`);
    console.error('Configure .env file with:');
    missing.forEach(k => console.error(`  - ${k}`));
    process.exit(1);
}

// ════════════════════════════════════════════════════════════════════════════════
// PRODUCTION CONNECTION POOL CONFIGURATION
// ════════════════════════════════════════════════════════════════════════════════
const poolConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: parseInt(process.env.DB_PORT) || 3306,

    // SSL REQUIRED for Railway MySQL
    ssl: {
        rejectUnauthorized: false
    },

    // CONNECTION POOL SETTINGS
    waitForConnections: true,
    connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT) || 10,
    queueLimit: 0,
    connectTimeout: 20000,
    acquireTimeout: 20000,

    // KEEP-ALIVE SETTINGS
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,

    // ADDITIONAL PRODUCTION SETTINGS
    multipleStatements: false,
    dateStrings: true,
    supportBigNumbers: true,
    bigNumberStrings: true,
    typeCast: true,

    // LOGGING (only in development)
    debug: process.env.NODE_ENV === 'development' ? ['ComQueryPacket'] : false
};

// ════════════════════════════════════════════════════════════════════════════════
// CREATE CONNECTION POOL
// ════════════════════════════════════════════════════════════════════════════════
const pool = mysql.createPool(poolConfig);

// ════════════════════════════════════════════════════════════════════════════════
// CONNECTION HEALTH MONITORING
// ════════════════════════════════════════════════════════════════════════════════
let connectionHealth = {
    isHealthy: false,
    lastCheck: null,
    consecutiveFailures: 0,
    totalConnections: 0,
    activeConnections: 0
};

// ════════════════════════════════════════════════════════════════════════════════
// KEEP-ALIVE QUERY FUNCTION
// ════════════════════════════════════════════════════════════════════════════════
const keepAliveQuery = async () => {
    try {
        const [rows] = await pool.query('SELECT 1 as keep_alive, NOW() as timestamp');
        connectionHealth.isHealthy = true;
        connectionHealth.lastCheck = new Date();
        connectionHealth.consecutiveFailures = 0;

        if (process.env.NODE_ENV === 'development') {
            console.log(`✅ [DB KEEP-ALIVE] ${rows[0].timestamp}`);
        }
    } catch (err) {
        connectionHealth.isHealthy = false;
        connectionHealth.consecutiveFailures++;
        console.error(`❌ [DB KEEP-ALIVE FAILED] ${err.message} (Failures: ${connectionHealth.consecutiveFailures})`);

        // Force pool recreation after 5 consecutive failures
        if (connectionHealth.consecutiveFailures >= 5) {
            console.log('🔄 [DB] Attempting pool recreation...');
            try {
                await pool.end();
                Object.assign(pool, mysql.createPool(poolConfig));
                connectionHealth.consecutiveFailures = 0;
                console.log('✅ [DB] Pool recreated successfully');
            } catch (recreateErr) {
                console.error('❌ [DB] Pool recreation failed:', recreateErr.message);
            }
        }
    }
};

// ════════════════════════════════════════════════════════════════════════════════
// START KEEP-ALIVE INTERVAL (every 30 seconds)
// ════════════════════════════════════════════════════════════════════════════════
setInterval(keepAliveQuery, 30000);

// ════════════════════════════════════════════════════════════════════════════════
// CONNECTION TEST HELPER
// ════════════════════════════════════════════════════════════════════════════════
pool.testConnection = async () => {
    try {
        const startTime = Date.now();
        const [rows] = await pool.query('SELECT 1 as connection_test, VERSION() as mysql_version, DATABASE() as current_db');
        const responseTime = Date.now() - startTime;

        connectionHealth.isHealthy = true;
        connectionHealth.lastCheck = new Date();

        console.log(`✅ [DB] Connection successful (${responseTime}ms)`);
        console.log(`   MySQL Version: ${rows[0].mysql_version}`);
        console.log(`   Database: ${rows[0].current_db}`);
        console.log(`   Pool Size: ${poolConfig.connectionLimit} connections`);

        return {
            success: true,
            message: 'Database Connected Successfully',
            mysqlVersion: rows[0].mysql_version,
            database: rows[0].current_db,
            responseTime: `${responseTime}ms`
        };
    } catch (err) {
        connectionHealth.isHealthy = false;
        connectionHealth.consecutiveFailures++;

        console.error('❌ [DB ERROR]', err.message);
        let errMsg = err.message;
        let suggestion = '';

        if (err.code === 'ECONNREFUSED')
            errMsg = 'Connection Refused: Check DB_HOST and DB_PORT.';
        else if (err.code === 'ER_ACCESS_DENIED_ERROR')
            errMsg = 'Access Denied: Check DB_USER and DB_PASSWORD.';
        else if (err.code === 'ER_BAD_DB_ERROR')
            errMsg = 'Database does not exist: Create database first.';
        else if (err.code === 'ETIMEDOUT')
            errMsg = 'Connection Timeout: Check network connectivity.';
        else if (err.code === 'ENOTFOUND')
            errMsg = 'Host not found: Check DB_HOST spelling.';

        return {
            success: false,
            code: err.code,
            message: errMsg,
            suggestion: suggestion,
            consecutiveFailures: connectionHealth.consecutiveFailures
        };
    }
};

// ════════════════════════════════════════════════════════════════════════════════
// GET CONNECTION HEALTH STATUS
// ════════════════════════════════════════════════════════════════════════════════
pool.getHealthStatus = () => {
    return {
        ...connectionHealth,
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        poolConfig: {
            connectionLimit: poolConfig.connectionLimit,
            host: poolConfig.host,
            database: poolConfig.database,
            ssl: !!poolConfig.ssl
        }
    };
};

// ════════════════════════════════════════════════════════════════════════════════
// GRACEFUL POOL SHUTDOWN
// ════════════════════════════════════════════════════════════════════════════════
pool.gracefulShutdown = async () => {
    console.log('🔄 [DB] Graceful shutdown initiated...');
    try {
        await pool.end();
        console.log('✅ [DB] Connection pool closed successfully');
    } catch (err) {
        console.error('❌ [DB] Error during pool shutdown:', err.message);
    }
};

// ════════════════════════════════════════════════════════════════════════════════
// AUTO TEST CONNECTION ON STARTUP
// ════════════════════════════════════════════════════════════════════════════════
setTimeout(async () => {
    const result = await pool.testConnection();
    if (!result.success && process.env.NODE_ENV === 'production') {
        console.error('[CRITICAL] Database connection failed in production - exiting...');
        process.exit(1);
    }
}, 2000);

// ════════════════════════════════════════════════════════════════════════════════
// EXPORT POOL WITH ENHANCED METHODS
// ════════════════════════════════════════════════════════════════════════════════
module.exports = pool;
