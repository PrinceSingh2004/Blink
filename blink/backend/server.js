/**
 * server.js
 * ═══════════════════════════════════════════════════════════
 * Blink Backend – Real-Time Production Server
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const http    = require('http');
const socketIo = require('socket.io');
const cors    = require('cors');
const helmet  = require('helmet');
const compression = require('compression');
const path    = require('path');
const fs      = require('fs');

require('dotenv').config();
const { PORT = 4000 } = process.env;

const app    = express();
const server = http.createServer(app);
const io     = socketIo(server, {
    cors: { origin: "*", methods: ["GET", "POST", "PUT", "DELETE"] }
});

// ── Directories ──────────────────────────────────────────────
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// ── Middleware ───────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static serving
app.use('/uploads', express.static(uploadDir));
app.use(express.static(path.join(__dirname, '../frontend')));

// ── Endpoints ───────────────────────────────────────────────
const { requireAuth } = require('./middleware/authMiddleware');
const uc = require('./controllers/userController');
const { uploadAvatar } = require('./middleware/uploadMiddleware');

app.use('/api/auth', require('./routes/authRoutes'));

// Profile Rebuild APIs
app.get('/api/user/profile', requireAuth, (req, res) => { req.params.id = req.user.id; uc.getProfile(req, res); });
app.put('/api/user/update-profile', requireAuth, uploadAvatar, uc.updateProfile);
app.put('/api/user/change-password', requireAuth, uc.changePassword);
app.delete('/api/user/delete', requireAuth, uc.deleteAccount);

// ── Socket.IO Real-Time Chat ─────────────────────────────────
io.on('connection', (socket) => {
    console.log('[Socket] Connected:', socket.id);

    socket.on('joinRoom', (roomId) => {
        socket.join(roomId);
        console.log(`[Socket] ${socket.id} joined room ${roomId}`);
    });

    socket.on('sendMessage', (data) => {
        if (!data.message || !data.roomId) return;
        const msg = {
            id: Date.now(),
            username: data.username,
            message: data.message.trim(),
            avatar: data.avatar,
            timestamp: new Date()
        };
        io.to(data.roomId).emit('receiveMessage', msg);
    });

    socket.on('disconnect', () => console.log('[Socket] Disconnected:', socket.id));
});

// ── Start ────────────────────────────────────────────────────
server.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});
