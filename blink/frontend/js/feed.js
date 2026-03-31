/**
 * feed.js – Blink Feed Engine Pro v6.0
 * Vertical Reels Logic, Infinite Scroll, Pulse (Views), and Global Mute
 */

document.addEventListener('DOMContentLoaded', async () => {
    const { getToken, requireAuth, showToast, API } = window.Blink;
    if (!requireAuth()) return;

    const reelsContainer = document.getElementById('reelsContainer');
    let videoObserver = null;
    let loading = false;
    let page = 1;
    const limit = 10;
    
    // Global State
    let isMuted = true;

    async function loadFeed() {
        if (loading) return;
        loading = true;

        try {
            console.log(`🚀 Syncing Universe (Page ${page})...`);
            const res = await fetch(`${API}/videos?page=${page}&limit=${limit}`, {
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            const data = await res.json();

            if (data.success) {
                renderReels(data.videos || []);
                page++;
            } else {
                throw new Error(data.error || "Failed to load feed");
            }
        } catch (err) {
            console.error('[Feed ERROR]:', err);
            if (page === 1) showError();
        } finally {
            loading = false;
        }
    }

    function renderReels(videos) {
        if (page === 1) reelsContainer.innerHTML = '';
        
        videos.forEach((v, index) => {
            const reel = document.createElement('div');
            reel.className = 'reel-item';
            reel.dataset.id = v.id;

            const avatarHtml = v.profile_pic
                ? `<img src="${v.profile_pic}" alt="@${v.username}" class="avatar">`
                : `<div class="avatar flex-center" style="background:var(--bg-elevated); font-weight:800;">${(v.username || 'U')[0].toUpperCase()}</div>`;

            reel.innerHTML = `
                <div class="video-loading"><div class="loader"></div></div>
                <video src="${v.video_url}" loop playsinline class="reel-video" ${isMuted ? 'muted' : ''}></video>
                
                <div class="mute-btn"><i class="bi ${isMuted ? 'bi-volume-mute-fill' : 'bi-volume-up-fill'}"></i></div>

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
                    // Autoplay logic
                    document.querySelectorAll('.reel-video').forEach(v => {
                        if (v !== video) v.pause();
                    });
                    
                    video.parentElement.querySelector('.video-loading')?.classList.add('invisible');
                    video.play().catch(e => console.warn("Autoplay blocked:", e.message));
                    
                    // Register View (Pulse)
                    registerPulse(video.closest('.reel-item').dataset.id);
                } else {
                    video.pause();
                }
            });
        }, { threshold: 0.8 });

        document.querySelectorAll('.reel-video').forEach(v => videoObserver.observe(v));
    }

    async function registerPulse(id) {
        try {
            await fetch(`${API}/posts/view`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id })
            });
        } catch (e) { /* background task silent */ }
    }

    function attachEvents(reel) {
        const video = reel.querySelector('.reel-video');
        const muteBtn = reel.querySelector('.mute-btn');
        const tapOverlay = reel.querySelector('.tap-overlay');
        const likeBtn = reel.querySelector('.like-btn');
        const shareBtn = reel.querySelector('.share-btn');

        const toggleMute = () => {
            isMuted = !isMuted;
            document.querySelectorAll('.reel-video').forEach(v => v.muted = isMuted);
            document.querySelectorAll('.mute-btn i').forEach(i => {
                i.className = `bi ${isMuted ? 'bi-volume-mute-fill' : 'bi-volume-up-fill'}`;
            });
        };

        if (muteBtn) muteBtn.onclick = toggleMute;
        if (tapOverlay) tapOverlay.onclick = toggleMute;

        if (likeBtn) {
            likeBtn.onclick = async () => {
                const id = likeBtn.dataset.id;
                try {
                    const res = await fetch(`${API}/posts/like`, {
                        method: 'POST',
                        headers: { 
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${getToken()}`
                        },
                        body: JSON.stringify({ id })
                    });
                    const data = await res.json();
                    if (data.success) {
                        likeBtn.classList.add('active');
                        const count = likeBtn.parentElement.querySelector('.action-count');
                        count.textContent = parseInt(count.textContent) + 1;
                        showToast('❤️ Moment added to your heart collection.', 'success');
                    }
                } catch (e) {
                    showToast('Failed to pulse like.', 'error');
                }
            };
        }

        if (shareBtn) {
            shareBtn.onclick = () => {
                navigator.clipboard.writeText(shareBtn.dataset.url);
                showToast('🔗 Scene link copied!', 'success');
            };
        }
    }

    function showError() {
        reelsContainer.innerHTML = `<div class="flex-center h-full"><p>Connectivity issue. Try reloading.</p></div>`;
    }

    // Infinite Scroll
    reelsContainer.onscroll = () => {
        if (reelsContainer.scrollTop + reelsContainer.innerHeight >= reelsContainer.scrollHeight - 500) {
            loadFeed();
        }
    };

    loadFeed();
});
