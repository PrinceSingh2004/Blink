/**
 * feed.js – Blink Feed Engine v6.0
 * Optimized for Vertical Video Scroll & Snap
 */

document.addEventListener('DOMContentLoaded', async () => {
    const { getToken, requireAuth, showToast, API } = window.Blink;
    if (!requireAuth()) return;

    const reelsContainer = document.getElementById('reelsContainer');
    let videoObserver = null;
    let loading = false;

    async function loadFeed() {
        if (loading) return;
        loading = true;

        try {
            console.log("🚀 Syncing Blinks...");
            const res = await fetch(`${API}/videos`, {
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            const data = await res.json();

            if (data.success) {
                renderReels(data.videos || []);
            } else {
                throw new Error(data.error || "Failed to load feed");
            }
        } catch (err) {
            console.error('[Feed ERROR]:', err);
            reelsContainer.innerHTML = `
                <div class="flex-center flex-col h-full gap-2 text-center" style="padding: 40px;">
                    <i class="bi bi-exclamation-triangle" style="font-size:48px; color:var(--primary);"></i>
                    <h3>Connectivity Lost</h3>
                    <p style="color:var(--text-muted); max-width: 280px;">Blink was unable to synchronize your universe. Check your connection.</p>
                    <button class="btn btn-secondary btn-sm" onclick="location.reload()">Retry Connection</button>
                </div>
            `;
        } finally {
            loading = false;
        }
    }

    function renderReels(videos) {
        if (!videos.length) {
            reelsContainer.innerHTML = `
                <div class="flex-center flex-col h-full gap-2 text-center">
                    <i class="bi bi-camera-reels" style="font-size:48px; opacity:0.2;"></i>
                    <h3 style="color:var(--text-muted);">The Universe is Quiet</h3>
                    <p style="color:var(--text-muted); font-size: 14px;">Be the first to share a moment today.</p>
                    <a href="upload.html" class="btn btn-primary btn-sm" style="margin-top:12px;">Create First Blink</a>
                </div>
            `;
            return;
        }

        reelsContainer.innerHTML = '';
        videos.forEach((v, index) => {
            const reel = document.createElement('div');
            reel.className = 'reel-item';
            reel.dataset.id = v.id;

            const avatarHtml = v.profile_pic
                ? `<img src="${v.profile_pic}" alt="@${v.username}" class="avatar">`
                : `<div class="avatar flex-center" style="background:var(--bg-elevated); font-weight:800;">${(v.username || 'U')[0].toUpperCase()}</div>`;

            reel.innerHTML = `
                <div class="video-loading"><div class="loader"></div></div>
                <video src="${v.url}" loop muted playsinline class="reel-video" data-index="${index}"></video>
                
                <div class="reel-actions">
                    <div class="action-item" onclick="window.location.href='profile.html?id=${v.user_id}'">
                        ${avatarHtml}
                    </div>
                    <div class="action-item">
                        <button class="action-btn like-btn" data-id="${v.id}">
                            <i class="bi bi-heart-fill"></i>
                        </button>
                        <span class="action-count">${v.likes_count || 0}</span>
                    </div>
                    <div class="action-item">
                        <button class="action-btn share-btn" data-url="${v.url}">
                            <i class="bi bi-send-fill"></i>
                        </button>
                    </div>
                </div>

                <div class="reel-info">
                    <div class="reel-user" onclick="window.location.href='profile.html?id=${v.user_id}'">
                        <span class="reel-username">@${v.username}</span>
                    </div>
                    <p class="reel-caption">${v.caption || ''}</p>
                </div>
                <div class="tap-to-pause"></div>
            `;

            reelsContainer.appendChild(reel);
            attachEvents(reel);
        });

        initVideoObserver();
    }

    function initVideoObserver() {
        if (videoObserver) {
            document.querySelectorAll('.reel-video').forEach(v => videoObserver.unobserve(v));
        }

        videoObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                const video = entry.target;
                if (entry.isIntersecting) {
                    // Pause other videos
                    document.querySelectorAll('.reel-video').forEach(v => {
                        if (v !== video) v.pause();
                    });
                    
                    video.parentElement.querySelector('.video-loading')?.classList.add('invisible');
                    video.play().catch(e => console.warn("Autoplay blocked:", e.message));
                } else {
                    video.pause();
                }
            });
        }, { threshold: 0.7 });

        document.querySelectorAll('.reel-video').forEach(v => videoObserver.observe(v));
    }

    function attachEvents(reel) {
        const video = reel.querySelector('.reel-video');
        const tapOverlay = reel.querySelector('.tap-to-pause');
        const shareBtn = reel.querySelector('.share-btn');
        const likeBtn = reel.querySelector('.like-btn');

        if (tapOverlay && video) {
            tapOverlay.onclick = () => {
                if (video.paused) video.play().catch(() => {});
                else video.pause();
            };
        }

        if (shareBtn) {
            shareBtn.onclick = () => {
                const url = shareBtn.dataset.url;
                navigator.clipboard.writeText(url);
                showToast('🔗 Link copied to clipboard!', 'success');
            };
        }

        if (likeBtn) {
            likeBtn.onclick = () => {
                likeBtn.classList.toggle('active');
                const count = likeBtn.parentElement.querySelector('.action-count');
                const current = parseInt(count.textContent);
                count.textContent = likeBtn.classList.contains('active') ? current + 1 : current - 1;
            };
        }
    }

    loadFeed();
});
