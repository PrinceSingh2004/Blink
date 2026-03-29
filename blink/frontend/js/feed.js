/**
 * feed.js – Blink Unified Reels Feed v4.0 (Performance Optimized)
 * Task: Fullscreen Vertical Scroll, Snap Scroll, Autoplay/Pause, No Demo Data
 */

document.addEventListener('DOMContentLoaded', async () => {
    // ── 1. HELPERS & AUTH ───────────────────────────────────────
    if (!window.Blink) return console.error('[Blink] auth.js not loaded');
    const { getToken, getUser, requireAuth, showToast, apiRequest } = window.Blink;
    
    if (!requireAuth()) return;

    const me           = getUser();
    const reels        = document.getElementById('reelsContainer');
    let videoObserver  = null;
    let loading        = false;

    // ── 2. LOAD DATA (Database Exclusive) ─────────────────────── (Task 6)
    async function loadFeed() {
        if (loading) return;
        loading = true;
        reels.innerHTML = '<div class="profile-error"><div class="loader"></div><p>Blink is fetching latest moments...</p></div>';

        try {
            // Task: Fetch only user-uploaded content from MySQL meta
            const data = await apiRequest('/posts/feed');
            renderReels(data.posts || []);
        } catch (err) {
            console.error('[Feed] Failed to load:', err);
            showToast('Failed to load feed.', 'error');
            reels.innerHTML = '<p class="profile-error">Unable to load moments. Check your internet.</p>';
        } finally {
            loading = false;
        }
    }

    function renderReels(posts) {
        if (!posts || posts.length === 0) {
            reels.innerHTML = '<div class="profile-error"><i class="bi bi-camera-reels" style="font-size:48px;opacity:0.2;"></i><p>No moments posted yet.</p></div>';
            return;
        }

        reels.innerHTML = ''; // Clear loader
        posts.forEach(p => {
            const reel = document.createElement('div');
            reel.className = 'reel-item animate-fade-in';
            reel.dataset.id = p.id;

            const avatarHtml = p.avatar
                ? `<img src="${p.avatar}" alt="@${p.username}" class="avatar" style="width:100%;height:100%;object-fit:cover;">`
                : (p.username || 'U')[0].toUpperCase();

            reel.innerHTML = `
                <!-- Task: Cloudinary URL with f_auto, q_auto -->
                <video src="${p.media_url}" 
                       loop muted playsinline 
                       class="reel-video" 
                       preload="metadata"></video>
                
                <!-- Side Actions Overlay (Task 6) -->
                <div class="reel-actions">
                    <div class="action-item" onclick="window.location.href='profile.html?id=${p.user_id}'">
                        <div class="story-ring" style="width:48px;height:48px;padding:2px;margin-bottom:10px;">
                            <div class="avatar" style="width:100%;height:100%;background:#333;display:flex;align-items:center;justify-content:center;font-size:18px;">
                                ${avatarHtml}
                            </div>
                        </div>
                    </div>

                    <div class="action-item">
                        <button class="btn-ghost action-btn like-btn ${p.liked_by_me ? 'liked' : ''}" data-id="${p.id}">
                            <i class="bi ${p.liked_by_me ? 'bi-heart-fill' : 'bi-heart'}"></i>
                        </button>
                        <span class="action-count">${p.likes_count || 0}</span>
                    </div>

                    <div class="action-item">
                        <button class="btn-ghost action-btn comment-btn" onclick="showToast('Comments coming soon!', 'info')">
                            <i class="bi bi-chat-right-text-fill"></i>
                        </button>
                        <span class="action-count">${p.comments_count || 0}</span>
                    </div>

                    <div class="action-item">
                        <button class="btn-ghost action-btn share-btn">
                            <i class="bi bi-send-fill"></i>
                        </button>
                    </div>
                </div>

                <!-- Bottom Info Overlay -->
                <div class="reel-info">
                    <div class="reel-user" onclick="window.location.href='profile.html?id=${p.user_id}'">
                        <span class="reel-username">@${p.username}</span>
                        ${p.is_verified ? `<i class="bi bi-patch-check-fill animate-pulse" style="color:var(--accent-secondary);font-size:14px;margin-left:4px;"></i>` : ''}
                    </div>
                    ${p.caption ? `<p class="reel-caption">${p.caption}</p>` : ''}
                    <div class="reel-music" style="display:flex;align-items:center;gap:8px;margin-top:10px;font-size:13px;opacity:0.8;">
                        <i class="bi bi-music-note-beamed"></i>
                        <marquee scrollamount="3" style="width:150px;">Original Sound · Blink Originals · High Fidelity</marquee>
                    </div>
                </div>

                <div class="tap-to-pause" style="position:absolute;top:0;left:0;right:0;bottom:100px;z-index:2;"></div>
            `;

            reels.appendChild(reel);
            attachEvents(reel, p);
        });

        initVideoObserver();
    }

    // ── 3. PERFORMANCE: AUTOPLAY & PAUSE ──────────────────────── (Task 9)
    function initVideoObserver() {
        if (!videoObserver) {
            videoObserver = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    const video = entry.target;
                    if (entry.isIntersecting) {
                        video.play().catch(() => {});
                    } else {
                        video.pause();
                        video.currentTime = 0; // Reset for performance
                    }
                });
            }, { threshold: 0.8 }); // Trigger only when 80% visible
        }

        document.querySelectorAll('.reel-video').forEach(v => {
            if (!v.dataset.observed) {
                videoObserver.observe(v);
                v.dataset.observed = '1';
            }
        });
    }

    // ── 4. UI EVENTS ──────────────────────────────────────────
    function attachEvents(reel, p) {
        const video      = reel.querySelector('.reel-video');
        const tapOverlay = reel.querySelector('.tap-to-pause');
        const shareBtn   = reel.querySelector('.share-btn');

        // Tap to pause/play
        tapOverlay.onclick = () => {
            if (video.paused) video.play().catch(() => {});
            else video.pause();
        };

        // Share native or clipboard
        shareBtn.onclick = () => {
            if (navigator.share) {
                navigator.share({ title: `Blink by @${p.username}`, url: p.media_url });
            } else {
                navigator.clipboard.writeText(p.media_url);
                showToast('🔗 Link copied to clipboard!', 'success');
            }
        };
    }

    // --- Start ---
    await loadFeed();
});
