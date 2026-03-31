/**
 * feed.js – Blink Unified Reels Feed v5.0 (Task 1-8 Fixed)
 */

document.addEventListener('DOMContentLoaded', async () => {
    if (!window.Blink) return console.error('[Blink] auth.js not loaded');
    const { getToken, getUser, requireAuth, showToast } = window.Blink;
    
    if (!requireAuth()) return;

    const reels        = document.getElementById('reelsContainer');
    let videoObserver  = null;
    let loading        = false;

    async function loadFeed() {
        if (loading) return;
        loading = true;
        reels.innerHTML = '<div class="profile-error"><div class="loader"></div><p>Blink is fetching latest moments...</p></div>';

        try {
            console.log("Fetching Feed (Task 8)...");
            const res = await fetch(window.Blink.API + '/videos', {
                headers: { 'Authorization': 'Bearer ' + getToken() }
            });
            const data = await res.json();
            
            console.log("Feed Data (Task 8):", data);

            if (data.success) {
                renderReels(data.videos || []);
            } else {
                throw new Error(data.error || "Unable to load moments");
            }
        } catch (err) {
            console.error('[Feed ERROR]:', err);
            reels.innerHTML = `<div class="profile-error"><i class="bi bi-exclamation-triangle" style="font-size:48px;color:red;"></i><p>Failed to load data: ${err.message}</p></div>`;
            showToast('Unable to load moments.', 'error');
        } finally {
            loading = false;
        }
    }

    function renderReels(videos) {
        if (!videos || videos.length === 0) {
            reels.innerHTML = '<div class="profile-error"><i class="bi bi-camera-reels" style="font-size:48px;opacity:0.2;"></i><p>No moments posted yet.</p></div>';
            return;
        }

        reels.innerHTML = '';
        videos.forEach((v, index) => {
            const reel = document.createElement('div');
            reel.className = 'reel-item animate-fade-in';
            reel.dataset.id = v.id;

            const avatarHtml = v.profile_pic
                ? `<img src="${v.profile_pic}" alt="@${v.username}" class="avatar" style="width:100%;height:100%;object-fit:cover;">`
                : (v.username || 'U')[0].toUpperCase();

            reel.innerHTML = `
                <video src="${v.url}" loop muted playsinline class="reel-video" preload="metadata" data-index="${index}"></video>
                
                <div class="reel-actions">
                    <div class="action-item" onclick="window.location.href='profile.html?id=${v.user_id}'">
                        <div class="story-ring" style="width:48px;height:48px;padding:2px;margin-bottom:10px;">
                            <div class="avatar" style="width:100%;height:100%;background:#333;display:flex;align-items:center;justify-content:center;font-size:18px;">
                                ${avatarHtml}
                            </div>
                        </div>
                    </div>
                    <div class="action-item">
                        <button class="btn-ghost action-btn like-btn" data-id="${v.id}"><i class="bi bi-heart"></i></button>
                        <span class="action-count">0</span>
                    </div>
                    <div class="action-item">
                        <button class="btn-ghost action-btn share-btn" data-url="${v.url}"><i class="bi bi-send-fill"></i></button>
                    </div>
                </div>

                <div class="reel-info">
                    <div class="reel-user" onclick="window.location.href='profile.html?id=${v.user_id}'">
                        <span class="reel-username">@${v.username}</span>
                    </div>
                    <p class="reel-caption">${v.caption || ''}</p>
                </div>
                <div class="tap-to-pause" style="position:absolute;top:0;left:0;right:0;bottom:100px;z-index:2;"></div>
            `;

            reels.appendChild(reel);
            attachEvents(reel);
        });

        initVideoObserver();
    }

    function initVideoObserver() {
        if (videoObserver) {
            // Cleanup old observer
            document.querySelectorAll('.reel-video').forEach(v => videoObserver.unobserve(v));
        }

        videoObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                const video = entry.target;
                if (entry.isIntersecting) {
                    // Pause all other videos first to prevent random playback
                    document.querySelectorAll('.reel-video').forEach(v => {
                        if (v !== video) v.pause();
                    });
                    
                    console.log("Playing:", video.src);
                    video.play().catch(e => console.warn("Autoplay blocked:", e.message));
                } else {
                    video.pause();
                }
            });
        }, { threshold: 0.8 });

        document.querySelectorAll('.reel-video').forEach(v => videoObserver.observe(v));
    }

    function attachEvents(reel) {
        const video = reel.querySelector('.reel-video');
        const tapOverlay = reel.querySelector('.tap-to-pause');
        const shareBtn = reel.querySelector('.share-btn');

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
                showToast('🔗 Link copied!', 'success');
            };
        }
    }

    await loadFeed();
});
