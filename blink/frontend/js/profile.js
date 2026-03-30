/**
 * profile.js – Blink Universe Profile v5.0
 * Vertical Stack, Overlapping Avatar, Premium Neon Stats
 */

document.addEventListener('DOMContentLoaded', async () => {
    // ── 1. HELPERS & AUTH ───────────────────────────────────────
    if (!window.Blink) return console.error('[Blink] auth.js not loaded');
    const { getToken, getUser, requireAuth, apiRequest, showToast } = window.Blink;
    
    if (!requireAuth()) return;

    const me = getUser();
    const urlParams = new URLSearchParams(window.location.search);
    const targetUserId = urlParams.get('id') || me.id;
    const isOwner = parseInt(targetUserId) === parseInt(me.id);

    // --- DOM Elements ---
    const elements = {
        username:    document.getElementById('profileUsername'),
        handle:      document.getElementById('profileHandle'),
        bio:         document.getElementById('profileBio'),
        avatar:      document.querySelector('.profile-avatar-giant img'),
        posts:       document.querySelector('.stat-box.active .stat-value'),
        followers:   document.getElementById('followersCount'),
        following:   document.getElementById('followingCount'),
        likes:       document.getElementById('likesCount'),
        editBtn:     document.getElementById('editProfileBtn'),
        grid:        document.getElementById('postGrid'),
        modal:       document.getElementById('editProfileModal'),
        form:        document.getElementById('editProfileForm'),
        closeModal:  document.getElementById('closeEditModalBtn'),
        tabBtns:     document.querySelectorAll('.tab-item'),
    };

    // ── 2. INITIAL LOAD ───────────────────────────────────────── (Task 8)
    async function loadIdentity() {
        try {
            const data = await apiRequest(`/users/${targetUserId}`);
            if (data.data) {
                renderIdentity(data.data);
            }
        } catch (err) {
            console.error('[Profile] Identity fail:', err);
            showToast('User connectivity lost.', 'error');
        }
    }

    function renderIdentity(u) {
        document.title = `Blink | @${u.username}`;
        if (elements.username) elements.username.textContent = u.display_name || u.username;
        if (elements.handle) elements.handle.textContent = '@' + u.username;
        if (elements.bio) elements.bio.textContent = u.bio || 'The artist\'s canvas. User hasn\'t shared their universe vision yet.';
        
        // Animated Stats
        animateValue(elements.posts, u.posts_count || 0);
        animateValue(elements.followers, u.followers_count || 0);
        animateValue(elements.following, u.following_count || 0);
        if (elements.likes) animateValue(elements.likes, u.likes_count || 0);

        const photo = u.profile_pic || u.avatar_url || u.profile_photo;
        if (photo && elements.avatar) {
            elements.avatar.src = photo;
        }
        
        if (!isOwner && elements.editBtn) {
            elements.editBtn.innerHTML = 'Follow';
            elements.editBtn.className = 'btn-primary-gradient';
            elements.editBtn.onclick = () => followUser(u.id);
        }
    }

    function animateValue(obj, end, duration = 1000) {
        if (!obj) return;
        let start = 0;
        let range = end - start;
        let increment = end > start ? 1 : -1;
        let stepTime = Math.abs(Math.floor(duration / range));
        let timer = setInterval(() => {
            start += increment;
            obj.innerHTML = start;
            if (start == end) clearInterval(timer);
        }, isFinite(stepTime) ? stepTime : 10);
    }

    // ── 3. TABS & MASONRY ─────────────────────────────────────
    async function switchTab(tabName, btn) {
        if (!btn) return;
        elements.tabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Fetch Grid
        loadGrid(tabName);
    }

    async function loadGrid(type) {
        elements.grid.innerHTML = '<div style="grid-column: 1 / -1; padding:100px; text-align:center;"><div class="loader"></div></div>';
        try {
            const data = await apiRequest(`/users/${targetUserId}/posts?type=${type}`);
            renderFeed(data.posts || []);
        } catch (err) {
            elements.grid.innerHTML = '<p class="error">Universe content failed to load.</p>';
        }
    }

    function renderFeed(posts) {
        if (!posts.length) {
            elements.grid.innerHTML = `
                <div class="empty-state">
                    <i class="bi bi-collection-play"></i>
                    <p>Share your story with the world</p>
                </div>
            `;
            return;
        }

        elements.grid.innerHTML = posts.map(p => `
            <div class="grid-item-blink animate-fade-in" onclick="window.location.href='index.html?p=${p.id}'">
                ${p.media_type === 'video' ? `<video src="${p.media_url}"></video>` : `<img src="${p.media_url}" loading="lazy">`}
                <div class="grid-overlay">
                    <span><i class="bi bi-play-fill"></i> ${p.likes_count || 0}</span>
                </div>
            </div>
        `).join('');
    }

    // ── 4. INTERACTIONS ────────────────────────────────────────
    elements.tabBtns.forEach(btn => {
        btn.onclick = () => switchTab(btn.textContent.toLowerCase(), btn);
    });

    if (elements.editBtn && isOwner) {
        elements.editBtn.onclick = () => {
            elements.modal.classList.add('show');
            const user = getUser();
            elements.form.display_name.value = user.display_name || '';
            elements.form.bio.value = user.bio || '';
        };
    }

    if (elements.closeModal) elements.closeModal.onclick = () => elements.modal.classList.remove('show');

    if (elements.form) {
        elements.form.onsubmit = async (e) => {
            e.preventDefault();
            const btn = elements.form.querySelector('button');
            const oldText = btn.textContent;
            btn.innerHTML = '<div class="loader" style="width:16px;height:16px;"></div> Updating...';
            btn.disabled = true;

            const body = {
                display_name: elements.form.display_name.value,
                bio: elements.form.bio.value
            };

            try {
                await apiRequest('/users/profile', { method: 'PUT', body: JSON.stringify(body) });
                showToast('🚀 Identity updated!', 'success');
                elements.modal.classList.remove('show');
                loadIdentity();
                window.Blink.populateSidebar();
            } catch (err) {
                showToast(err.message, 'error');
            } finally {
                btn.textContent = oldText;
                btn.disabled = false;
            }
        };
    }

    const followUser = async (id) => {
        try {
            const res = await apiRequest(`/users/follow/${id}`, { method: 'POST' });
            showToast(res.following ? 'Joined vision universe!' : 'Left vision universe.', 'info');
            loadIdentity();
        } catch {}
    };

    // --- Start ---
    await loadIdentity();
    switchTab('videos', elements.tabBtns[0]); // Default tab
});
