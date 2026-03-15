/* ============================================================
   Blink – Dynamic Video Feed v2
   • Fetches real videos from /api/videos (MySQL + RAND())
   • Session-level duplicate tracking (seenIds Set)
   • IntersectionObserver: autoplay visible, pause hidden
   • Preloads the next video for smooth scrolling
   • Infinite scroll: loads more when near the last card
   • Mood/tab filtering, Like/Unlike with live API update
   • Toast notifications for user feedback
   ============================================================ */

const feedContainer  = document.getElementById('feedContainer');
const moodSelector   = document.getElementById('moodSelector');
const toastEl        = document.getElementById('toast');

// ── STATE ─────────────────────────────────────────────────────
let currentMood  = 'General';
let isLoading    = false;
let seenIds      = new Set();
let mainObserver = null;
let sentinel     = null;
let sentinelObs  = null;

const API_BASE = ''; // same origin – served by Express

// ── TOAST ─────────────────────────────────────────────────────
function showToast(msg, duration = 2200) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    setTimeout(() => toastEl.classList.remove('show'), duration);
}

// ── FORMAT NUMBERS ────────────────────────────────────────────
function fmt(n) {
    if (!n && n !== 0) return '0';
    const num = parseInt(n, 10);
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M';
    if (num >= 1_000)     return (num / 1_000).toFixed(1) + 'K';
    return String(num);
}

