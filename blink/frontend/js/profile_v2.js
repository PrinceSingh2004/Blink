/**
 * profile_v2.js
 * ═══════════════════════════════════════════════════════════
 * Blink Profile System — Frontend Controller
 * Features: Infinite Scroll, Follow System, Optimistic UI, 
 *           Cache-Busting, Avatar Processing, Toast System
 * ═══════════════════════════════════════════════════════════
 */

(function() {
    "use strict";

    // ── CONFIG & STATE ───────────────────────────────────────
    const API = "/api/profile";
    let state = {
        me: null,       // Own profile data
        u: null,        // Viewing profile data
        posts: [],      // User posts
        activeTab: 'posts',
        isOwner: false,
        isFollowed: false,
        paged: 1,
        loading: false
    };

    // ── DOM SELECTORS ────────────────────────────────────────
    const doc = (id) => document.getElementById(id);
    const qs  = (sel) => document.querySelector(sel);
    const qsa = (sel) => document.querySelectorAll(sel);

    // ── INITIALIZATION ───────────────────────────────────────
    async function initProfilePage() {
        try {
            // 1. Get username from URL
            const urlPath = window.location.pathname;
            const username = urlPath.split('/').pop() || '';
            
            // 2. Fetch MY data first (for ownership checks)
            await fetchMe();
            
            // 3. Load profile data
            await loadProfile(username);
            
            // 4. Close initial loader
            doc('initialLoader').classList.add('hidden');
            
            // 5. Setup Listeners
            setupListeners();
            
        } catch (err) {
            console.error('[Profile] Init failed:', err.message);
            showToast('Failed to load profile', 'error');
        }
    }

    // ── API HELPERS ─────────────────────────────────────────
    async function fetchMe() {
        try {
            const res = await fetch(`${API}/me`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('blink_token')}` }
            });
            const data = await res.json();
            if (res.ok) state.me = data.user;
        } catch {}
    }

    async function loadProfile(username) {
        try {
            const res = await fetch(`${API}/${username}`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('blink_token')}` }
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            state.u = data.user;
            state.posts = data.posts || [];
            state.isOwner = state.me ? state.me.id === state.u.id : false;
            state.isFollowed = data.is_following;

            renderHeader();
            renderStats();
            renderProfileDetails();
            renderSocialLinks();
            renderPosts();
            
            if (state.isOwner) renderCompletion(data.score, data.tips);
            
            // Privacy lock
            if (state.u.is_private && !state.isOwner && !state.isFollowed) {
                doc('privateLock').hidden = false;
                doc('postsGrid').hidden   = true;
            }

        } catch (err) {
            showToast(err.message, 'error');
            doc('navUsername').textContent = 'User not found';
        }
    }

    // ── RENDER ENGINE ────────────────────────────────────────
    function renderHeader() {
        const u = state.u;
        doc('navUsername').textContent = u.username;
        doc('profileUsername').textContent = `@${u.username}`;
        doc('profileFullName').textContent = u.full_name || u.username;
        doc('profileBio').textContent      = u.bio || '';
        doc('profileAvatar').src = u.profile_pic || '/img/default-avatar.svg';
        doc('coverImg').src      = u.cover_photo || '/img/default-cover.jpg';
        
        // Badge logic
        doc('verifiedBadge').hidden = !u.is_verified;
        doc('typeBadge').textContent = (u.account_type || 'Personal').toUpperCase();
        
        if (state.isOwner) {
            doc('avatarEditOverlay').style.display = 'flex';
            doc('editCoverBtn').hidden = false;
        }

        renderActions();
    }

    function renderActions() {
        const wrap = doc('actionsRow');
        wrap.innerHTML = '';

        if (state.isOwner) {
            wrap.innerHTML = `
                <button class="btn btn-secondary btn-block" id="btnEditProfile">Edit Profile</button>
                <button class="btn btn-secondary btn-icon" id="btnShare"><i class="bi bi-share"></i></button>
            `;
            doc('btnEditProfile').onclick = openEditModal;
        } else {
            const followText = state.isFollowed ? 'Following ✓' : 'Follow';
            const followClass = state.isFollowed ? 'btn-secondary' : 'btn-primary';
            
            wrap.innerHTML = `
                <button class="btn ${followClass} btn-grow" id="btnFollowAction">${followText}</button>
                <button class="btn btn-secondary btn-grow" id="btnMessage">Message</button>
                <button class="btn btn-secondary btn-icon"><i class="bi bi-three-dots"></i></button>
            `;
            
            doc('btnFollowAction').onclick = toggleFollow;
        }
    }

    function renderStats() {
        doc('countPosts').textContent     = formatCount(state.u.post_count);
        doc('countFollowers').textContent = formatCount(state.u.follower_count);
        doc('countFollowing').textContent = formatCount(state.u.following_count);
    }

    function renderPosts() {
        const grid = doc('postsGrid');
        grid.innerHTML = '';

        if (!state.posts.length) {
            doc('emptyPosts').hidden = false;
            return;
        }

        state.posts.forEach(post => {
            const el = document.createElement('div');
            el.className = 'post-item';
            el.innerHTML = `
                <img src="${post.thumbnail_url || post.video_url}" alt="" loading="lazy"/>
                <div class="post-overlay"><i class="bi bi-play-fill"></i> ${formatCount(post.view_count || 0)}</div>
            `;
            el.onclick = () => window.location.href = `/video/${post.id}`;
            grid.appendChild(el);
        });
    }

    // ── ACTIONS ─────────────────────────────────────────────
    async function toggleFollow() {
        if (!state.me) return (window.location.href = '/login');
        
        const isCurrently = state.isFollowed;
        const userId = state.u.id;
        
        // Optimistic UI
        state.isFollowed = !isCurrently;
        state.u.follower_count += isCurrently ? -1 : 1;
        renderHeader();
        renderStats();

        try {
            const method = isCurrently ? 'DELETE' : 'POST';
            const res = await fetch(`${API}/follow/${userId}`, {
                method: method,
                headers: { 'Authorization': `Bearer ${localStorage.getItem('blink_token')}` }
            });
            if (!res.ok) throw new Error('Follow action failed');
            
        } catch (err) {
            // Revert on error
            state.isFollowed = isCurrently;
            state.u.follower_count -= isCurrently ? -1 : 1;
            renderHeader();
            renderStats();
            showToast(err.message, 'error');
        }
    }

    async function handleAvatarSelect(e) {
        const file = e.target.files[0];
        if (!file) return;

        // 1. Instant local preview
        const reader = new FileReader();
        reader.onload = (ev) => doc('profileAvatar').src = ev.target.result;
        reader.readAsDataURL(file);
        
        doc('avatarLoader').style.display = 'block';

        const formData = new FormData();
        formData.append('avatar', file);

        try {
            const res = await fetch(`${API}/upload-avatar`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('blink_token')}` },
                body: formData
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            doc('profileAvatar').src = data.url + '?v=' + Date.now();
            if (data.score) updateScoreBar(data.score);
            showToast('Avatar updated! ✨', 'success');
            
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            doc('avatarLoader').style.display = 'none';
        }
    }

    // ── UTILITIES ───────────────────────────────────────────
    function formatCount(n) {
        if (n < 1000) return n;
        if (n < 1000000) return (n/1000).toFixed(1) + 'K';
        return (n/1000000).toFixed(1) + 'M';
    }

    function showToast(msg, type = 'info') {
        const wrap = doc('toastContainer');
        const el = document.createElement('div');
        el.className = `toast toast-${type}`;
        el.textContent = msg;
        wrap.appendChild(el);
        setTimeout(() => el.remove(), 3500);
    }

    function setupListeners() {
        // Avatar click (Owner only)
        if (state.isOwner) {
            doc('avatarWrap').onclick = () => doc('avatarInput').click();
            doc('avatarInput').onchange = handleAvatarSelect;
            
            doc('editCoverBtn').onclick = () => doc('coverFileInput').click();
            doc('coverFileInput').onchange = async (e) => {
                const f = e.target.files[0];
                const form = new FormData();
                form.append('avatar', f);
                const res = await fetch(`${API}/upload-cover`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${localStorage.getItem('blink_token')}` },
                    body: form
                });
                const data = await res.json();
                if (res.ok) doc('coverImg').src = data.url + '?v=' + Date.now();
            };
        }

        // Tabs
        qsa('.tab-btn').forEach(btn => {
            btn.onclick = () => {
                qsa('.tab-btn').forEach(b => b.classList.remove('active'));
                qsa('.tab-panel').forEach(p => p.classList.remove('active'));
                btn.classList.add('active');
                doc('pane-' + btn.dataset.tab).classList.add('active');
            };
        });
    }

    function openEditModal() {
        doc('editModal').style.display = 'flex';
        // Fill form...
    }

    // Run
    document.addEventListener('DOMContentLoaded', initProfilePage);

})();
