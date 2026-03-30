require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/posts', require('./routes/postRoutes'));
app.use('/api', require('./routes/healthRoutes')); // Test endpoint: /api/health

// Static Frontend
app.use(express.static(path.join(__dirname, '../frontend')));

// Root Route
app.get('/', (req, res) => res.json({ message: "Blink API online 🚀" }));

// 404 Handler
app.use((req, res) => res.status(404).json({ error: "Route not found" }));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Blink Backend running on port ${PORT}`);
});
