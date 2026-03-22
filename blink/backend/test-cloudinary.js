/* test-cloudinary.js - Verify Cloudinary credentials and upload from backend directly */
require('dotenv').config();
const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const https = require('https');

cloudinary.config({
    cloud_name: process.env.CLOUD_NAME,
    api_key: process.env.API_KEY,
    api_secret: process.env.API_SECRET
});

const sampleUrl = 'https://www.w3schools.com/html/mov_bbb.mp4';
const localPath = 'test_sample.mp4';

console.log('1. Downloading sample video to test upload...');

const file = fs.createWriteStream(localPath);
https.get(sampleUrl, response => {
    response.pipe(file);
    file.on('finish', async () => {
        file.close();
        console.log('2. Sample downloaded. Uploading to Cloudinary...');
        
        try {
            const result = await cloudinary.uploader.upload(localPath, {
                resource_type: "video",
                folder: "blink_reels_test"
            });
            console.log('✅ CLOUDINARY UPLOAD SUCCESS!');
            console.log('Secure URL:', result.secure_url);
            console.log('\nProject is PRODUCTION READY.');
            fs.unlinkSync(localPath);
        } catch (err) {
            console.error('❌ CLOUDINARY UPLOAD FAILED:', err.message);
            fs.unlinkSync(localPath);
        }
    });
});