// ── FETCH VIDEOS FROM API ─────────────────────────────────────
async function fetchVideos(mood = 'General', limit = 10) {
    const excludeParam = [...seenIds].join(',');
    const moodParam    = mood !== 'General' ? `&mood=${encodeURIComponent(mood)}` : '';
    const url          = `${API_BASE}/api/videos?limit=${limit}${moodParam}&exclude=${excludeParam}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`API ${res.status}`);
    const data = await res.json();
    return data.videos || [];
}

// ── BUILD VIDEO CARD ──────────────────────────────────────────
function buildVideoCard(v) {
    const post = document.createElement('div');
    post.className  = 'video-post';
    post.dataset.id = v.id;

    const avatarSrc  = v.avatar || `https://i.pravatar.cc/150?u=blink_${v.id}`;
    const username   = v.username   || 'blink_user';
    const caption    = v.caption    || '';
    const hashtags   = v.hashtags   || '';
    const likesLabel = v.likes_formatted || fmt(v.likes);

    const blinkBadge = v.is_blink_moment
        ? `<div class="blink-moment-badge">⚡ Blink Moment <span class="countdown">24h left</span></div>`
        : '';

    const moodEmoji = { Happy:'😊', Learning:'📚', Gaming:'🎮', Motivation:'🚀', Music:'🎵', General:'✨' };
    const moodTag   = v.mood_category
        ? `<span class="mood-tag">${moodEmoji[v.mood_category] || ''} ${v.mood_category}</span>`
        : '';

    post.innerHTML = `
        ${blinkBadge}

        <!-- Lazy-loaded video -->
        <video class="video-player"
               data-src="${v.video_url}"
               loop muted playsinline
               preload="none">
        </video>

        <!-- Shimmer while video loads -->
        <div class="video-shimmer">
            <div class="shimmer-bar"></div>
            <div class="shimmer-bar short"></div>
        </div>

        <!-- Video Info -->
        <div class="video-info">
            <div class="creator-handle">
                <span>@${username}</span>
                <span class="verified-badge" title="Verified">✓</span>
                ${moodTag}
            </div>
            <p class="video-caption">${caption}</p>
            <p class="video-hashtags">${hashtags}</p>
            <div class="video-music">
                <div class="music-disc">🎵</div>
                <span>Original Sound · ${username}</span>
            </div>
        </div>

        <!-- Action Buttons -->
        <div class="video-actions">
            <div class="creator-avatar" title="View Profile">
                <img src="${avatarSrc}" alt="@${username}" loading="lazy">
                <button class="follow-btn-small" title="Follow @${username}" aria-label="Follow ${username}">+</button>
            </div>

            <button class="action-btn like" data-id="${v.id}" data-original="${likesLabel}" aria-label="Like video">
                <div class="action-icon">❤️</div>
                <span class="action-text">${likesLabel}</span>
            </button>

            <button class="action-btn comment" aria-label="Comment on video">
                <div class="action-icon">💬</div>
                <span class="action-text">Comment</span>
            </button>

            <button class="action-btn bookmark" aria-label="Save video">
                <div class="action-icon">🔖</div>
                <span class="action-text">Save</span>
            </button>

            <button class="action-btn share" aria-label="Share video">
                <div class="action-icon">📤</div>
                <span class="action-text">Share</span>
            </button>
        </div>

        <!-- Tap area to play/pause -->
        <div class="tap-overlay" role="button" aria-label="Play or pause video" tabindex="0"></div>
        <div class="play-indicator" style="display:none;" aria-hidden="true">⏸</div>
    `;

    // ── Like Button ──────────────────────────────────────────
    const likeBtn = post.querySelector('.like');
    likeBtn.addEventListener('click', async () => {
        const alreadyLiked = likeBtn.classList.contains('active');
        likeBtn.classList.toggle('active');
        const countEl = likeBtn.querySelector('.action-text');
        try {
            if (!alreadyLiked) {
                const res  = await fetch(`/api/videos/${v.id}/like`, { method: 'POST' });
                const data = await res.json();
                countEl.textContent = fmt(data.likes);
                showToast('❤️ Liked!');
            } else {
                countEl.textContent = likeBtn.dataset.original;
            }
        } catch {
            countEl.textContent = alreadyLiked ? likeBtn.dataset.original : '♥';
        }
    });

    // ── Bookmark Button ──────────────────────────────────────
    const bookmarkBtn = post.querySelector('.bookmark');
    bookmarkBtn.addEventListener('click', () => {
        bookmarkBtn.classList.toggle('active');
        showToast(bookmarkBtn.classList.contains('active') ? '🔖 Saved!' : 'Removed from saved');
    });

    // ── Share Button ─────────────────────────────────────────
    post.querySelector('.share').addEventListener('click', async () => {
        try {
            if (navigator.share) {
                await navigator.share({ title: 'Blink Video', text: caption, url: window.location.href });
            } else {
                await navigator.clipboard.writeText(window.location.href);
                showToast('🔗 Link copied!');
            }
        } catch { /* cancelled */ }
    });

    // ── Follow Button ─────────────────────────────────────────
    const followBtn = post.querySelector('.follow-btn-small');
    followBtn.addEventListener('click', () => {
        const isFollowing = followBtn.textContent === '✓';
        followBtn.textContent = isFollowing ? '+' : '✓';
        followBtn.style.background = isFollowing ? '' : 'var(--blue)';
        showToast(isFollowing ? `Unfollowed @${username}` : `✅ Following @${username}`);
    });

    // ── Tap to Play/Pause ─────────────────────────────────────
    const tapOverlay    = post.querySelector('.tap-overlay');
    const playIndicator = post.querySelector('.play-indicator');

    const handleTap = () => {
        const vid = post.querySelector('.video-player');
        if (!vid.src) return;
        if (vid.paused) {
            vid.play();
            playIndicator.textContent = '⏸';
        } else {
            vid.pause();
            playIndicator.textContent = '▶';
        }
        playIndicator.style.display = 'block';
        setTimeout(() => { playIndicator.style.display = 'none'; }, 900);
    };

    tapOverlay.addEventListener('click', handleTap);
    tapOverlay.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') handleTap(); });

    return post;
}

// ── LAZY-LOAD + AUTOPLAY OBSERVER ─────────────────────────────
function setupVideoObserver(cards) {
    if (!mainObserver) {
        mainObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                const post    = entry.target;
                const vid     = post.querySelector('.video-player');
                const shimmer = post.querySelector('.video-shimmer');

                if (entry.isIntersecting) {
                    // Lazy-load: assign src when first visible
                    if (vid.dataset.src && !vid.src) {
                        vid.src = vid.dataset.src;
                        vid.load();
                        vid.addEventListener('canplay', () => {
                            if (shimmer) shimmer.style.display = 'none';
                        }, { once: true });
                    }

                    vid.play().catch(() => {});

                    // Track view count once per session
                    if (!post.dataset.viewed) {
                        post.dataset.viewed = '1';
                        fetch(`/api/videos/${post.dataset.id}/view`, { method: 'POST' }).catch(() => {});
                    }

                    // Preload the next card's video
                    const nextPost = post.nextElementSibling;
                    if (nextPost && nextPost.classList.contains('video-post')) {
                        const nextVid = nextPost.querySelector('.video-player');
                        if (nextVid && nextVid.dataset.src && !nextVid.src) {
                            nextVid.src     = nextVid.dataset.src;
                            nextVid.preload = 'auto';
                            nextVid.load();
                        }
                    }
                } else {
                    vid.pause();
                    vid.currentTime = 0;
                }
            });
        }, {
            root:      feedContainer,
            threshold: 0.65 // card must be 65% visible to play
        });
    }

    cards.forEach(c => mainObserver.observe(c));
}

