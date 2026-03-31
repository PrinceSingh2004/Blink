const cloudinary = require('cloudinary').v2;
require('dotenv').config();

// ── TASK: FIX "Must supply api_key" ERROR ──────────────────────
// Names must EXACTLY match the keys in your .env / Render dashboard.
const config = {
  cloud_name: process.env.CLOUDINARY_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure:     true
};

// --- PRODUCTION DEBUG PULSE ---
if (!config.api_key || !config.api_secret || !config.cloud_name) {
    console.error("❌ CLOUDINARY CONFIG FAILURE: Environment variables (CLOUDINARY_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET) are NOT being loaded. Check Render settings.");
} else {
    console.log("✅ CLOUDINARY CONFIG SUCCESS: Pulse detected from universe", config.cloud_name);
}

cloudinary.config(config);

module.exports = cloudinary;
