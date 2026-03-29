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
            // Show demo video on first load failure
            if (page === 0) renderFallback();
        } finally {
            loading = false;
            if (loader) loader.classList.add('hidden');
        }
    }

    function renderFallback() {
        renderReels([{
            id: 9999,
            video_url: 'https://www.w3schools.com/html/mov_bbb.mp4',
            username: 'blink_demo',
            caption: 'Welcome to Blink! Upload videos to see them here. 🎬',
            likes_count: 0,
            comments_count: 0,
            liked_by_me: false,
            likes_formatted: '0',
            avatar: null
        }]);
    }

    function renderReels(videos) {
        videos.forEach(v => {
            const reel = document.createElement('div');
            reel.className = 'reel-card';
            reel.dataset.id = v.id;

            const avatarHtml = v.avatar
                ? `<img src="${v.avatar}" alt="@${v.username}" class="reel-avatar-img" loading="lazy">`
                : `<div class="reel-avatar-letter">${(v.username || 'U')[0].toUpperCase()}</div>`;

            reel.innerHTML = `
                <video src="${v.video_url}" loop muted playsinline class="reel-video" preload="metadata"></video>
                
                <div class="reel-overlay">
                    <div class="reel-top">
                        ${v.is_blink_moment ? `<div class="blink-badge">⚡ Blink Moment</div>` : ''}
                    </div>

                    <div class="reel-side-actions">
                        <div class="reel-avatar" onclick="window.location.href='profile.html?id=${v.user_id}'">
                            ${avatarHtml}
                            <div class="follow-plus">+</div>
                        </div>

                        <button class="action-btn like-btn ${v.liked_by_me ? 'liked' : ''}" data-id="${v.id}" data-liked="${v.liked_by_me}">
                            <i class="bi ${v.liked_by_me ? 'bi-heart-fill' : 'bi-heart'}"></i>
                            <span class="action-count">${v.likes_formatted || v.likes_count || 0}</span>
                        </button>

                        <button class="action-btn comment-btn" data-id="${v.id}">
                            <i class="bi bi-chat-dots-fill"></i>
                            <span class="action-count">${v.comments_count || 0}</span>
                        </button>

                        <button class="action-btn share-btn">
                            <i class="bi bi-send-fill"></i>
                            <span class="action-count">Share</span>
                        </button>
                    </div>

                    <div class="reel-info">
                        <div class="reel-user" onclick="window.location.href='profile.html?id=${v.user_id}'">
                            <span class="reel-username">@${v.username}</span>
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
