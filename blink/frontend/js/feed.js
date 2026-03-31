/**
 * feed.js – Blink Feed Engine Pro v6.0 (Black Screen Fix)
 * Optimized for: Muted Autoplay, iOS Safari, and High-Fidelity Engagement
 */

document.addEventListener('DOMContentLoaded', () => {
    const { getToken, requireAuth, showToast, API } = window.Blink;
    if (!requireAuth()) return;

    const reelsContainer = document.getElementById('reelsContainer');
    let globalMuted = true;
    const observer = initVideoObserver();

    // ── VIDEO ELEMENT FACTORY ─────────────────────────────
    function createVideoElement(videoData) {
        const video = document.createElement('video');
        
        // Required attributes for autoplay & iOS
        video.src = videoData.video_url || '';
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        video.autoplay = false; // Controlled by observer
        video.preload = 'metadata';
        video.controls = false;
        video.crossOrigin = 'anonymous';
        video.className = 'reel-video';

        // Redundant attributes for deep browser compatibility
        video.setAttribute('muted', '');
        video.setAttribute('playsinline', '');
        video.setAttribute('loop', '');
        video.setAttribute('preload', 'metadata');

        if (videoData.thumbnail_url) video.poster = videoData.thumbnail_url;

        // Feedback Listeners
        video.onplaying = () => hideLoader(video);
        video.onwaiting = () => showLoader(video);
        video.oncanplay = () => hideLoader(video);
        video.onerror = () => showVideoError(video);

        return video;
    }

    // ── SAFE PLAY/PAUSE ────────────────────────────────────
    async function safePlay(video) {
        if (!video || !video.src || video.src === window.location.href) return;
        try {
            video.muted = globalMuted;
            const playPromise = video.play();
            if (playPromise !== undefined) {
                await playPromise;
            }
        } catch (err) {
            if (err.name === 'NotAllowedError') showPlayOverlay(video);
            console.warn("Playback prevented:", err.message);
        }
    }

    function safePause(video) {
        if (video && !video.paused) video.pause();
    }

    // ── INTERSECTION OBSERVER (TikTok Style) ───────────────
    function initVideoObserver() {
        return new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                const reel = entry.target;
                const video = reel.querySelector('video');
                if (!video) return;

                if (entry.isIntersecting && entry.intersectionRatio >= 0.7) {
                    safePlay(video);
                    trackView(reel.dataset.id);
                } else {
                    safePause(video);
                    video.currentTime = 0; // Reset
                }
            });
        }, { threshold: 0.7 });
    }

    // ── TRACK VIEW (FIX Auth:false) ────────────────────────
    async function trackView(videoId) {
        if (!videoId) return;
        try {
            await fetch(`${API}/posts/view`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${getToken()}` 
                },
                body: JSON.stringify({ id: videoId, videoId }) // Support both aliases
            });
        } catch (err) { /* Non-critical */ }
    }

    // ── FEED LOADER & RENDERER ─────────────────────────────
    async function loadFeed() {
        try {
            const res = await fetch(`${API}/videos`, {
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            const data = await res.json();
            if (data.success) renderFeed(data.videos || []);
        } catch (err) {
            console.error("Feed Sync Error:", err);
            showToast("Universe pulse failed.", "error");
        }
    }

    function renderFeed(videos) {
        reelsContainer.innerHTML = '';
        videos.forEach((v, index) => {
            const reel = document.createElement('div');
            reel.className = 'reel-item';
            reel.dataset.id = v.id;

            const video = createVideoElement(v);
            const videoWrap = document.createElement('div');
            videoWrap.className = 'video-wrapper';
            videoWrap.appendChild(video);

            const avatarHtml = v.profile_pic
                ? `<img src="${v.profile_pic}" alt="@${v.username}" class="avatar">`
                : `<div class="avatar flex-center" style="background:var(--bg-elevated);">${v.username[0].toUpperCase()}</div>`;

            reel.innerHTML = `
                <div class="video-loading"><div class="loader"></div></div>
                <div class="mute-btn-global"><i class="bi bi-volume-mute-fill"></i></div>
                
                <div class="reel-actions">
                    <div class="action-item" onclick="window.location.href='profile.html?id=${v.user_id}'">
                        ${avatarHtml}
                    </div>
                    <div class="action-item">
                        <button class="action-btn like-btn ${v.is_liked ? 'liked' : ''}" data-id="${v.id}">
                            <i class="bi bi-heart-fill"></i>
                        </button>
                        <span class="action-count">${v.likes_count || 0}</span>
                    </div>
                    <div class="action-item">
                        <button class="action-btn comment-btn" data-id="${v.id}">
                            <i class="bi bi-chat-fill"></i>
                        </button>
                    </div>
                    <div class="action-item">
                        <button class="action-btn share-btn" data-url="${v.video_url}">
                            <i class="bi bi-send-fill"></i>
                        </button>
                    </div>
                </div>

                <div class="reel-info">
                    <div class="reel-user" onclick="window.location.href='profile.html?id=${v.user_id}'">
                        <span class="reel-username">@${v.username}</span>
                    </div>
                    <p class="reel-caption">${v.caption || ''}</p>
                    <div class="reel-hashtags">${v.hashtags || ''}</div>
                </div>
                <div class="tap-overlay"></div>
            `;

            reel.prepend(videoWrap);
            reelsContainer.appendChild(reel);
            
            // Attach tap to play/pause
            const tapOverlay = reel.querySelector('.tap-overlay');
            tapOverlay.onclick = () => {
                if (video.paused) safePlay(video);
                else safePause(video);
            };

            // Global Mute Toggle
            const muteBtn = reel.querySelector('.mute-btn-global');
            muteBtn.onclick = () => {
                globalMuted = !globalMuted;
                document.querySelectorAll('video').forEach(vid => vid.muted = globalMuted);
                document.querySelectorAll('.mute-btn-global i').forEach(i => {
                    i.className = `bi ${globalMuted ? 'bi-volume-mute-fill' : 'bi-volume-up-fill'}`;
                });
            };

            observer.observe(reel);
        });

        // Auto-play first video
        setTimeout(() => {
            const firstVideo = reelsContainer.querySelector('video');
            if (firstVideo) safePlay(firstVideo);
        }, 500);
    }

    // ── UI HELPERS ─────────────────────────────────────────
    function showLoader(video) {
        video.closest('.reel-item').querySelector('.video-loading').style.display = 'flex';
    }
    function hideLoader(video) {
        video.closest('.reel-item').querySelector('.video-loading').style.display = 'none';
    }
    function showVideoError(video) {
        const item = video.closest('.reel-item');
        item.innerHTML = `<div class="video-error flex-center">⚠️ Video unavailable</div>`;
    }
    function showPlayOverlay(video) {
        const item = video.closest('.reel-item');
        if (item.querySelector('.play-overlay')) return;
        const overlay = document.createElement('div');
        overlay.className = 'play-overlay flex-center';
        overlay.innerHTML = '<i class="bi bi-play-fill"></i>';
        overlay.onclick = () => {
            overlay.remove();
            safePlay(video);
        };
        item.appendChild(overlay);
    }

    loadFeed();
});
