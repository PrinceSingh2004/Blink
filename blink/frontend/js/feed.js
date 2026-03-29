/**
 * feed.js – Blink Reels Feed v3
 * ══════════════════════════════════════════════════════════════
 * Infinite scroll, video autoplay, stories, like/comment – Fixed
 * ══════════════════════════════════════════════════════════════
 */

document.addEventListener('DOMContentLoaded', async () => {
    // ── Auth guard ──────────────────────────────────────────────
    if (!window.Blink) return console.error('[Blink] auth.js not loaded');
    const { getToken, getUser, requireAuth, showToast, apiRequest } = window.Blink;
    if (!requireAuth()) return;

    const me           = getUser();
    const feed         = document.getElementById('feedContainer');
    const loader       = document.getElementById('feedLoader');
    const storiesList  = document.getElementById('storiesList');
    const storyInput   = document.getElementById('storyInput');

    let page      = 0;
    const limit   = 5;
    let loading   = false;
    let hasMore   = true;

    // ══════════════════════════════════════════════════════════════
    // 1. STORIES SYSTEM
    // ══════════════════════════════════════════════════════════════
    async function loadStories() {
        if (!storiesList) return;
        try {
            const data = await apiRequest('/stories/feed');
            renderStories(data.users || []);
        } catch (err) {
            console.warn('[Stories] Failed to load:', err.message);
        }
    }

    function renderStories(users) {
        storiesList.innerHTML = '';
        users.forEach(u => {
            const div = document.createElement('div');
            div.className = `story-bubble${u.all_seen ? '' : ' unseen'}`;
            div.innerHTML = `
                <div class="story-avatar">
                    ${u.avatar
                        ? `<img src="${u.avatar}" alt="${u.username}" loading="lazy">`
                        : `<div class="story-avatar-placeholder">${u.username[0].toUpperCase()}</div>`
                    }
                </div>
                <span>${u.username === me?.username ? 'You' : u.username}</span>
            `;
            div.onclick = () => openStoryViewer(u);
            storiesList.appendChild(div);
        });
    }

    function openStoryViewer(user) {
        if (!user.stories?.length) return;
        const story = user.stories[0];
        showToast(`📸 @${user.username}'s story (${user.stories.length} ${user.stories.length === 1 ? 'item' : 'items'})`, 'info');
        // Mark as seen
        apiRequest(`/stories/${story.id}/seen`, { method: 'POST' }).catch(() => {});
    }

    // Story upload
    const addStoryBtn = document.getElementById('addStoryBtn');
    if (addStoryBtn && storyInput) {
        addStoryBtn.onclick = () => storyInput.click();
        storyInput.onchange = async () => {
            const file = storyInput.files[0];
            if (!file) return;

            const formData = new FormData();
            formData.append('story', file);
            showToast('⏫ Uploading story...', 'info');

            try {
                await fetch(window.Blink.API + '/stories/upload', {
                    method: 'POST',
                    headers: { 'Authorization': 'Bearer ' + getToken() },
                    body: formData
                });
                showToast('✨ Story posted!', 'success');
                loadStories();
            } catch (err) {
                showToast('Upload failed. Try again.', 'error');
            }
            storyInput.value = '';
        };
    }

    // ══════════════════════════════════════════════════════════════
    // 2. REELS FEED (Infinite Scroll)
    // ══════════════════════════════════════════════════════════════
    async function loadReels() {
        if (loading || !hasMore) return;
        loading = true;
        if (loader) loader.classList.remove('hidden');

        try {
            const data = await apiRequest(`/videos/feed?limit=${limit}&offset=${page * limit}`);
            const videos = data.videos || [];

            if (videos.length < limit) hasMore = false;
            renderReels(videos);
            page++;
        } catch (err) {
            console.error('[Feed]', err);
            showToast('Failed to load reels', 'error');
        } finally {
            loading = false;
            if (loader) loader.classList.add('hidden');
        }
    }

    function renderReels(videos) {
        if (!videos.length) return;
        
        videos.forEach(v => {
            const reel = document.createElement('div');
            reel.className = 'reel-item animate-fade-in';
            reel.dataset.id = v.id;

            const avatarHtml = v.avatar
                ? `<img src="${v.avatar}" alt="@${v.username}" class="reel-user-avatar avatar" loading="lazy">`
                : `<div class="reel-user-avatar avatar" style="display:flex;align-items:center;justify-content:center;background:#333;font-size:12px;">${(v.username || 'U')[0].toUpperCase()}</div>`;

            reel.innerHTML = `
                <video src="${v.video_url}" loop muted playsinline class="reel-video" preload="metadata"></video>
                
                <!-- Side Actions -->
                <div class="reel-actions">
                    <div class="action-item" onclick="window.location.href='profile.html?id=${v.user_id}'">
                        <div class="story-ring" style="width:48px;height:48px;padding:2px;margin-bottom:10px;">
                            ${avatarHtml}
                        </div>
                    </div>

                    <div class="action-item">
                        <button class="btn-ghost action-btn like-btn ${v.liked_by_me ? 'liked' : ''}" data-id="${v.id}" data-liked="${v.liked_by_me}">
                            <i class="bi ${v.liked_by_me ? 'bi-heart-fill' : 'bi-heart'}"></i>
                        </button>
                        <span class="action-count">${v.likes_formatted || v.likes_count || 0}</span>
                    </div>

                    <div class="action-item">
                        <button class="btn-ghost action-btn comment-btn" data-id="${v.id}">
                            <i class="bi bi-chat-right-text-fill"></i>
                        </button>
                        <span class="action-count">${v.comments_count || 0}</span>
                    </div>

                    <div class="action-item">
                        <button class="btn-ghost action-btn share-btn">
                            <i class="bi bi-send-fill"></i>
                        </button>
                        <span class="action-count">Share</span>
                    </div>
                </div>

                <!-- Bottom Info -->
                <div class="reel-info">
                    <div class="reel-user" onclick="window.location.href='profile.html?id=${v.user_id}'">
                        <span class="reel-username">@${v.username}</span>
                        ${v.is_verified ? `<i class="bi bi-patch-check-fill" style="color:var(--accent-secondary);font-size:14px;"></i>` : ''}
                        ${v.is_blink_moment ? `<span style="background:var(--accent-primary);font-size:10px;padding:2px 6px;border-radius:4px;font-weight:800;margin-left:8px;">MOMENT</span>` : ''}
                    </div>
                    ${v.caption ? `<p class="reel-caption">${v.caption}</p>` : ''}
                    <div class="reel-music" style="display:flex;align-items:center;gap:8px;margin-top:10px;font-size:13px;opacity:0.8;">
                        <i class="bi bi-music-note-beamed"></i>
                        <marquee scrollamount="3" style="width:150px;">Original Sound · @${v.username} · Blink Original</marquee>
                    </div>
                </div>

                <div class="tap-to-pause" style="position:absolute;top:0;left:0;right:0;bottom:100px;z-index:2;"></div>
            `;

            // Change feedContainer to reelsContainer if that's what was used in index.html
            const container = document.getElementById('reelsContainer') || document.getElementById('feedContainer');
            if (container) container.appendChild(reel);
            attachReelEvents(reel, v);
        });

        observeVideos();
    }
ame}</span>
                            ${v.is_verified ? `<i class="bi bi-patch-check-fill verified-icon"></i>` : ''}
                        </div>
                        ${v.caption ? `<p class="reel-caption">${v.caption}</p>` : ''}
                        ${v.hashtags ? `<p class="reel-hashtags">${v.hashtags}</p>` : ''}
                        <div class="reel-music">
                            <i class="bi bi-music-note-beamed"></i>
                            <span>Original Sound · @${v.username}</span>
                        </div>
                    </div>
                </div>

                <div class="tap-to-pause"></div>
                <div class="play-indicator" style="display:none">⏸</div>
            `;

            feed.appendChild(reel);
            attachReelEvents(reel, v);
        });

        observeVideos();
    }

    function attachReelEvents(reel, v) {
        const video       = reel.querySelector('.reel-video');
        const likeBtn     = reel.querySelector('.like-btn');
        const shareBtn    = reel.querySelector('.share-btn');
        const tapOverlay  = reel.querySelector('.tap-to-pause');
        const playInd     = reel.querySelector('.play-indicator');

        // Like/Unlike
        likeBtn.onclick = async () => {
            const isLiked = likeBtn.dataset.liked === 'true';
            const icon    = likeBtn.querySelector('i');
            const count   = likeBtn.querySelector('.action-count');

            // Optimistic UI
            likeBtn.dataset.liked = String(!isLiked);
            icon.className = isLiked ? 'bi bi-heart' : 'bi bi-heart-fill';
            likeBtn.classList.toggle('liked', !isLiked);

            try {
                const res = await apiRequest(`/videos/toggle-like/${v.id}`, { method: 'POST' });
                count.textContent = res.likes;
            } catch {
                // Revert on failure
                likeBtn.dataset.liked = String(isLiked);
                icon.className = isLiked ? 'bi bi-heart-fill' : 'bi bi-heart';
                likeBtn.classList.toggle('liked', isLiked);
            }
        };

        // Share
        shareBtn.onclick = async () => {
            try {
                if (navigator.share) {
                    await navigator.share({ title: `@${v.username} on Blink`, url: v.video_url });
                } else {
                    await navigator.clipboard.writeText(v.video_url);
                    showToast('🔗 Link copied!', 'success');
                }
            } catch {}
        };

        // Tap to play/pause
        tapOverlay.onclick = () => {
            if (video.paused) {
                video.play().catch(() => {});
                playInd.textContent = '⏸';
            } else {
                video.pause();
                playInd.textContent = '▶';
            }
            playInd.style.display = 'block';
            setTimeout(() => { playInd.style.display = 'none'; }, 900);
        };

        // Track view
        video.addEventListener('play', () => {
            if (!reel.dataset.viewed) {
                reel.dataset.viewed = '1';
                apiRequest(`/videos/${v.id}/view`, { method: 'POST' }).catch(() => {});
            }
        }, { once: true });
    }

    // ══════════════════════════════════════════════════════════════
    // 3. VIDEO AUTOPLAY (Intersection Observer)
    // ══════════════════════════════════════════════════════════════
    let videoObserver = null;

    function observeVideos() {
        if (!videoObserver) {
            videoObserver = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    const video = entry.target;
                    if (entry.isIntersecting) {
                        video.play().catch(() => {});
                    } else {
                        video.pause();
                        video.currentTime = 0;
                    }
                });
            }, { threshold: 0.7 });
        }

        document.querySelectorAll('.reel-video').forEach(v => {
            if (!v.dataset.observed) {
                videoObserver.observe(v);
                v.dataset.observed = '1';
            }
        });
    }

    // ══════════════════════════════════════════════════════════════
    // 4. INFINITE SCROLL
    // ══════════════════════════════════════════════════════════════
    const sentinelObs = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) {
            loadReels();
        }
    }, { threshold: 0.1 });

    function setupSentinel() {
        const sentinel = document.createElement('div');
        sentinel.className = 'scroll-sentinel';
        sentinel.style.cssText = 'height:1px;width:100%;';
        feed.appendChild(sentinel);
        sentinelObs.observe(sentinel);
    }

    // Fallback scroll listener
    window.addEventListener('scroll', () => {
        if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 600) {
            if (hasMore && !loading) loadReels();
        }
    }, { passive: true });

    // ══════════════════════════════════════════════════════════════
    // INITIALIZE
    // ══════════════════════════════════════════════════════════════
    await Promise.allSettled([loadStories(), loadReels()]);
    setupSentinel();
});
