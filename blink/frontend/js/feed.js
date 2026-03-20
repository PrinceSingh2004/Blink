/* feed.js – Video feed page */
// Wait for DOM + auth.js to load first
document.addEventListener('DOMContentLoaded', async () => {
const { getToken, getUser, requireAuth, apiRequest, showToast, populateSidebar } = window.Blink;

if (!requireAuth()) return;
await populateSidebar();


// ── State ─────────────────────────────────────────────────────
const feedEl   = document.getElementById('feedContainer');
const moodBar  = document.getElementById('moodSelector');
let currentMood  = 'General';
let isLoading    = false;
let seenIds      = new Set();
let cycleCount   = 0;          // Track how many times we've cycled the feed
const MAX_CYCLES = 1;          // Allow 1 cycle before showing "end of feed"
let videoObs     = null;
let currentUser  = getUser();

// ── TikTok Live Bar Populator ───────────────────────────────
async function loadLiveBar() {
    const bar = document.getElementById('liveDiscoveryBar');
    const list = document.getElementById('liveBarList');
    if (!bar || !list) return;

    try {
        const data = await apiRequest('/live/now');
        const streams = data.streams || [];
        if (streams.length > 0) {
            bar.style.display = 'block';
            list.innerHTML = streams.map(s => `
                <div class="live-story-card" 
                     onclick="window.location.href='/pages/live.html?id=${s.stream_id}'" 
                     style="display:flex; flex-direction:column; align-items:center; cursor:pointer; min-width:82px; position:relative; transition:transform 0.2s ease;">
                    <div style="position:relative; width:68px; height:68px; border-radius:50%; padding:3px; 
                         background:linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%); box-shadow:0 4px 12px rgba(220,39,67,0.3);">
                        <img src="${s.profile_picture || `https://i.pravatar.cc/100?u=${s.user_id}`}" 
                             style="width:100%; height:100%; border-radius:50%; object-fit:cover; border:3px solid #000; display:block;"
                             onerror="this.src='/favicon.png'">
                        <div style="position:absolute; bottom:-2px; left:50%; transform:translateX(-50%); 
                             background:var(--pink); color:#fff; font-size:9px; font-weight:900; padding:1px 6px; 
                             border-radius:6px; border:2px solid #000; text-transform:uppercase; letter-spacing:0.5px; box-shadow:0 2px 4px rgba(0,0,0,0.3);">LIVE</div>
                    </div>
                    <span style="font-size:11px; margin-top:10px; color:#fff; font-weight:600; max-width:70px; 
                          overflow:hidden; text-overflow:ellipsis; white-space:nowrap; text-shadow:0 1px 2px rgba(0,0,0,0.5);">@${s.username}</span>
                </div>
            `).join('');
        } else {
            bar.style.display = 'none';
        }
    } catch (e) { console.warn('[LiveBar] fail', e); }
}
loadLiveBar();
// Real-time update for discovery bar
if (window.Blink.socket) {
    window.Blink.socket.on('live_discovery_update', loadLiveBar);
}
setInterval(loadLiveBar, 10000); // 10s polling as fallback

// ── Format numbers ────────────────────────────────────────────
function fmt(n) {
    const v = parseInt(n) || 0;
    if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M';
    if (v >= 1_000)     return (v / 1_000).toFixed(1) + 'K';
    return String(v);
}

// ── Fetch videos ──────────────────────────────────────────────
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

// ── Build video card ──────────────────────────────────────────
function buildCard(v) {
    const post = document.createElement('div');
    post.className  = 'video-post';
    post.dataset.id = v.id;

    const avatarSrc  = v.profile_picture || `https://i.pravatar.cc/100?u=blink_${v.user_id}`;
    const username   = v.username || 'blink_user';
    const isOwnPost  = currentUser && currentUser.id === v.user_id;

    post.innerHTML = `
        ${v.is_blink_moment ? `<div class="blink-badge"><i class="bi bi-lightning-charge-fill"></i> Blink Moment <span style="opacity:.7;font-size:10px">24h left</span></div>` : ''}
        <video class="video-player" data-src="${v.video_url}" playsinline preload="none"></video>
        <div class="video-shimmer"><div class="shimmer-bar"></div><div class="shimmer-bar short"></div></div>
        <div class="video-info">
            <div class="user-info" onclick="window.location.href='/pages/profile.html?id=${v.user_id}'">
                <img src="${avatarSrc}" class="profile-pic" alt="@${username}">
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
            <button class="action-btn comment" data-id="${v.id}" data-user="${username}" data-caption="${(v.caption || '').replace(/"/g,'&quot;')}">
                <div class="action-icon"><i class="bi bi-chat-left-text-fill"></i></div><span class="action-text">${fmt(v.comments_count)}</span>
            </button>
            <button class="action-btn share" data-id="${v.id}">
                <div class="action-icon"><i class="bi bi-share-fill"></i></div><span class="action-text">Share</span>
            </button>
            ${isOwnPost ? `<button class="action-btn delete" data-id="${v.id}"><div class="action-icon"><i class="bi bi-trash3-fill"></i></div><span class="action-text">Delete</span></button>` : ''}
        </div>
        <div class="tap-overlay"></div>
    `;

    // Like
    const likeBtn = post.querySelector('.like');
    likeBtn.addEventListener('click', async () => {
        if (!getToken()) { showToast('Sign in to like videos'); return; }
        const wasLiked = likeBtn.classList.contains('active');
        likeBtn.classList.toggle('active');
        const span = likeBtn.querySelector('.action-text');
        let count = parseInt(likeBtn.dataset.count) || 0;
        span.textContent = fmt(wasLiked ? Math.max(0, count - 1) : count + 1);
        try {
            const r = await apiRequest(`/videos/${v.id}/like`, { method: 'POST' });
            likeBtn.dataset.count = r.likes_count;
            span.textContent = fmt(r.likes_count);
        } catch {
            likeBtn.classList.toggle('active');
            span.textContent = fmt(count);
        }
    });

    // Comment
    post.querySelector('.comment').addEventListener('click', () => openCommentModal(v.id));

    // Share
    post.querySelector('.share').addEventListener('click', async () => {
        const url = `${window.location.origin}/pages/index.html`;
        try {
            if (navigator.share) await navigator.share({ title: 'Blink Video', url });
            else { await navigator.clipboard.writeText(url); showToast('Link copied!'); }
            fetch(`/api/videos/${v.id}/share`, { method: 'POST' }).catch(() => {});
        } catch {}
    });

    // Follow quick
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
                followBtn.textContent = '+';
                showToast(`Unfollowed @${username}`);
            } else {
                await apiRequest(`/follow/${uid}`, { method: 'POST' });
                followBtn.classList.add('following');
                followBtn.innerHTML = '<i class=\"bi bi-check-lg\"></i>';
                showToast(`Following @${username}`);
            }
        } catch (err) { showToast(err.message, 'error'); }
    });

    // Delete
    post.querySelector('.delete')?.addEventListener('click', async () => {
        if (!confirm('Delete this video?')) return;
        try {
            await apiRequest(`/videos/${v.id}`, { method: 'DELETE' });
            post.remove();
            showToast('Video deleted');
        } catch (err) { showToast(err.message, 'error'); }
    });

    // Tap to play/pause
    const tapZone = post.querySelector('.tap-overlay');
    tapZone.addEventListener('click', () => {
        const vid = post.querySelector('.video-player');
        if (!vid.src) return;
        if (vid.paused) { vid.play(); } else { vid.pause(); }
        const icon = document.createElement('div');
        icon.className   = 'play-indicator';
        icon.innerHTML = vid.paused ? '<i class=\"bi bi-play-fill\"></i>' : '<i class=\"bi bi-pause-fill\"></i>';
        post.appendChild(icon);
        setTimeout(() => icon.remove(), 600);
    });

    return post;
}

// ── Video autoplay observer ────────────────────────────────────
function hideShimmer(shim) {
    if (!shim || shim.classList.contains('hidden')) return;
    shim.classList.add('hidden');
    // Remove from DOM after fade completes so it never re-blocks
    setTimeout(() => shim.remove(), 350);
}

function setupVideoObs(cards) {
    if (!videoObs) {
        videoObs = new IntersectionObserver(entries => {
            entries.forEach(en => {
                const post = en.target;
                const vid  = post.querySelector('.video-player');
                const shim = post.querySelector('.video-shimmer');
                if (en.isIntersecting) {
                    if (vid.dataset.src && !vid.src) {
                        vid.src = vid.dataset.src;
                        vid.load();
                        // Hide shimmer on either canplay OR loadeddata
                        const onReady = () => hideShimmer(shim);
                        vid.addEventListener('canplay',    onReady, { once: true });
                        vid.addEventListener('loadeddata', onReady, { once: true });
                        // Safety: always hide shimmer after 2s regardless of codec
                        setTimeout(() => hideShimmer(shim), 2000);
                    } else {
                        // Video already loaded — hide shimmer immediately
                        hideShimmer(shim);
                    }
                    vid.play().catch(() => {});
                    // Preload next card
                    const next = post.nextElementSibling?.querySelector?.('.video-player');
                    if (next?.dataset.src && !next.src) { next.src = next.dataset.src; next.load(); }
                } else {
                    vid.pause();
                    vid.currentTime = 0;
                }
            });
        }, { root: feedEl, threshold: 0.65 });
    }
    cards.forEach(c => videoObs.observe(c));
}

// ── Append videos ─────────────────────────────────────────────
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
    
    // Safety check: if all fetched videos were already seen and we haven't reached end
    if (newCards.length === 0 && videos.length > 0 && !isLoading) {
        console.log('[Feed] All fetched videos were duplicates, requesting more...');
        loadMore();
    }

    setupVideoObs(newCards);
}

