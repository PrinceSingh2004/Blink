/**
 * server.js
 * ═══════════════════════════════════════════════════════════
 * Blink — Single Unified Backend (Expert Implementation)
 * Features: WEBRTC Signaling, SOCKET.IO Chat, JWT Auth,
 *           CORS Security, Helmet Hardening, Rate Limiting
 * ═══════════════════════════════════════════════════════════ */

require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const compression = require('compression');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*", // Adjust for production Render URL
        methods: ["GET", "POST"]
    }
});

// ── SECURITY & PERFORMANCE ───────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false })); // Allow external media
app.use(cors());
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: "Too many requests. Please try again later." }
});
app.use('/api/', limiter);

// ── ROUTES ──────────────────────────────────────────────────
// We mount the modular routes after auth middleware logic
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const postRoutes = require('./routes/postRoutes');

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/posts', postRoutes);

// Static files
app.use(express.static(path.join(__dirname, '../frontend')));
app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) return; // Don't serve HTML on API calls
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// ── SOCKET.IO: WEBRTC & CHAT ROOMS ────────────────────────────
io.on('connection', (socket) => {
    console.log(`[Socket] Connected: ${socket.id}`);

    // -- CHAT SYSTEM --
    socket.on('joinStream', (streamId) => {
        socket.join(streamId);
        console.log(`[Chat] ${socket.id} joined room: ${streamId}`);
    });

    socket.on('sendMessage', (data) => {
        // Broadcast message to everyone in the room (stream)
        io.to(data.streamId).emit('receiveMessage', {
            id: Date.now(),
            user: data.username,
            avatar: data.avatar,
            text: data.text,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
    });

    // -- WEBRTC SIGNALING --
    // Offer: Creator sends to viewer or viewer sends to creator
    socket.on('signal', (data) => {
        // data contains: { to: socketId, signal: offer/answer/candidate, from: socketId }
        io.to(data.to).emit('signal', {
            from: socket.id,
            signal: data.signal
        });
    });

    // Handle Disconnect
    socket.on('disconnect', () => {
        console.log(`[Socket] Disconnected: ${socket.id}`);
    });
});

// ── ERROR HANDLER ──────────────────────────────────────────
app.use((err, req, res, next) => {
    console.error('[General Error]', err.stack);
    res.status(500).json({ 
        success: false, 
        error: "Internal Server Error. Try again later." 
    });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
    console.log(`🚀 Blink Backend ready on port ${PORT}`);
});
