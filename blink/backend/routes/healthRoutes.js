const express = require('express');
const router = express.Router();
const pool = require('../config/db');

router.get('/health', async (req, res) => {
    try {
        // Test query to MySQL
        await pool.query('SELECT 1');
        res.json({ 
            status: "OK", 
            database: "connected",
            db_host: "gondola.proxy.rlwy.net"
        });
    } catch (err) {
        res.status(500).json({ 
            status: "Error", 
            database: "disconnected", 
            error: err.message 
        });
    }
});

module.exports = router;
