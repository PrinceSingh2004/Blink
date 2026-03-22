// ... Append below main self-invoking function ...

/* ====================================================
   NEW SFU / HLS INTEGRATION FUNCTIONS
==================================================== */

window.Blink = window.Blink || {};

window.Blink.fetchLiveStreams = async function() {
    try {
        const data = await window.apiRequest('/live/streams');
        const grid = document.getElementById('liveDiscoveryGrid');
        if (!grid) return;
        
        if (!data.streams || !data.streams.length) {
            grid.innerHTML = '<p style="color:#666;text-align:center;">No streams currently active.</p>';
            return;
        }

        grid.innerHTML = data.streams.map(s => `
            <div class="live-card" onclick="window.Blink.joinLiveStream('${s.id}')">
                <div class="live-card-hero">
                    <img src="${s.avatar || '/favicon.png'}">
                    <div class="live-badge-mini">LIVE</div>
                    <div class="viewer-count-tag"><i class="bi bi-eye-fill"></i> ${s.viewer_count || 0}</div>
                </div>
                <div class="live-card-info">
                    <div class="user-name">@${s.username}</div>
                    <button class="watch-now-btn">Join</button>
                </div>
            </div>
        `).join('');
    } catch (e) { console.error('Error fetching SFU streams:', e); }
};

window.Blink.goLive = async function(title) {
    try {
        reqBody = title ? { title } : {};
        const res = await window.apiRequest('/live/start', 'POST', reqBody);
        
        if(res.streamKey) {
            document.getElementById('streamKeyDisplay').textContent = res.streamKey;
            document.getElementById('broadcasterPanel').style.display = 'block';
        }
        
        window.Blink.currentStreamId = res.streamId;
        window.showToast('SFU Stream Initialized. Hook up OBS using your new key!', 'success');
    } catch(e) { console.error('goLive SFU err:', e); }
};

window.Blink.endMyStream = async function(streamId) {
    if(!streamId) streamId = window.Blink.currentStreamId;
    try {
        await window.apiRequest(`/live/end/${streamId}`, 'POST');
        document.getElementById('broadcasterPanel').style.display = 'none';
        window.showToast('Stream Ended Successfully.', 'info');
    } catch(e) {}
};

window.Blink.joinLiveStream = async function(streamId) {
    try {
        const video = document.getElementById('remoteVideo');
        const res = await window.apiRequest(`/live/stream/${streamId}`);
        const stream = res.stream;

        document.getElementById('liveDiscovery').style.display = 'none';
        
        if (Hls.isSupported()) {
            const hls = new Hls();
            window.Blink.currentHls = hls; // Keep ref for cleanup
            hls.loadSource(stream.hls_url);
            hls.attachMedia(video);
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                video.play().catch(e => console.warn('Autoplay restricted:', e));
            });
        }
        
        // Connect Socket chat room
        if(window.socket) window.socket.emit('join:stream', { streamId, userId: window.getUser().id });
        
        // Fetch History
        const chatRes = await window.apiRequest(`/live/chat/${streamId}?page=1&limit=50`);
        if(chatRes.chat) chatRes.chat.forEach(msg => window.Blink.renderChatMessage(msg));

        window.Blink.currentStreamId = streamId;
    } catch(e) { console.error('Error joining stream SFU:', e); }
};

window.Blink.leaveLiveStream = function() {
    if(window.socket && window.Blink.currentStreamId) {
        window.socket.emit('leave:stream');
    }
    if (window.Blink.currentHls) {
        window.Blink.currentHls.destroy();
        window.Blink.currentHls = null;
    }

    window.Blink.currentStreamId = null;
    document.getElementById('liveDiscovery').style.display = 'block';
};

window.Blink.sendChatMessage = function(msg) {
    if(!msg || !msg.trim() || !window.Blink.currentStreamId || !window.socket) return;
    window.socket.emit('send:message', {
        streamId: window.Blink.currentStreamId,
        userId: window.getUser().id,
        username: window.getUser().username,
        message: msg
    });
};

window.Blink.renderChatMessage = function(data) {
    const list = document.getElementById('chatList');
    if(!list) return;
    const msgDiv = document.createElement('div');
    msgDiv.className = 'chat-message';
    msgDiv.innerHTML = `<span class="chat-username">@${data.username}</span>: <span class="chat-text">${data.message}</span>`;
    list.appendChild(msgDiv);
    list.scrollTop = list.scrollHeight;
};

window.Blink.updateViewerCount = function(count) {
    const el = document.getElementById('viewerCount');
    if(el) el.innerHTML = `<i class="bi bi-eye-fill"></i> ${count}`;
};
