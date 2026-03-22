/* feed.js – Production-Grade Cross-Device Reels Engine
 * ════════════════════════════════════════════════════════════
 * Supports: Mobile (iOS/Android), Tablet, Desktop (Chrome/Safari/Edge)
 *
 * Features:
 * ✅ Autoplay with Safari/iOS fallback (muted + playsinline)
 * ✅ Scroll-snap reels (one video per screen)
 * ✅ Touch swipe + mouse scroll + keyboard navigation
 * ✅ IntersectionObserver lazy loading + preload next 2
 * ✅ Double-tap to like with heart animation
 * ✅ Network-adaptive quality detection
 * ✅ Page visibility API (pause on tab switch)
 * ✅ Autoplay failure fallback (play button overlay)
 * ✅ Safe area support (iPhone notch)
 * ✅ Error recovery (skip broken videos)
 */

document.addEventListener('DOMContentLoaded', async () => {
    const { getToken, getUser, requireAuth, apiRequest, showToast, populateSidebar } = window.Blink;

    if (!requireAuth()) return;
    await populateSidebar();

    // ══════════════════════════════════════════════════════════════
    // ── Device & Environment Detection ────────────────────────────
    // ══════════════════════════════════════════════════════════════
    const UA = navigator.userAgent.toLowerCase();
    const IS_IOS     = /iphone|ipad|ipod/.test(UA) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const IS_ANDROID = /android/.test(UA);
    const IS_SAFARI  = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    const IS_MOBILE  = IS_IOS || IS_ANDROID || window.matchMedia('(max-width: 960px)').matches;
    const IS_TOUCH   = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    console.log(`[Feed] Device: ${IS_IOS ? 'iOS' : IS_ANDROID ? 'Android' : 'Desktop'} | Touch: ${IS_TOUCH} | Safari: ${IS_SAFARI}`);

    // ══════════════════════════════════════════════════════════════
    // ── Network Quality Detection ─────────────────────────────────
    // ══════════════════════════════════════════════════════════════
    let networkQuality = 'high'; // 'high' | 'medium' | 'low'

    function detectNetworkQuality() {
        const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        if (!conn) return 'high';

        const effectiveType = conn.effectiveType; // '4g', '3g', '2g', 'slow-2g'
        const downlink = conn.downlink; // Mbps

        if (effectiveType === '4g' && downlink > 5) return 'high';
        if (effectiveType === '4g' || effectiveType === '3g') return 'medium';
        return 'low';
    }

    networkQuality = detectNetworkQuality();
    console.log(`[Feed] Network quality: ${networkQuality}`);

    // Listen for network changes
    if (navigator.connection) {
        navigator.connection.addEventListener('change', () => {
            const newQuality = detectNetworkQuality();
            if (newQuality !== networkQuality) {
                networkQuality = newQuality;
                console.log(`[Feed] Network changed: ${networkQuality}`);
                updateNetworkBadge();
            }
        });
    }

    function updateNetworkBadge() {
        let badge = document.getElementById('networkBadge');
        if (!badge) {
            badge = document.createElement('div');
            badge.id = 'networkBadge';
            badge.className = 'network-badge';
            document.body.appendChild(badge);
        }
        if (networkQuality === 'low') {
            badge.className = 'network-badge show slow';
            badge.innerHTML = '<i class="bi bi-wifi-off"></i> Slow connection';
            setTimeout(() => badge.classList.remove('show'), 5000);
        } else if (networkQuality === 'medium') {
            badge.className = 'network-badge show';
            badge.innerHTML = '<i class="bi bi-wifi-1"></i> Limited bandwidth';
            setTimeout(() => badge.classList.remove('show'), 3000);
        } else {
            badge.classList.remove('show');
        }
    }
    updateNetworkBadge();

    // ══════════════════════════════════════════════════════════════
    // ── State ─────────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════
    const feedEl      = document.getElementById('feedContainer');
    const moodBar     = document.getElementById('moodSelector');
    let currentMood   = 'General';
    let isLoading     = false;
    let seenIds       = new Set();
    let cycleCount    = 0;
    const MAX_CYCLES  = 1;
    let videoObs      = null;
    let currentUser   = getUser();
    let currentlyPlaying = null;
    let isMuted       = true; // Start muted (required for autoplay)
    let userHasInteracted = false; // Track first user interaction

    // ── Track first user interaction (needed for unmuting) ────────
    function onFirstInteraction() {
        if (userHasInteracted) return;
        userHasInteracted = true;
        document.removeEventListener('touchstart', onFirstInteraction);
        document.removeEventListener('click', onFirstInteraction);
        console.log('[Feed] User interaction detected — unmuting enabled');
    }
    document.addEventListener('touchstart', onFirstInteraction, { once: true, passive: true });
    document.addEventListener('click', onFirstInteraction, { once: true });

    // ══════════════════════════════════════════════════════════════
    // ── TikTok Live Discovery Bar ────────────────────────────────
    // ══════════════════════════════════════════════════════════════
    async function loadLiveBar() {
        const bar  = document.getElementById('liveDiscoveryBar');
        const list = document.getElementById('liveBarList');
        if (!bar || !list) return;
        try {
            const data    = await apiRequest('/live/now');
            const streams = data.streams || [];
            if (streams.length > 0) {
                bar.style.display = 'block';
                list.innerHTML = streams.map(s => `
                    <div class="live-story-card"
                         onclick="window.location.href='/pages/live.html?id=${s.stream_id}'"
                         style="display:flex;flex-direction:column;align-items:center;cursor:pointer;min-width:82px;position:relative;transition:transform 0.2s ease;">
                        <div style="position:relative;width:68px;height:68px;border-radius:50%;padding:3px;
                             background:linear-gradient(45deg,#f09433 0%,#e6683c 25%,#dc2743 50%,#cc2366 75%,#bc1888 100%);box-shadow:0 4px 12px rgba(220,39,67,0.3);">
                            <img src="${s.profile_picture || `https://i.pravatar.cc/100?u=${s.user_id}`}"
                                 style="width:100%;height:100%;border-radius:50%;object-fit:cover;border:3px solid #000;display:block;"
                                 onerror="this.src='/favicon.png'">
                            <div style="position:absolute;bottom:-2px;left:50%;transform:translateX(-50%);
                                 background:var(--pink);color:#fff;font-size:9px;font-weight:900;padding:1px 6px;
                                 border-radius:6px;border:2px solid #000;text-transform:uppercase;letter-spacing:0.5px;box-shadow:0 2px 4px rgba(0,0,0,0.3);">LIVE</div>
                        </div>
                        <span style="font-size:11px;margin-top:10px;color:#fff;font-weight:600;max-width:70px;
                              overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-shadow:0 1px 2px rgba(0,0,0,0.5);">@${s.username}</span>
                    </div>
                `).join('');
            } else {
                bar.style.display = 'none';
            }
        } catch (e) { console.warn('[LiveBar]', e); }
    }
    loadLiveBar();
    if (window.Blink.socket) window.Blink.socket.on('live_discovery_update', loadLiveBar);
    setInterval(loadLiveBar, 15000);

    // ══════════════════════════════════════════════════════════════
    // ── Format numbers ────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════
    function fmt(n) {
        const v = parseInt(n) || 0;
        if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M';
        if (v >= 1_000)     return (v / 1_000).toFixed(1) + 'K';
        return String(v);
    }

    // ══════════════════════════════════════════════════════════════
    // ── Fetch videos from API ─────────────────────────────────────
    // ══════════════════════════════════════════════════════════════
    async function fetchVideos(mood, limit = 10) {
        const exclude  = [...seenIds].join(',');
        const moodQ    = mood && mood !== 'General' ? `&mood=${encodeURIComponent(mood)}` : '';
        const cycledQ  = cycleCount > 0 ? '&cycled=1' : '';
        const headers  = {};
        if (getToken()) headers['Authorization'] = `Bearer ${getToken()}`;
        const res  = await fetch(`/api/videos?limit=${limit}${moodQ}&exclude=${exclude}${cycledQ}`, { headers });
        const data = await res.json();
        return data.videos || [];
    }

    // ══════════════════════════════════════════════════════════════
    // ── Build Video Card ──────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════
    function buildCard(v) {
        const post = document.createElement('div');
        post.className  = 'video-post';
        post.dataset.id = v.id;

        const avatarSrc = v.profile_picture || `https://i.pravatar.cc/100?u=blink_${v.user_id}`;
        const username  = v.username || 'blink_user';
        const isOwnPost = currentUser && currentUser.id === v.user_id;

        // Build video URL
        let videoSrc = v.video_url || '';
        if (videoSrc && !videoSrc.startsWith('http') && !videoSrc.startsWith('blob:')) {
            if (!videoSrc.startsWith('/')) videoSrc = '/' + videoSrc;
        }

        post.innerHTML = `
            ${v.is_blink_moment ? `<div class="blink-badge"><i class="bi bi-lightning-charge-fill"></i> Blink Moment <span style="opacity:.7;font-size:10px">24h left</span></div>` : ''}
            <video class="video-player"
                   data-src="${videoSrc}"
                   data-id="${v.id}"
                   playsinline
                   webkit-playsinline
                   x-webkit-airplay="allow"
                   muted
                   loop
                   preload="none"
                   crossorigin="anonymous"
                   disablepictureinpicture
                   disableremoteplayback
            ></video>
            <div class="video-shimmer"><div class="shimmer-bar"></div><div class="shimmer-bar short"></div></div>
            <div class="video-info">
                <div class="user-info" onclick="window.location.href='/pages/profile.html?id=${v.user_id}'">
                    <img src="${avatarSrc}" class="profile-pic" alt="@${username}" loading="lazy" onerror="this.style.display='none'">
                    <span class="username">@${username}</span>
                    <span class="verified-badge"><i class="bi bi-patch-check-fill"></i></span>
                    ${v.mood_category ? `<span class="mood-tag">${v.mood_category}</span>` : ''}
                </div>
                <p class="video-caption">${v.caption || ''}</p>
                <div class="video-music"><div class="music-disc"><i class="bi bi-music-note-beamed"></i></div><span>Original Sound · ${username}</span></div>
            </div>
            <div class="video-actions">
                <div class="creator-avatar-wrap">
                    <div class="creator-avatar" onclick="window.location.href='/pages/profile.html?id=${v.user_id}'">
                        <img src="${avatarSrc}" alt="@${username}" loading="lazy" onerror="this.parentElement.textContent='${username[0].toUpperCase()}'">
                    </div>
                    ${!isOwnPost ? `<button class="follow-quick-btn" data-uid="${v.user_id}" title="Follow @${username}"><i class="bi bi-plus-lg"></i></button>` : ''}
                </div>
                <button class="action-btn like ${v.liked_by_me ? 'active' : ''}" data-id="${v.id}" data-count="${v.likes_count || 0}">
                    <div class="action-icon"><i class="bi bi-heart-fill"></i></div><span class="action-text">${fmt(v.likes_count)}</span>
                </button>
                <button class="action-btn comment" data-id="${v.id}">
                    <div class="action-icon"><i class="bi bi-chat-left-text-fill"></i></div><span class="action-text">${fmt(v.comments_count)}</span>
                </button>
                <button class="action-btn share" data-id="${v.id}">
                    <div class="action-icon"><i class="bi bi-share-fill"></i></div><span class="action-text">Share</span>
                </button>
                ${isOwnPost ? `<button class="action-btn delete" data-id="${v.id}"><div class="action-icon"><i class="bi bi-trash3-fill"></i></div><span class="action-text">Delete</span></button>` : ''}
            </div>
            <div class="tap-overlay"></div>
        `;

        // ── Like ───────────────────────────────
        const likeBtn = post.querySelector('.like');
        likeBtn.addEventListener('click', async () => {
            if (!getToken()) { showToast('Sign in to like videos'); return; }
            const wasLiked = likeBtn.classList.contains('active');
            likeBtn.classList.toggle('active');
            const span  = likeBtn.querySelector('.action-text');
            let count   = parseInt(likeBtn.dataset.count) || 0;
            const newCount = wasLiked ? Math.max(0, count - 1) : count + 1;
            span.textContent = fmt(newCount);
            if (!wasLiked) {
                const burst = document.createElement('div');
                burst.className = 'like-burst';
                burst.innerHTML = '<i class="bi bi-heart-fill"></i>';
                post.appendChild(burst);
                setTimeout(() => burst.remove(), 800);
            }
            try {
                const r = await apiRequest(`/videos/${v.id}/like`, { method: 'POST' });
                likeBtn.dataset.count = r.likes_count;
                span.textContent = fmt(r.likes_count);
            } catch {
                likeBtn.classList.toggle('active');
                span.textContent = fmt(count);
            }
        });

        // ── Comment ────────────────────────────
        post.querySelector('.comment').addEventListener('click', () => openCommentModal(v.id));

        // ── Share ──────────────────────────────
        post.querySelector('.share').addEventListener('click', async () => {
            const url = `${window.location.origin}/pages/index.html`;
            try {
                if (navigator.share) await navigator.share({ title: 'Blink Video', url });
                else { await navigator.clipboard.writeText(url); showToast('Link copied!'); }
                fetch(`/api/videos/${v.id}/share`, { method: 'POST' }).catch(() => {});
            } catch {}
        });

        // ── Follow ─────────────────────────────
        const followBtn = post.querySelector('.follow-quick-btn');
        followBtn?.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (!getToken()) { showToast('Sign in to follow users'); return; }
            const uid = followBtn.dataset.uid;
            const following = followBtn.classList.contains('following');
            try {
                if (following) {
                    await apiRequest(`/follow/${uid}`, { method: 'DELETE' });
                    followBtn.classList.remove('following');
                    followBtn.innerHTML = '<i class="bi bi-plus-lg"></i>';
                    showToast(`Unfollowed @${username}`);
                } else {
                    await apiRequest(`/follow/${uid}`, { method: 'POST' });
                    followBtn.classList.add('following');
                    followBtn.innerHTML = '<i class="bi bi-check-lg"></i>';
                    showToast(`Following @${username}`);
                }
            } catch (err) { showToast(err.message, 'error'); }
        });

        // ── Delete ─────────────────────────────
        post.querySelector('.delete')?.addEventListener('click', async () => {
            if (!confirm('Delete this video?')) return;
            try {
                await apiRequest(`/videos/${v.id}`, { method: 'DELETE' });
                post.remove();
                showToast('Video deleted');
            } catch (err) { showToast(err.message, 'error'); }
        });

        // ── Tap to Play/Pause (Touch + Click) ──
        const tapZone = post.querySelector('.tap-overlay');
        let tapTimeout = null;
        let lastTapTime = 0;

        function handleTap(e) {
            const now = Date.now();
            const vid = post.querySelector('.video-player');
            if (!vid) return;

            // ── Double tap detection ──
            if (now - lastTapTime < 300) {
                clearTimeout(tapTimeout);
                tapTimeout = null;
                lastTapTime = 0;
                // Like
                if (!likeBtn.classList.contains('active')) likeBtn.click();
                // Heart at tap position
                const rect = post.getBoundingClientRect();
                const x = (e.clientX || e.touches?.[0]?.clientX || rect.width/2) - rect.left;
                const y = (e.clientY || e.touches?.[0]?.clientY || rect.height/2) - rect.top;
                const heart = document.createElement('div');
                heart.className = 'double-tap-heart';
                heart.innerHTML = '<i class="bi bi-heart-fill"></i>';
                heart.style.left = x + 'px';
                heart.style.top  = y + 'px';
                post.appendChild(heart);
                setTimeout(() => heart.remove(), 800);
                return;
            }

            lastTapTime = now;
            tapTimeout = setTimeout(() => {
                tapTimeout = null;
                lastTapTime = 0;

                // If source not loaded, load it
                if (!vid.src && vid.dataset.src) {
                    vid.src = vid.dataset.src;
                    vid.load();
                    vid.play().catch(() => {});
                    return;
                }

                // Remove autoplay fallback if present
                const fallback = post.querySelector('.autoplay-fallback');
                if (fallback) fallback.remove();

                // Toggle play/pause
                if (vid.paused) {
                    vid.play().catch(() => {});
                    post.classList.remove('paused');
                } else {
                    vid.pause();
                    post.classList.add('paused');
                }

                // Show indicator
                const icon = document.createElement('div');
                icon.className = 'play-indicator';
                icon.innerHTML = vid.paused
                    ? '<i class="bi bi-play-fill"></i>'
                    : '<i class="bi bi-pause-fill"></i>';
                post.appendChild(icon);
                setTimeout(() => icon.classList.add('fade-out'), 300);
                setTimeout(() => icon.remove(), 600);
            }, 250);
        }

        // Bind both touch and click for cross-device
        if (IS_TOUCH) {
            tapZone.addEventListener('touchend', (e) => {
                e.preventDefault();
                handleTap(e);
            }, { passive: false });
        } else {
            tapZone.addEventListener('click', handleTap);
        }

        // ── Video Error Recovery ───────────────
        const vid = post.querySelector('.video-player');
        vid.addEventListener('error', () => {
            console.warn(`[Feed] Video ${v.id} failed to load — skipping`);
            hideShimmer(post.querySelector('.video-shimmer'));
            // Show error state
            const errEl = document.createElement('div');
            errEl.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:6;color:rgba(255,255,255,0.5);gap:8px;';
            errEl.innerHTML = '<i class="bi bi-exclamation-circle" style="font-size:36px;"></i><span style="font-size:13px;">Video unavailable</span>';
            post.appendChild(errEl);
        });

        // ── Stall / Buffering recovery ─────────
        let stallTimer = null;
        vid.addEventListener('stalled', () => {
            stallTimer = setTimeout(() => {
                console.warn(`[Feed] Video ${v.id} stalled — attempting reload`);
                const time = vid.currentTime;
                vid.load();
                vid.currentTime = time;
                vid.play().catch(() => {});
            }, 5000);
        });
        vid.addEventListener('playing', () => { if (stallTimer) clearTimeout(stallTimer); });

        return post;
    }

    // ══════════════════════════════════════════════════════════════
    // ── Video Observer (Autoplay / Lazy Load / Preload) ───────────
    // ══════════════════════════════════════════════════════════════
    function hideShimmer(shim) {
        if (!shim || shim.classList.contains('hidden')) return;
        shim.classList.add('hidden');
        setTimeout(() => shim.remove(), 400);
    }

    function playVideo(vid, post) {
        vid.muted = isMuted;
        const p = vid.play();
        if (p !== undefined) {
            p.then(() => {
                currentlyPlaying = vid;
                post.classList.remove('paused');
                // Remove any autoplay fallback
                const fb = post.querySelector('.autoplay-fallback');
                if (fb) fb.remove();
            }).catch((err) => {
                console.warn(`[Feed] Autoplay blocked: ${err.message}`);
                // Show play button fallback (Safari/iOS often needs this)
                if (!post.querySelector('.autoplay-fallback')) {
                    const btn = document.createElement('div');
                    btn.className = 'autoplay-fallback';
                    btn.innerHTML = '<i class="bi bi-play-fill"></i>';
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        vid.muted = true; // Must be muted for first play
                        vid.play().then(() => {
                            currentlyPlaying = vid;
                            post.classList.remove('paused');
                            btn.remove();
                        }).catch(() => {});
                    });
                    // Also respond to touch
                    btn.addEventListener('touchend', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        vid.muted = true;
                        vid.play().then(() => {
                            currentlyPlaying = vid;
                            post.classList.remove('paused');
                            btn.remove();
                        }).catch(() => {});
                    }, { passive: false });
                    post.appendChild(btn);
                }
            });
        }
    }

    function setupVideoObs(cards) {
        if (!videoObs) {
            videoObs = new IntersectionObserver(entries => {
                entries.forEach(en => {
                    const post = en.target;
                    const vid  = post.querySelector('.video-player');
                    const shim = post.querySelector('.video-shimmer');

                    if (en.isIntersecting && en.intersectionRatio >= 0.5) {
                        // ── Load source (lazy) ───────────
                        if (vid.dataset.src && !vid.src) {
                            vid.src = vid.dataset.src;
                            // Set preload based on network quality
                            vid.preload = networkQuality === 'low' ? 'metadata' : 'auto';
                            vid.load();
                            const onReady = () => hideShimmer(shim);
                            vid.addEventListener('canplay', onReady, { once: true });
                            vid.addEventListener('loadeddata', onReady, { once: true });
                            setTimeout(() => hideShimmer(shim), 3000);
                        } else {
                            hideShimmer(shim);
                        }

                        // ── Pause previous video ─────────
                        if (currentlyPlaying && currentlyPlaying !== vid) {
                            currentlyPlaying.pause();
                            currentlyPlaying.currentTime = 0;
                            const prevPost = currentlyPlaying.closest('.video-post');
                            if (prevPost) prevPost.classList.add('paused');
                        }

                        // ── Play this video ──────────────
                        playVideo(vid, post);

                        // ── Preload next videos ──────────
                        const preloadCount = networkQuality === 'low' ? 1 : 2;
                        let nextEl = post.nextElementSibling;
                        for (let i = 0; i < preloadCount && nextEl; i++) {
                            const nextVid = nextEl.querySelector?.('.video-player');
                            if (nextVid?.dataset.src && !nextVid.src) {
                                nextVid.src = nextVid.dataset.src;
                                nextVid.preload = networkQuality === 'low' ? 'metadata' : 'auto';
                                nextVid.load();
                            }
                            nextEl = nextEl.nextElementSibling;
                        }

                    } else if (!en.isIntersecting || en.intersectionRatio < 0.2) {
                        // ── Out of view: pause ───────────
                        vid.pause();
                        if (en.intersectionRatio < 0.1) vid.currentTime = 0;
                        if (currentlyPlaying === vid) {
                            currentlyPlaying = null;
                            post.classList.add('paused');
                        }
                    }
                });
            }, {
                root: feedEl,
                threshold: [0.0, 0.2, 0.5, 0.75, 1.0]
            });
        }
        cards.forEach(c => videoObs.observe(c));
    }

    // ── Append videos to feed ─────────────────────────────────────
    function appendVideos(videos) {
        const newCards = [];
        videos.forEach(v => {
            if (!seenIds.has(v.id)) {
                seenIds.add(v.id);
                const card = buildCard(v);
                feedEl.appendChild(card);
                newCards.push(card);
            }
        });

        if (newCards.length === 0 && videos.length > 0 && !isLoading) {
            loadMore();
        }

        setupVideoObs(newCards);
    }

    // ── Load More ─────────────────────────────────────────────────
    async function loadMore() {
        if (isLoading) return;
        isLoading = true;
        try {
            let videos = await fetchVideos(currentMood, 10);
            if (!videos.length && cycleCount < MAX_CYCLES) {
                cycleCount++;
                seenIds.clear();
                videos = await fetchVideos(currentMood, 10);
            }
            if (!videos.length) {
                if (!feedEl.querySelector('.feed-end-msg')) {
                    const endMsg = document.createElement('div');
                    endMsg.className = 'feed-end-msg';
                    endMsg.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;height:100dvh;gap:16px;color:var(--text-muted);scroll-snap-align:start;';
                    endMsg.innerHTML = `
                        <i class="bi bi-check-circle-fill" style="font-size:48px;color:var(--green);"></i>
                        <h3 style="font-size:20px;font-weight:700;color:var(--text-primary);">You're all caught up!</h3>
                        <p style="font-size:14px;max-width:280px;text-align:center;line-height:1.6;">You've seen all videos${currentMood !== 'General' ? ` in ${currentMood}` : ''}. Check back later for more!</p>
                        <button onclick="window.location.reload()" style="background:var(--grad-brand);color:#fff;border:none;padding:10px 24px;border-radius:20px;font-weight:600;cursor:pointer;">Refresh Feed</button>
                    `;
                    feedEl.appendChild(endMsg);
                }
            } else {
                appendVideos(videos);
            }
        } catch (err) {
            console.error('[Feed]', err.message);
            showToast('Failed to load videos', 'error');
        } finally {
            isLoading = false;
            const spinner = document.getElementById('feedSpinner');
            if (spinner) spinner.style.display = 'none';
            if (scroll) scroll.refresh();
        }
    }

    // ══════════════════════════════════════════════════════════════
    // ── Infinite Scroll ───────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════
    let scroll = null;
    function initScroll() {
        if (scroll) scroll.destroy();
        scroll = new InfiniteScroll(feedEl, { onMore: loadMore, threshold: 0.1 });
    }

    // ══════════════════════════════════════════════════════════════
    // ── Mood Selector ─────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════
    moodBar?.addEventListener('click', async e => {
        const pill = e.target.closest('.mood-pill');
        if (!pill) return;
        moodBar.querySelector('.active')?.classList.remove('active');
        pill.classList.add('active');
        currentMood = pill.dataset.mood || 'General';

        feedEl.querySelectorAll('.video-player').forEach(v => { v.pause(); v.removeAttribute('src'); v.load(); });
        currentlyPlaying = null;

        feedEl.innerHTML = '';
        seenIds.clear();
        cycleCount = 0;
        isLoading  = false;
        if (videoObs) { videoObs.disconnect(); videoObs = null; }

        feedEl.innerHTML = '<div id="feedSpinner" style="display:flex;align-items:center;justify-content:center;height:100vh;height:100dvh;"><div class="spinner"></div></div>';

        await loadMore();
        initScroll();
    });

    // ══════════════════════════════════════════════════════════════
    // ── Mute/Unmute Toggle ────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════
    function createMuteIndicator() {
        let muteBtn = document.getElementById('muteIndicator');
        if (muteBtn) return muteBtn;

        muteBtn = document.createElement('div');
        muteBtn.id = 'muteIndicator';
        muteBtn.className = 'mute-indicator';
        muteBtn.innerHTML = '<i class="bi bi-volume-mute-fill"></i> Muted';

        const handleUnmute = (e) => {
            e.stopPropagation();
            e.preventDefault();
            isMuted = !isMuted;
            if (currentlyPlaying) currentlyPlaying.muted = isMuted;
            muteBtn.innerHTML = isMuted
                ? '<i class="bi bi-volume-mute-fill"></i> Muted'
                : '<i class="bi bi-volume-up-fill"></i> Sound On';
        };

        muteBtn.addEventListener('click', handleUnmute);
        muteBtn.addEventListener('touchend', handleUnmute, { passive: false });

        // Append to the main content area
        const mainContent = document.querySelector('.main-content');
        if (mainContent) {
            muteBtn.style.position = 'absolute';
            mainContent.style.position = 'relative';
            mainContent.appendChild(muteBtn);
        } else {
            muteBtn.style.position = 'fixed';
            document.body.appendChild(muteBtn);
        }

        return muteBtn;
    }

    // ══════════════════════════════════════════════════════════════
    // ── Comment Modal ─────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════
    const commentModal   = document.getElementById('commentModal');
    const commentList    = document.getElementById('commentList');
    const commentInput   = document.getElementById('commentInput');
    const commentSendBtn = document.getElementById('commentSendBtn');
    let activeVideoId    = null;

    async function openCommentModal(videoId) {
        activeVideoId = videoId;
        commentList.innerHTML = '<div class="comment-empty"><div class="spinner"></div></div>';
        commentModal.classList.add('open');
        // Pause video while modal is open
        if (currentlyPlaying) currentlyPlaying.pause();
        try {
            const data = await apiRequest(`/comments/${videoId}`);
            renderComments(data.comments);
        } catch { commentList.innerHTML = '<p class="comment-empty">Failed to load comments</p>'; }
    }

    function renderComments(comments) {
        if (!comments.length) {
            commentList.innerHTML = '<div class="comment-empty"><i class="bi bi-chat-dots-fill" style="font-size:32px;display:block;margin-bottom:8px;"></i>No comments yet. Be first!</div>';
            return;
        }
        commentList.innerHTML = comments.map(c => {
            const av = c.profile_picture
                ? `<img class="comment-avatar" src="${c.profile_picture}" alt="">`
                : `<div class="comment-avatar">${(c.username || 'U')[0].toUpperCase()}</div>`;
            const d    = new Date(c.created_at);
            const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            return `<div class="comment-item">${av}<div class="comment-body"><div class="comment-username">@${c.username}</div><div class="comment-text">${c.comment_text}</div><div class="comment-time">${time}</div></div></div>`;
        }).join('');
    }

    commentSendBtn?.addEventListener('click', async () => {
        const text = commentInput?.value.trim();
        if (!text || !activeVideoId) return;
        if (!getToken()) { showToast('Sign in to comment'); return; }
        commentInput.value = '';
        try {
            await apiRequest(`/comments/${activeVideoId}`, {
                method: 'POST',
                body: JSON.stringify({ comment_text: text })
            });
            const card    = feedEl.querySelector(`[data-id="${activeVideoId}"]`);
            const countEl = card?.querySelector('.comment .action-text');
            const cur     = parseInt(countEl?.textContent) || 0;
            if (countEl) countEl.textContent = fmt(cur + 1);
            const refreshed = await apiRequest(`/comments/${activeVideoId}`);
            renderComments(refreshed.comments);
        } catch (err) { showToast(err.message, 'error'); }
    });

    commentInput?.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commentSendBtn.click(); }
    });

    document.getElementById('closeCommentModal')?.addEventListener('click', () => {
        commentModal?.classList.remove('open');
        // Resume video when modal closes
        if (currentlyPlaying) currentlyPlaying.play().catch(() => {});
    });
    commentModal?.addEventListener('click', e => {
        if (e.target === commentModal) {
            commentModal.classList.remove('open');
            if (currentlyPlaying) currentlyPlaying.play().catch(() => {});
        }
    });

    // ══════════════════════════════════════════════════════════════
    // ── Keyboard Navigation (Desktop) ─────────────────────────────
    // ══════════════════════════════════════════════════════════════
    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        const posts = feedEl.querySelectorAll('.video-post');
        if (!posts.length) return;

        // Find currently visible post
        let currentIdx = 0;
        posts.forEach((p, i) => {
            const rect     = p.getBoundingClientRect();
            const feedRect = feedEl.getBoundingClientRect();
            if (rect.top >= feedRect.top && rect.top < feedRect.top + feedRect.height / 2) {
                currentIdx = i;
            }
        });

        switch (e.key) {
            case 'ArrowDown': case 'j':
                e.preventDefault();
                posts[currentIdx + 1]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                break;
            case 'ArrowUp': case 'k':
                e.preventDefault();
                posts[Math.max(0, currentIdx - 1)]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                break;
            case ' ':
                e.preventDefault();
                if (currentlyPlaying) {
                    if (currentlyPlaying.paused) {
                        currentlyPlaying.play().catch(() => {});
                        currentlyPlaying.closest('.video-post')?.classList.remove('paused');
                    } else {
                        currentlyPlaying.pause();
                        currentlyPlaying.closest('.video-post')?.classList.add('paused');
                    }
                }
                break;
            case 'm':
                isMuted = !isMuted;
                if (currentlyPlaying) currentlyPlaying.muted = isMuted;
                const muteBtn = document.getElementById('muteIndicator');
                if (muteBtn) {
                    muteBtn.innerHTML = isMuted
                        ? '<i class="bi bi-volume-mute-fill"></i> Muted'
                        : '<i class="bi bi-volume-up-fill"></i> Sound On';
                }
                break;
            case 'l':
                const currentPost = posts[currentIdx];
                if (currentPost) currentPost.querySelector('.like')?.click();
                break;
        }
    });

    // ══════════════════════════════════════════════════════════════
    // ── Page Visibility (Pause on tab switch) ─────────────────────
    // ══════════════════════════════════════════════════════════════
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            if (currentlyPlaying) currentlyPlaying.pause();
        } else {
            if (currentlyPlaying && !currentlyPlaying.closest('.video-post')?.classList.contains('paused')) {
                currentlyPlaying.play().catch(() => {});
            }
        }
    });

    // ══════════════════════════════════════════════════════════════
    // ── iOS Safari: Fix viewport height on address bar show/hide ──
    // ══════════════════════════════════════════════════════════════
    if (IS_IOS) {
        let resizeTimer;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                // Force feed to recalculate height
                feedEl.style.height = `${window.innerHeight}px`;
                feedEl.querySelectorAll('.video-post').forEach(p => {
                    p.style.height = `${window.innerHeight}px`;
                });
            }, 150);
        });
        // Initial set
        feedEl.style.height = `${window.innerHeight}px`;
    }

    // ══════════════════════════════════════════════════════════════
    // ── Bonus: Hide Bottom Nav on active scroll ───────────────────
    // ══════════════════════════════════════════════════════════════
    if (IS_MOBILE) {
        let isScrollingTimeout;
        const sidebarEl = document.querySelector('.sidebar');
        feedEl.addEventListener('scroll', () => {
            if (sidebarEl && !sidebarEl.classList.contains('hidden-nav')) {
                sidebarEl.classList.add('hidden-nav');
            }
            clearTimeout(isScrollingTimeout);
            isScrollingTimeout = setTimeout(() => {
                if (sidebarEl) sidebarEl.classList.remove('hidden-nav');
            }, 300); // Wait 300ms after snap scroll ends to reveal navbar gracefully
        }, { passive: true });
    }

    // ══════════════════════════════════════════════════════════════
    // ── Boot ──────────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════
    (() => {
        feedEl.innerHTML = '<div id="feedSpinner" style="display:flex;align-items:center;justify-content:center;height:100vh;height:100dvh;"><div class="spinner"></div></div>';
        createMuteIndicator();
        loadMore().then(() => initScroll());
    })();

}); // end DOMContentLoaded
