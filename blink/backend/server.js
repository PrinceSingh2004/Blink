/**
 * backend/server.js
 * ═══════════════════════════════════════════════════════════
 * Blink Production Gateway – Professional Architecture
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

const { PORT = 4000, FRONTEND_URL = "*" } = process.env;

// 🧪 Database Connection Test (Railway MySQL)
const db = require('./config/db');
(async () => {
    const test = await db.testConnection();
    if (test.success) console.log(`[DB] 🚀 ${test.message} (Railway SSL Enabled)`);
    else console.error(`[DB ERROR] ❌ Connection Failed: ${test.message}`);
})();

const app    = express();
const server = http.createServer(app);
const io     = socketIo(server, {
    cors: { 
        origin: FRONTEND_URL, 
        methods: ["GET", "POST"] 
    }
});

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(cors({ origin: FRONTEND_URL }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 📁 Storage Orchestration (Render Persistence preparation)
const uploadDir = path.join(__dirname, 'uploads');
['reels', 'stories', 'avatars', 'misc'].forEach(sub => {
    const p = path.join(uploadDir, sub);
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
});

// Serve static: uploads are inside backend, frontend is sibling
const frontendPath = path.join(__dirname, '..', 'frontend');
app.use('/uploads', express.static(uploadDir));
app.use(express.static(frontendPath));

// API
app.use('/api/auth',      require('./routes/authRoutes'));
app.use('/api/user',      require('./routes/userRoutes'));
app.use('/api/videos',    require('./routes/videoRoutes'));
app.use('/api/stories',   require('./routes/storyRoutes'));
app.use('/api/live',      require('./routes/liveRoutes'));
app.use('/api/followers', require('./routes/followRoutes'));
app.use('/api/messages',  require('./routes/messageRoutes'));

// 🛡️ Global Error Handling (Standardized Responses)
const { notFound, errorHandler } = require('./middleware/errorMiddleware');
app.use(notFound);
app.use(errorHandler);

// SPA Fallback
app.get('*', (req, res) => res.sendFile(path.join(frontendPath, 'index.html')));

// Socket
io.on('connection', (s) => {
    s.on('joinRoom', (r) => s.join(r));
    s.on('sendMessage', (d) => io.to(d.roomId).emit('receiveMessage', d));
    s.on('typing', (d) => s.to(d.roomId).emit('userTyping', d));
});

server.listen(PORT, () => console.log(`🚀 Blink Platform: http://localhost:${PORT}`));
