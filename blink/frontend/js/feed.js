/**
 * feed.js – Ultimate Reels & Stories System
 * ═══════════════════════════════════════════════════════════
 * Infinite scroll, video autoplay, story uploading – No Refresh
 * ═══════════════════════════════════════════════════════════
 */

document.addEventListener('DOMContentLoaded', async () => {
    const { getToken, getUser, requireAuth, showToast, apiRequest } = window.Blink;
    if (!requireAuth()) return;

    const me = getUser();
    const feed = document.getElementById('feedContainer');
    const loader = document.getElementById('feedLoader');
    const storiesList = document.getElementById('storiesList');

    let page = 0;
    const limit = 5;
    let loading = false;
    let hasMore = true;

    // ─── 1. LOAD STORIES ───────────────────────────────────────
    async function loadStories() {
        try {
            const data = await apiRequest('/api/stories/feed');
            renderStories(data.users);
        } catch (err) {
            console.error('[Stories]', err);
        }
    }

    function renderStories(users) {
        storiesList.innerHTML = '';
        users.forEach(u => {
            const div = document.createElement('div');
            div.className = `story-bubble ${u.all_seen ? '' : 'unseen'}`;
            div.innerHTML = `
                <div class="story-avatar">
                    <img src="${u.avatar || 'image/default-avatar.png'}" alt="${u.username}">
                </div>
                <span>${u.username === me.username ? 'You' : u.username}</span>
            `;
            div.onclick = () => showToast(`Viewing @${u.username}'s story (UI coming soon)`, 'info');
            storiesList.appendChild(div);
        });
    }

    // ─── 2. LOAD REELS (Infinite Scroll) ────────────────────────
    async function loadReels() {
        if (loading || !hasMore) return;
        loading = true;
        loader.classList.remove('hidden');

        try {
            const data = await apiRequest(`/api/videos/feed?limit=${limit}&offset=${page * limit}`);
            if (data.videos.length < limit) hasMore = false;

            renderReels(data.videos);
            page++;
        } catch (err) {
            showToast('Failed to load reels', 'error');
        } finally {
            loading = false;
            loader.classList.add('hidden');
        }
    }

    function renderReels(videos) {
        videos.forEach(v => {
            const reel = document.createElement('div');
            reel.className = 'reel-card';
            reel.innerHTML = `
                <video src="${v.video_url}" loop muted playsinline class="reel-video"></video>
                <div class="reel-overlay">
                    <div class="reel-side-actions">
                        <button class="action-btn like-btn ${v.liked_by_me ? 'active' : ''}" data-id="${v.id}">
                            <i class="bi ${v.liked_by_me ? 'bi-heart-fill' : 'bi-heart'}"></i>
                            <span>${v.likes_fmt}</span>
                        </button>
                        <button class="action-btn"><i class="bi bi-chat-text-fill"></i><span>${v.comments_fmt}</span></button>
                        <button class="action-btn"><i class="bi bi-send-fill"></i></button>
                    </div>
                    <div class="reel-info">
                        <h3>@${v.username}</h3>
                        <p>${v.caption}</p>
                    </div>
                </div>
            `;
            feed.appendChild(reel);

            // Toggle Like logic
            reel.querySelector('.like-btn').onclick = async (e) => {
                const btn = e.currentTarget;
                const vid = btn.dataset.id;
                try {
                    const res = await apiRequest(`/api/videos/toggle-like/${vid}`, { method: 'POST' });
                    const icon = btn.querySelector('i');
                    const span = btn.querySelector('span');
                    if (res.liked) {
                        icon.className = 'bi bi-heart-fill';
                        btn.classList.add('active');
                    } else {
                        icon.className = 'bi bi-heart';
                        btn.classList.remove('active');
                    }
                } catch (err) { showToast('Action failed', 'error'); }
            };
        });
        
        observeVideos();
    }

    // ─── 3. VIDEO AUTOPLAY (Intersection Observer) ─────────────
    function observeVideos() {
        const obs = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                const video = entry.target;
                if (entry.isIntersecting) {
                    video.play().catch(() => {});
                } else {
                    video.pause();
                }
            });
        }, { threshold: 0.8 });

        document.querySelectorAll('.reel-video').forEach(v => obs.observe(v));
    }

    // ─── 4. STORY UPLOADING ────────────────────────────────────
    const storyInput = document.getElementById('storyInput');
    document.getElementById('addStoryBtn').onclick = () => storyInput.click();

    storyInput.onchange = async () => {
        const file = storyInput.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('story', file);

        showToast('Uploading story...', 'info');
        try {
            await fetch('/api/stories/upload', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + getToken() },
                body: formData
            });
            showToast('Story posted! ✨', 'success');
            loadStories();
        } catch (err) {
            showToast('Upload failed', 'error');
        }
    };

    // ─── 5. INFINITE SCROLL LISTENER ───────────────────────────
    window.onscroll = () => {
        if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 500) {
            loadReels();
        }
    };

    // INIT
    loadStories();
    loadReels();
});
