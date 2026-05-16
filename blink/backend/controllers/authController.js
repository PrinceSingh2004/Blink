/**
 * controllers/authController.js — Authentication
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const sequelize = require('../config/db'); // For raw queries on sessions if needed, though models are better

exports.register = async (req, res) => {
    try {
        const { username, email, password } = req.body;
        
        if (!username) return res.status(400).json({ success: false, field: 'username', message: 'Username is required' });
        if (!email) return res.status(400).json({ success: false, field: 'email', message: 'Email is required' });
        if (!password) return res.status(400).json({ success: false, field: 'password', message: 'Password is required' });

        if (password.length < 6) {
            return res.status(400).json({ success: false, field: 'password', message: 'Password must be at least 6 characters' });
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ success: false, field: 'email', message: 'Invalid email format' });
        }
        if (username.length < 3 || username.length > 30) {
            return res.status(400).json({ success: false, field: 'username', message: 'Username must be 3-30 characters' });
        }

        const existingUser = await User.findOne({ 
            where: sequelize.or({ email: email.trim().toLowerCase() }, { username: username.trim() }) 
        });

        if (existingUser) {
            const field = existingUser.email === email.trim().toLowerCase() ? 'email' : 'username';
            return res.status(409).json({ success: false, field, message: `${field.charAt(0).toUpperCase() + field.slice(1)} already taken` });
        }

        const hashedPassword = await bcrypt.hash(password, 12);
        
        const user = await User.create({
            username: username.trim(),
            email: email.trim().toLowerCase(),
            password: hashedPassword,
        });

        const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });

        // Phase 2: Register session in DB (using raw query for now unless Session model is made)
        await sequelize.query('INSERT INTO sessions (user_id, token) VALUES (?, ?)', { replacements: [user.id, token] });

        res.status(201).json({
            success: true,
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                profile_photo: user.profile_photo
            }
        });

    } catch (err) {
        console.error('Register error:', err.message);
        res.status(500).json({ success: false, message: 'Registration failed' });
    }
};

exports.login = async (req, res) => {
    try {
        const { identifier, password } = req.body;
        const loginId = (identifier || '').trim();

        if (!loginId) {
            return res.status(400).json({ success: false, field: 'identifier', message: 'Email or username is required' });
        }
        if (!password) {
            return res.status(400).json({ success: false, field: 'password', message: 'Password is required' });
        }

        const user = await User.findOne({ 
            where: sequelize.or({ email: loginId.toLowerCase() }, { username: loginId }) 
        });

        if (!user) {
            return res.status(404).json({ success: false, field: 'identifier', message: 'User not found' });
        }

        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.status(401).json({ success: false, field: 'password', message: 'Incorrect password' });
        }

        const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });

        await sequelize.query('INSERT INTO sessions (user_id, token) VALUES (?, ?)', { replacements: [user.id, token] });

        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                profile_photo: user.profile_photo
            }
        });

    } catch (err) {
        console.error('Login error:', err.message);
        res.status(500).json({ success: false, message: 'Login failed server-side' });
    }
};

exports.getMe = async (req, res) => {
    try {
        const user = await User.findByPk(req.user.id, {
            attributes: ['id', 'username', 'email', 'profile_photo', 'bio', 'created_at']
        });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ success: true, user });
    } catch (err) {
        console.error('GetMe error:', err.message);
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
};

exports.logout = async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        const token = authHeader.split(' ')[1];

        await sequelize.query('DELETE FROM sessions WHERE token = ?', { replacements: [token] });
        res.json({ success: true, message: 'Logged out successfully' });
    } catch (err) {
        console.error('Logout error:', err.message);
        res.status(500).json({ error: 'Logout failed' });
    }
};

exports.logoutAll = async (req, res) => {
    try {
        await sequelize.query('DELETE FROM sessions WHERE user_id = ?', { replacements: [req.user.id] });
        res.json({ success: true, message: 'Logged out from all devices' });
    } catch (err) {
        console.error('Logout-all error:', err.message);
        res.status(500).json({ error: 'Logout-all failed' });
    }
};
