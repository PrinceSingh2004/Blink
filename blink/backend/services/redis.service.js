const { redisClient } = require('../config/redis');

async function incrementViewer(streamId) {
    const count = await redisClient.incr(`stream:${streamId}:viewers`);
    return count;
}

async function decrementViewer(streamId) {
    const count = await redisClient.decr(`stream:${streamId}:viewers`);
    return Math.max(count, 0);
}

async function getViewerCount(streamId) {
    const count = await redisClient.get(`stream:${streamId}:viewers`);
    return parseInt(count || 0, 10);
}

async function setStreamStatus(streamId, status) {
    await redisClient.set(`stream:${streamId}:status`, status);
}

async function getStreamStatus(streamId) {
    return await redisClient.get(`stream:${streamId}:status`);
}

async function cacheRecentChats(streamId, messageObj) {
    const key = `stream:${streamId}:chats`;
    await redisClient.lpush(key, JSON.stringify(messageObj));
    await redisClient.ltrim(key, 0, 49);
}

async function getRecentChats(streamId) {
    const chats = await redisClient.lrange(`stream:${streamId}:chats`, 0, -1);
    return chats.map(c => JSON.parse(c)).reverse();
}

async function expireStreamKeys(streamId) {
    const ttl = 60; // 60s
    await redisClient.expire(`stream:${streamId}:viewers`, ttl);
    await redisClient.expire(`stream:${streamId}:status`, ttl);
    await redisClient.expire(`stream:${streamId}:chats`, ttl);
}

module.exports = {
    incrementViewer, decrementViewer, getViewerCount,
    setStreamStatus, getStreamStatus, cacheRecentChats,
    getRecentChats, expireStreamKeys
};
