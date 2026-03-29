/**
 * profile.js – Blink Next-Gen Profile v4.0 (Unique UI)
 * Masonry Grid, Tab Sliders, Hero Animations
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
        handle:      document.getElementById('profileHandle'),
        displayName: document.getElementById('profileDisplayName'),
        bio:         document.getElementById('profileBio'),
        avatar:      document.getElementById('profileAvatar'),
        posts:       document.getElementById('postsCount'),
        followers:   document.getElementById('followersCount'),
        following:   document.getElementById('followingCount'),
        editBtn:     document.getElementById('editProfileBtn'),
        grid:        document.getElementById('postGrid'),
        modal:       document.getElementById('editProfileModal'),
        form:        document.getElementById('editProfileForm'),
        closeModal:  document.getElementById('closeEditModalBtn'),
        tabBtns:     document.querySelectorAll('.tab-btn'),
        slider:      document.getElementById('tabSlider')
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
        elements.handle.textContent      = '@' + u.username;
        elements.displayName.textContent = u.display_name || u.username;
        elements.bio.textContent         = u.bio || 'This creator hasn\'t shared their universe vision yet.';
        
        // Animated Stats (Task 3)
        animateValue(elements.posts, u.posts_count || 0);
        animateValue(elements.followers, u.followers_count || 0);
        animateValue(elements.following, u.following_count || 0);

        const photo = u.profile_pic || u.avatar_url || u.profile_photo;
        if (photo) {
            elements.avatar.innerHTML = `<img src="${photo}" alt="${u.username}" style="width:100%;height:100%;object-fit:cover;">`;
            elements.avatar.style.background = 'transparent';
        } else {
            elements.avatar.textContent = (u.username || 'U')[0].toUpperCase();
        }

        if (!isOwner && elements.editBtn) {
            elements.editBtn.innerHTML = '<i class="bi bi-person-plus-fill"></i> Experience Follow';
            elements.editBtn.onclick = () => followUser(u.id);
        }
    }

    function animateValue(obj, end, duration = 1000) {
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

    // ── 3. TABS & MASONRY ───────────────────────────────────── (Task 5 & 6)
    async function switchTab(tabName, btn) {
        // Move slider
        const rect = btn.getBoundingClientRect();
        const headerRect = btn.parentElement.getBoundingClientRect();
        elements.slider.style.width = `${btn.offsetWidth}px`;
        elements.slider.style.left = `${btn.offsetLeft}px`;

        elements.tabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Fetch Grid
        loadGrid(tabName);
    }

    async function loadGrid(type) {
        elements.grid.innerHTML = '<div style="grid-column: 1 / -1; padding:100px; text-align:center;"><div class="loader"></div></div>';
        try {
            const data = await apiRequest(`/users/${targetUserId}/posts?type=${type}`);
            renderMasonry(data.posts || []);
        } catch (err) {
            elements.grid.innerHTML = '<p class="error">Universe content failed to load.</p>';
        }
    }

    function renderMasonry(posts) {
        if (!posts.length) {
            elements.grid.innerHTML = `
                <div style="grid-column: 1 / -1; padding: 100px; text-align: center; color: var(--text-muted); opacity: 0.2;">
                    <i class="bi bi-stars" style="font-size: 80px; display: block; margin-bottom: 20px;"></i>
                    <p>No visions found in this sector.</p>
                </div>
            `;
            return;
        }

        elements.grid.innerHTML = posts.map(p => `
            <div class="masonry-item animate-fade-in" onclick="window.location.href='index.html?p=${p.id}'">
                <img src="${p.media_url}" alt="Blink" loading="lazy">
                <div class="masonry-overlay">
                    <span style="font-weight:700;"><i class="bi bi-heart-fill" style="color:#ff3b30;"></i> ${p.likes_count || 0}</span>
                    <span style="background:rgba(255,255,255,0.1); padding:4px 8px; border-radius:4px; font-size:10px; font-weight:800; text-transform:uppercase;">
                        ${p.media_type === 'video' ? 'Reel' : 'Post'}
                    </span>
                </div>
            </div>
        `).join('');
    }

    // ── 4. INTERACTIONS ────────────────────────────────────────
    elements.tabBtns.forEach(btn => {
        btn.onclick = () => switchTab(btn.dataset.tab, btn);
    });

    if (elements.editBtn && isOwner) {
        elements.editBtn.onclick = () => {
            elements.modal.classList.add('show');
            const user = getUser();
            elements.form.display_name.value = user.display_name || '';
            elements.form.bio.value = user.bio || '';
            elements.form.website.value = user.website || '';
        };
    }

    if (elements.closeModal) elements.closeModal.onclick = () => elements.modal.classList.remove('show');

    if (elements.form) {
        elements.form.onsubmit = async (e) => {
            e.preventDefault();
            const btn = elements.form.querySelector('button');
            const oldText = btn.textContent;
            btn.innerHTML = '<div class="loader" style="width:16px;height:16px;"></div> Modifying Universe...';
            btn.disabled = true;

            const body = {
                display_name: elements.form.display_name.value,
                bio: elements.form.bio.value,
                website: elements.form.website.value
            };

            try {
                const res = await apiRequest('/users/profile', { method: 'PUT', body: JSON.stringify(body) });
                showToast('🚀 Profile universe updated!', 'success');
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
