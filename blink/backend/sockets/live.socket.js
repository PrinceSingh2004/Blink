/**
 * Live Socket Handler — Pure WebRTC signaling (no Redis dependency)
 * Handles: viewer counting, chat relay, stream lifecycle
 */

function initLiveSocket(io) {
    // No-op: all WebRTC signaling is handled in server.js main socket handler
    // This module is kept for future scaling (e.g. Redis Pub/Sub across pods)
    console.log('[LiveSocket] Initialized (lightweight mode — no Redis required)');
}

module.exports = { initLiveSocket };
