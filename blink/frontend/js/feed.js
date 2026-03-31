/**
 * feed.js – Blink Feed Engine Pro v6.0 (Social Upgrade)
 * Features: Smart Algorithm, Real-time Comments, Interactive Likes, Profile Integration
 */

document.addEventListener('DOMContentLoaded', async () => {
    const { getToken, getUser, requireAuth, showToast, API } = window.Blink;
    if (!requireAuth()) return;

    const reelsContainer = document.getElementById('reelsContainer');
    const commentDrawer = document.getElementById('commentDrawer');
    let videoObserver = null;
    let loading = false;
    let isMuted = true;
    let activeVideoId = null;

    // ── 1. SMART UNIVERSE SYNC (Ranking Algorithm) ────────────
    async function loadFeed() {
        if (loading) return;
        loading = true;

        try {
            console.log("🚀 Syncing Smart Algorithm Universe...");
            const res = await fetch(`${API}/videos`, {
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            const data = await res.json();

            if (data.success) {
                renderReels(data.videos || []);
            }
        } catch (err) {
            console.error("Algorithm Failure:", err);
        } finally { loading = false; }
    }

    function renderReels(videos) {
        reelsContainer.innerHTML = '';
        videos.forEach((v, index) => {
            const reel = document.createElement('div');
            reel.className = 'reel-item';
            reel.dataset.id = v.id;

            const avatarHtml = v.profile_pic
                ? `<img src="${v.profile_pic}" alt="@${v.username}" class="avatar">`
                : `<div class="avatar flex-center" style="background:var(--bg-elevated);">${v.username[0].toUpperCase()}</div>`;

            reel.innerHTML = `
                <div class="video-loading"><div class="loader"></div></div>
                <video src="${v.video_url}" loop playsinline class="reel-video" ${isMuted ? 'muted' : ''}></video>
                <div class="mute-btn"><i class="bi ${isMuted ? 'bi-volume-mute-fill' : 'bi-volume-up-fill'}"></i></div>

                <div class="reel-actions">
                    <div class="action-item profile-link" data-id="${v.user_id}">
                        ${avatarHtml}
                    </div>
                    <div class="action-item">
                        <button class="action-btn like-btn" data-id="${v.id}">
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
                    <div class="reel-user profile-link" data-id="${v.user_id}">
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

    // ── 2. ENGAGEMENT LOGIC ────────────────────────────────────
    function attachEvents(reel) {
        const video = reel.querySelector('.reel-video');
        const muteBtn = reel.querySelector('.mute-btn');
        const tapOverlay = reel.querySelector('.tap-overlay');
        const likeBtn = reel.querySelector('.like-btn');
        const commentBtn = reel.querySelector('.comment-btn');
        const profileLinks = reel.querySelectorAll('.profile-link');

        // Toggle Mute
        const toggleMute = () => {
            isMuted = !isMuted;
            document.querySelectorAll('.reel-video').forEach(v => v.muted = isMuted);
            document.querySelectorAll('.mute-btn i').forEach(i => {
                i.className = `bi ${isMuted ? 'bi-volume-mute-fill' : 'bi-volume-up-fill'}`;
            });
        };

        if (muteBtn) muteBtn.onclick = toggleMute;
        if (tapOverlay) tapOverlay.onclick = toggleMute;

        // Like Animation & Sync
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
                        likeBtn.classList.toggle('liked');
                        const count = likeBtn.parentElement.querySelector('.action-count');
                        count.textContent = parseInt(count.textContent) + 1;
                    }
                } catch (e) { showToast("Failed to pulse heart.", "error"); }
            };
        }

        // Comment Drawer
        if (commentBtn) {
            commentBtn.onclick = () => {
                activeVideoId = commentBtn.dataset.id;
                openComments(activeVideoId);
            };
        }

        // Navigation
        profileLinks.forEach(link => {
            link.onclick = () => window.location.href = `profile.html?id=${link.dataset.id}`;
        });
    }

    // ── 3. REAL-TIME COMMENTS DIALOGUE ─────────────────────────
    async function openComments(videoId) {
        commentDrawer.classList.add('active');
        const list = document.getElementById('commentList');
        list.innerHTML = `<div class="flex-center h-full"><div class="loader"></div></div>`;

        try {
            const res = await fetch(`${API}/social/comments/${videoId}`);
            const data = await res.json();
            if (data.success) {
                renderComments(data.data);
            }
        } catch (err) { showToast("Failed to load dialogue.", "error"); }
    }

    function renderComments(comments) {
        const list = document.getElementById('commentList');
        if (comments.length === 0) {
            list.innerHTML = `<p style="text-align:center; opacity:0.5;">No thoughts shared yet.</p>`;
            return;
        }
        list.innerHTML = comments.map(c => `
            <div class="comment-item">
                <img src="${c.profile_pic || 'https://via.placeholder.com/32'}" class="avatar-sm">
                <div class="comment-content">
                    <span class="comment-user">@${c.username}</span>
                    <p class="comment-text">${c.text}</p>
                </div>
            </div>
        `).join('');
    }

    document.getElementById('postCommentBtn').onclick = async () => {
        const input = document.getElementById('commentInput');
        const text = input.value.trim();
        if (!text || !activeVideoId) return;

        try {
            const res = await fetch(`${API}/social/comment`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json', 
                    'Authorization': `Bearer ${getToken()}` 
                },
                body: JSON.stringify({ videoId: activeVideoId, text })
            });
            const data = await res.json();
            if (data.success) {
                input.value = '';
                openComments(activeVideoId); // Refresh
            }
        } catch (e) { showToast("Failed to share thought.", "error"); }
    };

    // Global Close
    document.addEventListener('click', (e) => {
        if (commentDrawer.classList.contains('active') && !commentDrawer.contains(e.target) && !e.target.closest('.comment-btn')) {
            commentDrawer.classList.remove('active');
        }
    });

    // ── 4. VIDEO OBSERVER (Autoplay & View Pulse) ─────────────
    function initVideoObserver() {
        videoObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                const video = entry.target;
                if (entry.isIntersecting) {
                    video.play().catch(() => {});
                    video.parentElement.querySelector('.video-loading')?.classList.add('invisible');
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
        } catch (e) {}
    }

    loadFeed();
});
