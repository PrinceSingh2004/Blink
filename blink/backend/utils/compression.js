/**
 * utils/compression.js – Fluent-FFmpeg Video Compressor
 * Targets 720p 9:16 vertical video with optimized bitrate.
 */

const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('ffmpeg-static');
const path = require('path');
const fs = require('fs');

// Set FFmpeg path from static binary
ffmpeg.setFfmpegPath(ffmpegInstaller);

/**
 * Compresses a video file to 720p with a target bitrate.
 * @param {string} inputPath – Source file path
 * @param {string} outputPath – Optimized file path
 */
async function compressVideo(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
        ffmpeg(inputPath)
            .outputOptions([
                '-vcodec libx264',
                '-crf 23',           // Good quality/size balance (18-28 range)
                '-preset fast',
                '-maxrate 2.5M',    // Max bitrate for 720p mobile
                '-bufsize 5M',
                '-vf scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280', // Center crop to 9:16
                '-acodec aac',
                '-b:a 128k'
            ])
            .on('start', (cmd) => console.log('🚀 Ffmpeg starting:', cmd))
            .on('error', (err) => {
                console.error('❌ Ffmpeg failed:', err.message);
                reject(err);
            })
            .on('end', () => {
                console.log('✅ Video compressed successfully.');
                resolve(outputPath);
            })
            .save(outputPath);
    });
}

/**
 * Simple image processor (optional, placeholder for Sharp if needed)
 */
async function processImage(inputPath, outputPath) {
    // Sharp would be better but let's stick to ffmpeg for now or just rename/save 
    // to match requested task logic.
    return fs.copyFileSync(inputPath, outputPath);
}

module.exports = {
    compressVideo,
    processImage
};