// ── SENTINEL OBSERVER ─────────────────────────────────────────
function setupSentinel() {
    if (sentinel) sentinel.remove();
    sentinel = document.createElement('div');
    sentinel.className = 'scroll-sentinel';
    feedContainer.appendChild(sentinel);

    if (sentinelObs) sentinelObs.disconnect();
    sentinelObs = new IntersectionObserver(
        (entries) => { if (entries[0].isIntersecting) loadMore(); },
        { root: feedContainer, threshold: 0.1 }
    );
    sentinelObs.observe(sentinel);
}

// ── LOADING SKELETON ───────────────────────────────────────────
function showSkeleton() {
    const sk = document.createElement('div');
    sk.className = 'video-post skeleton-post';
    sk.id = 'loadingSkeleton';
    sk.innerHTML = `
        <div style="width:100%;height:100%;background:linear-gradient(160deg,#0f0f14,#1a0926,#0f1a26);
                    display:flex;align-items:center;justify-content:center;flex-direction:column;gap:16px;">
            <div style="width:48px;height:48px;border:3px solid transparent;border-top-color:var(--blue);
                        border-radius:50%;animation:spin 0.8s linear infinite;"></div>
            <span style="color:var(--text-secondary);font-size:14px;font-weight:600;">Loading more videos…</span>
        </div>
    `;
    feedContainer.appendChild(sk);
    return sk;
}

// ── LOAD MORE VIDEOS ───────────────────────────────────────────
async function loadMore() {
    if (isLoading) return;
    isLoading = true;

    const skeleton = showSkeleton();

    try {
        const videos = await fetchVideos(currentMood, 10);
        skeleton.remove();

        if (videos.length === 0) {
            seenIds.clear(); // cycle back from start
            const recycled = await fetchVideos(currentMood, 10);
            appendVideos(recycled);
        } else {
            appendVideos(videos);
        }
    } catch (err) {
        console.error('[Feed] Failed to load:', err);
        skeleton.remove();
        showFallback();
    } finally {
        isLoading = false;
        setupSentinel();
    }
}

// ── APPEND VIDEO CARDS ─────────────────────────────────────────
function appendVideos(videos) {
    const newCards = [];
    videos.forEach(v => {
        if (!seenIds.has(v.id)) {
            seenIds.add(v.id);
            const card = buildVideoCard(v);
            feedContainer.appendChild(card);
            newCards.push(card);
        }
    });
    setupVideoObserver(newCards);
}

// ── FALLBACK WHEN API IS UNAVAILABLE ──────────────────────────
function showFallback() {
    const FALLBACK = [
        {
            id: 9001,
            video_url: 'https://www.w3schools.com/html/mov_bbb.mp4',
            username: 'blink_demo',
            caption: 'Demo video – connect your DB to see real content 🎬',
            hashtags: '#demo #blink',
            mood_category: 'General',
            is_blink_moment: false,
            likes: 0
        },
    ];
    if (feedContainer.querySelectorAll('.video-post:not(.skeleton-post)').length === 0) {
        appendVideos(FALLBACK);
    }
}

// ── RESET FEED ─────────────────────────────────────────────────
async function resetFeed(mood) {
    feedContainer.querySelectorAll('.video-player').forEach(v => v.pause());

    feedContainer.innerHTML = '';
    seenIds.clear();
    isLoading = false;

    if (mainObserver) { mainObserver.disconnect();  mainObserver = null; }
    if (sentinelObs)  { sentinelObs.disconnect();   sentinelObs  = null; }

    await loadMore();
}

// ── MOOD SELECTOR ──────────────────────────────────────────────
moodSelector.addEventListener('click', e => {
    const pill = e.target.closest('.mood-pill');
    if (!pill) return;
    moodSelector.querySelector('.active')?.classList.remove('active');
    pill.classList.add('active');
    currentMood = pill.dataset.mood || 'General';
    resetFeed(currentMood);
});

// ── UPLOAD BUTTON ──────────────────────────────────────────────
document.getElementById('uploadBtn')?.addEventListener('click', () => {
    showToast('📤 Upload feature coming soon!');
});

// ── BOOT ───────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    await loadMore();
    setupSentinel();
});
