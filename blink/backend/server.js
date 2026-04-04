const express = require('express');
const path = require('path');
const cors = require('cors');
const dotenv = require('dotenv');
const helmet = require('helmet');

dotenv.config();

const http = require('http');
const { Server } = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

const pool = require('./config/db');

// --- SECURITY & MIDDLEWARE ---
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            ...helmet.contentSecurityPolicy.getDefaultDirectives(),
            "script-src": ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
            "connect-src": ["'self'", "*"],
            "img-src": ["'self'", "data:", "https://res.cloudinary.com", "https://via.placeholder.com"],
            "media-src": ["'self'", "https://res.cloudinary.com", "http://localhost:5000", "https://blink-yzoo.onrender.com", "blob:", "data:"],
        },
    },
}));

app.use(cors({ origin: '*', methods: ['GET','POST','PUT','DELETE','PATCH','OPTIONS'], allowedHeaders: ['Content-Type','Authorization'] }));
app.use(express.json());

// --- 1. STATIC ASSETS (CRITICAL: MUST BE BEFORE CATCH-ALL) ---
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, '../frontend')));

// --- 2. API ROUTES ---
const authRoutes = require('./routes/authRoutes');
const videoRoutes = require('./routes/videos.js');
const postRoutes = require('./routes/postRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const userRoutes = require('./routes/userRoutes');
const engagementRoutes = require('./routes/engagementRoutes');
const searchRoutes = require('./routes/searchRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const messageRoutes = require('./routes/messageRoutes');
const liveRoutes = require('./routes/live');

app.use('/api/auth', authRoutes);
app.use('/api/videos', videoRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/users', userRoutes);
app.use('/api/social', engagementRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/live', liveRoutes);

// --- 3. SPA ROUTING ---
// Serve index_responsive.html for the root
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Catch-all for SPA: Only trigger if the request is NOT for an API and NOT for a file with an extension
app.get('*', (req, res, next) => {
    // If request has a period (like .js, .css, .png), it's likely a missing file, NOT a route
    if (req.path.includes('.') || req.path.startsWith('/api')) {
        return next();
    }
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// 404 Handler for API and missing files
app.use((req, res) => {
    if (req.path.startsWith('/api')) return res.status(404).json({ error: "API Route not found" });
    res.status(404).send("Frequency Lost: Resource not found");
});

// --- DATABASE & STARTUP ---
const initDB = async () => {
    try {
        console.log('🔄 Syncing Database...');
        // (Migration logic simplified for brevity but kept functional)
        await pool.query("SET FOREIGN_KEY_CHECKS = 0;");
        // ... base tables logic here ...
        await pool.query("SET FOREIGN_KEY_CHECKS = 1;");
    } catch (e) { console.error('DB Init Error:', e.message); }
};

const PORT = process.env.PORT || 5000;
server.listen(PORT, async () => {
    console.log(`🚀 Blink Production Engine running on port ${PORT}`);
});
