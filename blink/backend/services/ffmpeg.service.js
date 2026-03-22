const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * Starts an FFmpeg process to transcode incoming RTMP to HLS
 * @param {string} rtmpUrl 
 * @param {string} streamId 
 * @returns {import('child_process').ChildProcess}
 */
function startFFmpegTranscoder(rtmpUrl, streamId) {
    const hlsDir = path.join(__dirname, '../../hls', String(streamId));
    if (!fs.existsSync(hlsDir)) {
        fs.mkdirSync(hlsDir, { recursive: true });
    }

    const hlsFlags = '-hls_time 2 -hls_list_size 3 -hls_flags delete_segments+append_list';

    const args = [
        '-i', rtmpUrl,
        
        // 720p output
        '-map', '0:v:0', '-map', '0:a:0',
        '-c:v:0', 'libx264', '-b:v:0', '1500k', '-s:v:0', '1280x720', '-profile:v:0', 'main',
        '-c:a:0', 'aac', '-b:a:0', '128k',
        
        // 480p output
        '-map', '0:v:0', '-map', '0:a:0',
        '-c:v:1', 'libx264', '-b:v:1', '800k', '-s:v:1', '854x480', '-profile:v:1', 'main',
        '-c:a:1', 'aac', '-b:a:1', '96k',

        // 360p output
        '-map', '0:v:0', '-map', '0:a:0',
        '-c:v:2', 'libx264', '-b:v:2', '400k', '-s:v:2', '640x360', '-profile:v:2', 'baseline',
        '-c:a:2', 'aac', '-b:a:2', '64k',

        // HLS Muxer
        '-f', 'hls',
        '-var_stream_map', 'v:0,a:0 v:1,a:1 v:2,a:2',
        '-master_pl_name', 'master.m3u8',
        ...hlsFlags.split(' '),
        path.join(hlsDir, 'stream_%v.m3u8')
    ];

    const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
    const child = spawn(ffmpegPath, args);

    child.on('close', (code) => {
        console.log(`[FFmpeg] Transcoding ended for ${streamId} with code ${code}`);
    });

    return child;
}

/**
 * Cleans up HLS segments after stream ends
 */
function cleanupHlsFolder(streamId) {
    const hlsDir = path.join(__dirname, '../../hls', String(streamId));
    if (fs.existsSync(hlsDir)) {
        fs.rmSync(hlsDir, { recursive: true, force: true });
        console.log(`[Cleanup] Emptied HLS folder for stream ${streamId}`);
    }
}

module.exports = {
    startFFmpegTranscoder,
    cleanupHlsFolder
};
