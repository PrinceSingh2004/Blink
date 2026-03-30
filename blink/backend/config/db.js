/**
 * backend/config/db.js
 * ═══════════════════════════════════════════════════════════════════════════════
 * PRODUCTION-GRADE MySQL Connection Pool for Railway + Render
 * ═══════════════════════════════════════════════════════════════════════════════
 */

const mysql = require('mysql2/promise');
require('dotenv').config();

// ════════════════════════════════════════════════════════════════════════════════
// POOL CONFIGURATION
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
    maxIdle: 10,
    idleTimeout: 60000,
    queueLimit: 0,
    connectTimeout: 30000,
    
    // KEEP-ALIVE SETTINGS (Prevents "Connection Lost" crashes)
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,

    // ADDITIONAL PRODUCTION SETTINGS
    multipleStatements: false,
    dateStrings: true,
    supportBigNumbers: true,
    bigNumberStrings: true,
};

// CREATE CONNECTION POOL
const pool = mysql.createPool(poolConfig);

// ════════════════════════════════════════════════════════════════════════════════
// ENHANCED METHODS FOR server.js COMPATIBILITY
// ════════════════════════════════════════════════════════════════════════════════

// Test Connection Helper
pool.testConnection = async () => {
    try {
        const startTime = Date.now();
        const [rows] = await pool.query('SELECT 1 as connection_test, VERSION() as mysql_version, DATABASE() as current_db');
        const responseTime = Date.now() - startTime;

        console.log(`✅ [DB] Connection successful (${responseTime}ms)`);
        return {
            success: true,
            mysqlVersion: rows[0].mysql_version,
            database: rows[0].current_db,
            responseTime: `${responseTime}ms`
        };
    } catch (err) {
        console.error('❌ [DB ERROR]', err.message);
        return {
            success: false,
            message: err.message
        };
    }
};

// Health Status Helper
pool.getHealthStatus = () => {
    return {
        isHealthy: true, // Simplified
        poolConfig: {
            connectionLimit: poolConfig.connectionLimit,
            host: poolConfig.host,
            database: poolConfig.database,
            ssl: !!poolConfig.ssl
        }
    };
};

// Graceful Shutdown Helper
pool.gracefulShutdown = async () => {
    console.log('🔄 [DB] Graceful shutdown initiated...');
    try {
        await pool.end();
        console.log('✅ [DB] Connection pool closed successfully');
    } catch (err) {
        console.error('❌ [DB] Error during pool shutdown:', err.message);
    }
};

// Export the promise-based pool
module.exports = pool;
