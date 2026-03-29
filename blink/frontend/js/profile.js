/**
 * profile.js – Blink Profile Management v4.0 (UI Optimized)
 * Matches production-level styling in pages.css
 */

document.addEventListener('DOMContentLoaded', async () => {
    if (!window.Blink) return console.error('[Blink] auth.js not loaded');
    const { getToken, getUser, setAuth, logout, requireAuth, apiRequest, showToast } = window.Blink;
    
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
        website:     document.getElementById('profileWebsite'),
        avatar:      document.getElementById('profileAvatar'),
        posts:       document.getElementById('postsCount'),
        followers:   document.getElementById('followersCount'),
        following:   document.getElementById('followingCount'),
        editBtn:     document.getElementById('editProfileBtn'),
        grid:        document.getElementById('postGrid'),
        modal:       document.getElementById('editProfileModal'),
        form:        document.getElementById('editProfileForm'),
        closeModal:  document.getElementById('closeEditModalBtn')
    };

    // Hide edit button if not the owner
    if (!isOwner && elements.editBtn) {
        elements.editBtn.style.display = 'none';
        // TODO: Show Follow button instead
    }

    // ── 1. LOAD PROFILE DATA ────────────────────────────────────
    async function loadProfile() {
        try {
            const data = await apiRequest(`/users/${targetUserId}`);
            if (data.user) {
                renderUser(data.user);
            }
        } catch (err) {
            console.error('[Profile] Error loading user:', err);
            showToast('User not found', 'error');
            if (elements.handle) elements.handle.textContent = 'User Not Found';
        }
    }

    function renderUser(u) {
        document.title = `Blink | @${u.username}`;
        if (elements.handle)      elements.handle.textContent      = '@' + u.username;
        if (elements.displayName) elements.displayName.textContent = u.display_name || u.username;
        if (elements.bio)         elements.bio.textContent         = u.bio || 'No bio yet.';
        if (elements.posts)       elements.posts.textContent       = u.posts_count || 0;
        if (elements.followers)   elements.followers.textContent   = u.followers_count || 0;
        if (elements.following)   elements.following.textContent   = u.following_count || 0;
        
        if (u.website) {
            if (elements.website) {
                elements.website.href = u.website.startsWith('http') ? u.website : 'https://' + u.website;
                elements.website.textContent = u.website.replace(/^https?:\/\//, '');
                elements.website.style.display = 'block';
            }
        } else if (elements.website) {
            elements.website.style.display = 'none';
        }

        const photo = u.profile_pic || u.avatar_url || u.profile_photo;
        if (photo && elements.avatar) {
            elements.avatar.innerHTML = `<img src="${photo}" alt="${u.username}" class="avatar" style="width:100%;height:100%;object-fit:cover;">`;
        } else if (elements.avatar) {
            elements.avatar.textContent = (u.username || 'U')[0].toUpperCase();
        }
    }

    // ── 2. LOAD POST GRID ────────────────────────────────────────
    async function loadGrid() {
        if (!elements.grid) return;
        try {
            const data = await apiRequest(`/users/${targetUserId}/posts`);
            renderGrid(data.posts || []);
        } catch (err) {
            console.warn('[Profile] Failed to load posts:', err.message);
            elements.grid.innerHTML = '<div class="profile-error">Failed to load posts.</div>';
        }
    }

    function renderGrid(posts) {
        if (!posts || posts.length === 0) {
            elements.grid.innerHTML = `
                <div class="profile-error" style="grid-column: 1 / -1;">
                    <i class="bi bi-camera" style="font-size: 48px; opacity: 0.2; margin-bottom: 20px; display: block;"></i>
                    <p style="color: var(--text-muted);">No posts yet.</p>
                </div>
            `;
            return;
        }

        elements.grid.innerHTML = posts.map(p => `
            <div class="grid-item animate-fade-in" onclick="window.location.href='post.html?id=${p.id}'">
                <img src="${p.thumbnail_url || p.media_url}" alt="Blink Post" class="grid-img" loading="lazy">
                <div class="grid-overlay">
                    <span><i class="bi bi-heart-fill"></i> ${p.likes_count || 0}</span>
                    <span><i class="bi bi-chat-fill"></i> ${p.comments_count || 0}</span>
                </div>
            </div>
        `).join('');
    }

    // ── 3. MODAL LOGIC (Edit Profile) ───────────────────────────
    if (elements.editBtn) {
        elements.editBtn.onclick = () => {
            if (elements.modal) {
                elements.modal.classList.add('show');
                // Pre-fill form
                const form = elements.form;
                const user = getUser();
                if (form) {
                    form.display_name.value = elements.displayName?.textContent || '';
                    form.bio.value = elements.bio?.textContent || '';
                    form.website.value = elements.website?.href || '';
                }
            }
        };
    }

    if (elements.closeModal) {
        elements.closeModal.onclick = () => elements.modal.classList.remove('show');
    }

    if (elements.form) {
        elements.form.onsubmit = async (e) => {
            e.preventDefault();
            const btn = elements.form.querySelector('button[type="submit"]');
            if (btn) btn.disabled = true;

            const formData = {
                display_name: elements.form.display_name.value,
                bio:         elements.form.bio.value,
                website:     elements.form.website.value
            };

            try {
                const res = await apiRequest('/users/profile', {
                    method: 'PUT',
                    body: JSON.stringify(formData)
                });
                
                showToast('Profile updated! ✨', 'success');
                elements.modal.classList.remove('show');
                loadProfile();
                window.Blink.populateSidebar();
            } catch (err) {
                showToast(err.message || 'Update failed', 'error');
            } finally {
                if (btn) btn.disabled = false;
            }
        };
    }

    // ── 4. INITIALIZE ───────────────────────────────────────────
    await loadProfile();
    await loadGrid();
});
