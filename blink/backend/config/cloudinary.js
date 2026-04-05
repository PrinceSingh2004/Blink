/**
 * config/cloudinary.js — Cloudinary SDK Configuration
 * ════════════════════════════════════════════════════════
 */

const cloudinary = require('cloudinary').v2;
require('dotenv').config();

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_NAME,
    api_key:    process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure:     true
});

// Startup validation
const { cloud_name, api_key, api_secret } = cloudinary.config();
if (!cloud_name || !api_key || !api_secret) {
    console.error('❌ Cloudinary config missing. Check CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET.');
} else {
    console.log(`✅ Cloudinary configured: ${cloud_name}`);
}

module.exports = cloudinary;