// ── Load more ─────────────────────────────────────────────────
async function loadMore() {
    if (isLoading) return;
    isLoading = true;
    try {
        let videos = await fetchVideos(currentMood, 10);
        if (!videos.length && cycleCount < MAX_CYCLES) {
            // Cycle once: clear seen IDs so we can re-show older videos
            cycleCount++;
            seenIds.clear();
            videos = await fetchVideos(currentMood, 10);
        }
        if (!videos.length) {
            // No more videos at all, or already cycled — show end message
            if (!feedEl.querySelector('.feed-end-msg')) {
                const endMsg = document.createElement('div');
                endMsg.className = 'feed-end-msg';
                endMsg.style.cssText = 'text-align:center;padding:40px 20px;color:var(--text-muted);font-size:14px;';
                endMsg.innerHTML = '<i class="bi bi-check-circle-fill" style="font-size:28px;display:block;margin-bottom:8px"></i>You\'re all caught up!';
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
        if (scroll) scroll.refresh();
    }
}

// ── Infinite scroll ───────────────────────────────────────────
let scroll = null;
function initScroll() {
    if (scroll) scroll.destroy();
    scroll = new InfiniteScroll(feedEl, { onMore: loadMore, threshold: 0.1 });
}

// ── Mood selector ─────────────────────────────────────────────
moodBar?.addEventListener('click', async e => {
    const pill = e.target.closest('.mood-pill');
    if (!pill) return;
    moodBar.querySelector('.active')?.classList.remove('active');
    pill.classList.add('active');
    currentMood = pill.dataset.mood || 'General';
    feedEl.querySelectorAll('.video-player').forEach(v => v.pause());
    feedEl.innerHTML = '';
    seenIds.clear();
    cycleCount = 0;  // Reset cycle count on mood change
    isLoading = false;
    if (videoObs) { videoObs.disconnect(); videoObs = null; }
    await loadMore();
    initScroll();
});

// ── Comment Modal ─────────────────────────────────────────────
const commentModal    = document.getElementById('commentModal');
const commentList     = document.getElementById('commentList');
const commentInput    = document.getElementById('commentInput');
const commentSendBtn  = document.getElementById('commentSendBtn');
let activeVideoId     = null;

async function openCommentModal(videoId) {
    activeVideoId = videoId;
    commentList.innerHTML = '<div class="comment-empty"><div class="spinner"></div></div>';
    commentModal.classList.add('open');
    try {
        const data = await apiRequest(`/comments/${videoId}`);
        renderComments(data.comments);
    } catch { commentList.innerHTML = '<p class="comment-empty">Failed to load comments</p>'; }
}

function renderComments(comments) {
    if (!comments.length) {
        commentList.innerHTML = '<div class="comment-empty"><i class="bi bi-chat-dots-fill"></i><br>No comments yet. Be first!';
        return;
    }
    commentList.innerHTML = comments.map(c => {
        const av = c.profile_picture
            ? `<img class="comment-avatar" src="${c.profile_picture}" alt="">` 
            : `<div class="comment-avatar">${(c.username || 'U')[0].toUpperCase()}</div>`;
        const d = new Date(c.created_at);
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
        const data = await apiRequest(`/comments/${activeVideoId}`, {
            method: 'POST',
            body:   JSON.stringify({ comment_text: text })
        });
        // Update count on card
        const card = feedEl.querySelector(`[data-id="${activeVideoId}"]`);
        const countEl = card?.querySelector('.comment .action-text');
        const cur = parseInt(countEl?.textContent) || 0;
        if (countEl) countEl.textContent = fmt(cur + 1);
        // Re-fetch comments
        const refreshed = await apiRequest(`/comments/${activeVideoId}`);
        renderComments(refreshed.comments);
    } catch (err) { showToast(err.message, 'error'); }
});

commentInput?.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commentSendBtn.click(); } });

document.getElementById('closeCommentModal')?.addEventListener('click', () => {
    commentModal?.classList.remove('open');
});
commentModal?.addEventListener('click', e => { if (e.target === commentModal) commentModal.classList.remove('open'); });

// ── Boot ──────────────────────────────────────────────────────
(async () => {
    await loadMore();
    initScroll();
})();

}); // end DOMContentLoaded
