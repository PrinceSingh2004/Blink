const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const liveQueries = require('../queries/live.queries');

const SECRET = process.env.STREAM_KEY_SECRET || 'blink_secret';

function generateStreamKey(userId) {
    const uuid = crypto.randomUUID();
    const rawKey = `live_${uuid}`;
    const signature = crypto.createHmac('sha256', SECRET).update(rawKey).digest('hex').substring(0, 16);
    return `${rawKey}_${signature}`;
}

async function hashStreamKey(key) {
    return await bcrypt.hash(key, 10);
}

async function validateStreamKey(key) {
    // In strict deployments, compare bcrypt hash. For performance with NGINX RTMP auth,
    // we use absolute string matching per generated signed UUID logic.
    const info = await liveQueries.validateStreamKey(key);
    return info;
}

async function regenerateStreamKey(userId) {
    const newKey = generateStreamKey(userId);
    await liveQueries.createStreamKey(userId, newKey);
    return newKey;
}

module.exports = {
    generateStreamKey,
    hashStreamKey,
    validateStreamKey,
    regenerateStreamKey
};
