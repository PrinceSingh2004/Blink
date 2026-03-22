const db = require('../config/db');

async function createStreamKey(userId, rawKey) {
    const [result] = await db.execute(
        'INSERT INTO stream_keys (user_id, stream_key) VALUES (?, ?)',
        [userId, rawKey]
    );
    return result.insertId;
}

async function validateStreamKey(rawKey) {
    const [rows] = await db.execute(
        `SELECT k.id as key_id, k.user_id, u.username
         FROM stream_keys k
         JOIN users u ON k.user_id = u.id
         WHERE k.stream_key = ? AND k.is_active = TRUE`,
        [rawKey]
    );
    return rows[0];
}

async function createStream(userId, streamKeyId, title, hlsUrl) {
    const [result] = await db.execute(
        'INSERT INTO live_streams (user_id, stream_key_id, title, hls_url, status, started_at) VALUES (?, ?, ?, ?, ?, NOW())',
        [userId, streamKeyId, title, hlsUrl, 'live']
    );
    return result.insertId;
}

async function getStreamById(streamId) {
    const [rows] = await db.execute(
        `SELECT s.*, u.username, u.profile_photo as avatar 
         FROM live_streams s
         JOIN users u ON s.user_id = u.id
         WHERE s.id = ?`,
        [streamId]
    );
    return rows[0];
}

async function getAllLiveStreams() {
    const [rows] = await db.execute(
        `SELECT s.id, s.title, s.viewer_count, s.hls_url, u.username, u.profile_photo as avatar
         FROM live_streams s
         JOIN users u ON s.user_id = u.id
         WHERE s.status = 'live'`
    );
    return rows;
}

async function endStream(streamId) {
    await db.execute(
        `UPDATE live_streams 
         SET status = 'ended', ended_at = NOW() 
         WHERE id = ?`,
        [streamId]
    );
}

async function insertChatMessage(streamId, userId, username, message) {
    const [result] = await db.execute(
        'INSERT INTO stream_chats (stream_id, user_id, username, message) VALUES (?, ?, ?, ?)',
        [streamId, userId, username, message]
    );
    return result.insertId;
}

async function getChatMessages(streamId, limit = 50, offset = 0) {
    const [rows] = await db.execute(
        'SELECT id, username, message, created_at FROM stream_chats WHERE stream_id = ? ORDER BY id DESC LIMIT ? OFFSET ?',
        [streamId, String(limit), String(offset)]
    );
    return rows.reverse();
}

async function updateViewerCount(streamId, viewerCount) {
    await db.execute(
        `UPDATE live_streams 
         SET viewer_count = ?, peak_viewers = GREATEST(peak_viewers, ?)
         WHERE id = ?`,
        [viewerCount, viewerCount, streamId]
    );
}

async function logViewer(streamId, userId) {
    await db.execute(
        'INSERT INTO stream_viewers (stream_id, user_id) VALUES (?, ?)',
        [streamId, userId]
    );
}

module.exports = {
    createStreamKey, validateStreamKey, createStream, 
    getStreamById, getAllLiveStreams, endStream, 
    insertChatMessage, getChatMessages, updateViewerCount, logViewer
};
