/**
 * routes/example.js
 * ═══════════════════════════════════════════════════════════════════════════════
 * EXAMPLE API ROUTE - Shows proper database query usage with mysql2/promise
 * ═══════════════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// ════════════════════════════════════════════════════════════════════════════════
// EXAMPLE: GET USERS WITH PROPER ASYNC/AWAIT AND DESTRUCTURING
// ════════════════════════════════════════════════════════════════════════════════
router.get('/users', async (req, res) => {
    try {
        // ✅ CORRECT: Use array destructuring with mysql2/promise
        const [rows] = await pool.query(
            'SELECT id, username, email, display_name, profile_pic, created_at FROM users ORDER BY created_at DESC LIMIT 50'
        );

        // ✅ CORRECT: Return structured response
        res.json({
            success: true,
            count: rows.length,
            users: rows
        });

    } catch (err) {
        console.error('[EXAMPLE ERROR]', err.message);

        // ✅ CORRECT: Don't crash app on DB errors
        res.status(500).json({
            success: false,
            error: 'Database query failed',
            message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
        });
    }
});

// ════════════════════════════════════════════════════════════════════════════════
// EXAMPLE: GET SINGLE USER WITH PARAMETERS
// ════════════════════════════════════════════════════════════════════════════════
router.get('/users/:id', async (req, res) => {
    try {
        const userId = parseInt(req.params.id);

        if (isNaN(userId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid user ID'
            });
        }

        // ✅ CORRECT: Use parameterized queries to prevent SQL injection
        const [rows] = await pool.query(
            'SELECT id, username, email, display_name, profile_pic, bio, created_at FROM users WHERE id = ?',
            [userId]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        res.json({
            success: true,
            user: rows[0]
        });

    } catch (err) {
        console.error('[EXAMPLE ERROR]', err.message);
        res.status(500).json({
            success: false,
            error: 'Database query failed',
            message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
        });
    }
});

// ════════════════════════════════════════════════════════════════════════════════
// EXAMPLE: CREATE USER WITH TRANSACTION
// ════════════════════════════════════════════════════════════════════════════════
router.post('/users', async (req, res) => {
    const connection = await pool.getConnection();

    try {
        const { username, email, password } = req.body;

        // Basic validation
        if (!username || !email || !password) {
            return res.status(400).json({
                success: false,
                error: 'All fields are required'
            });
        }

        // Start transaction
        await connection.beginTransaction();

        // Check if user exists
        const [existing] = await connection.query(
            'SELECT id FROM users WHERE email = ? OR username = ?',
            [email, username]
        );

        if (existing.length > 0) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                error: 'Email or username already exists'
            });
        }

        // Hash password (using bcryptjs)
        const bcrypt = require('bcryptjs');
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // Insert user
        const [result] = await connection.query(
            'INSERT INTO users (username, email, password, display_name) VALUES (?, ?, ?, ?)',
            [username, email, hashedPassword, username]
        );

        // Get the created user
        const [newUser] = await connection.query(
            'SELECT id, username, email, display_name, created_at FROM users WHERE id = ?',
            [result.insertId]
        );

        // Commit transaction
        await connection.commit();

        res.status(201).json({
            success: true,
            message: 'User created successfully',
            user: newUser[0]
        });

    } catch (err) {
        // Rollback on error
        await connection.rollback();
        console.error('[EXAMPLE ERROR]', err.message);

        res.status(500).json({
            success: false,
            error: 'Failed to create user',
            message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
        });
    } finally {
        // Always release connection
        connection.release();
    }
});

// ════════════════════════════════════════════════════════════════════════════════
// EXAMPLE: UPDATE USER WITH OPTIMISTIC LOCKING
// ════════════════════════════════════════════════════════════════════════════════
router.put('/users/:id', async (req, res) => {
    try {
        const userId = parseInt(req.params.id);
        const { display_name, bio } = req.body;

        if (isNaN(userId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid user ID'
            });
        }

        // ✅ CORRECT: Use UPDATE with WHERE clause
        const [result] = await pool.query(
            'UPDATE users SET display_name = ?, bio = ?, updated_at = NOW() WHERE id = ?',
            [display_name, bio, userId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        // Get updated user
        const [updatedUser] = await pool.query(
            'SELECT id, username, display_name, bio, updated_at FROM users WHERE id = ?',
            [userId]
        );

        res.json({
            success: true,
            message: 'User updated successfully',
            user: updatedUser[0]
        });

    } catch (err) {
        console.error('[EXAMPLE ERROR]', err.message);
        res.status(500).json({
            success: false,
            error: 'Failed to update user',
            message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
        });
    }
});

// ════════════════════════════════════════════════════════════════════════════════
// EXAMPLE: COMPLEX QUERY WITH JOINS
// ════════════════════════════════════════════════════════════════════════════════
router.get('/users/:id/posts', async (req, res) => {
    try {
        const userId = parseInt(req.params.id);
        const limit = parseInt(req.query.limit) || 20;
        const offset = parseInt(req.query.offset) || 0;

        if (isNaN(userId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid user ID'
            });
        }

        // ✅ CORRECT: Complex query with JOIN and aggregation
        const [posts] = await pool.query(`
            SELECT
                v.id,
                v.title,
                v.description,
                v.video_url,
                v.thumbnail_url,
                v.created_at,
                COUNT(DISTINCT l.id) as likes_count,
                COUNT(DISTINCT c.id) as comments_count,
                u.username,
                u.display_name,
                u.profile_pic
            FROM videos v
            LEFT JOIN video_likes l ON v.id = l.video_id
            LEFT JOIN comments c ON v.id = c.video_id
            JOIN users u ON v.user_id = u.id
            WHERE v.user_id = ?
            GROUP BY v.id
            ORDER BY v.created_at DESC
            LIMIT ? OFFSET ?
        `, [userId, limit, offset]);

        res.json({
            success: true,
            count: posts.length,
            posts: posts
        });

    } catch (err) {
        console.error('[EXAMPLE ERROR]', err.message);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch user posts',
            message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
        });
    }
});

module.exports = router;