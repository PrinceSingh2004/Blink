/**
 * profile.js – Profile Management v3
 * ═══════════════════════════════════════════════════════════
 * Matches Backend v3 API & Unified Blink Helper
 * ═══════════════════════════════════════════════════════════
 */

document.addEventListener('DOMContentLoaded', async () => {
    // ── 1. HELPERS ───────────────────────────────────────────────
    if (!window.Blink) return console.error('[Blink] auth.js not loaded');
    const { getToken, getUser, setAuth, logout, requireAuth, apiRequest, showToast } = window.Blink;
    
    if (!requireAuth()) return;

    const me = getUser();
    const urlParams = new URLSearchParams(window.location.search);
    const targetId = urlParams.get('id') || me.id;
    const isOwner = parseInt(targetId) === parseInt(me.id);

    // DOM Elements
    const pUsername = document.getElementById('pUsername');
    const pBio = document.getElementById('pBio');
    const pAvatar = document.getElementById('profileAvatar');
    const avatarInitial = document.getElementById('avatarInitial');
    const sVideos = document.getElementById('sVideos');
    const sFollowers = document.getElementById('sFollowers');
    const sFollowing = document.getElementById('sFollowing');
    const loader = document.getElementById('loader');
    const errorArea = document.getElementById('errorArea');
    const editBtn = document.getElementById('editBtn');
    const followBtn = document.getElementById('followBtn'); // Assuming it exists or I should add it

    // Hide/Show owner-only buttons
    if (!isOwner) {
        if (editBtn) editBtn.style.display = 'none';
        const deleteBtn = document.getElementById('deleteBtn');
        if (deleteBtn) deleteBtn.style.display = 'none';
        const passwordBtn = document.getElementById('passwordBtn');
        if (passwordBtn) passwordBtn.style.display = 'none';
    }

    // ── 2. LOAD PROFILE ──────────────────────────
    async function loadProfile() {
        if (loader) loader.classList.remove('hidden');
        if (errorArea) errorArea.classList.add('hidden');

        try {
            const data = await apiRequest(`/users/${targetId}`);
            if (data.success) {
                renderUser(data.data);
            } else {
                throw new Error(data.error || 'Failed to load user');
            }
        } catch (err) {
            console.error('[Profile] Error:', err);
            if (errorArea) errorArea.classList.remove('hidden');
            showToast('Failed to load profile.', 'error');
        } finally {
            if (loader) loader.classList.add('hidden');
        }
    }

    function renderUser(u) {
        document.title = `Blink | @${u.username}`;
        if (pUsername) pUsername.textContent = '@' + u.username;
        if (pBio) pBio.textContent = u.bio || 'No bio yet.';
        if (sVideos) sVideos.textContent = u.posts_count || 0;
        if (sFollowers) sFollowers.textContent = u.followers_count || 0;
        if (sFollowing) sFollowing.textContent = u.following_count || 0;

        const photo = u.profile_pic || u.avatar_url || u.profile_photo;
        if (photo) {
            if (pAvatar) {
                pAvatar.src = photo;
                pAvatar.classList.remove('hidden');
            }
            if (avatarInitial) avatarInitial.classList.add('hidden');
        } else {
            if (pAvatar) pAvatar.classList.add('hidden');
            if (avatarInitial) {
                avatarInitial.classList.remove('hidden');
                avatarInitial.textContent = (u.username || 'U')[0].toUpperCase();
            }
        }

        // Handle Follow button if viewing another profile
        if (!isOwner && followBtn) {
            followBtn.style.display = 'block';
            followBtn.textContent = u.is_following ? 'Unfollow' : 'Follow';
            followBtn.className = u.is_following ? 'btn btn-outline' : 'btn btn-primary';
            followBtn.onclick = () => handleFollow(u.id);
        }
    }

    async function handleFollow(userId) {
        try {
            const res = await apiRequest(`/users/${userId}/follow`, { method: 'POST' });
            if (res.success) {
                showToast(res.message, 'success');
                loadProfile(); // Refresh to update counts
            }
        } catch (err) {
            showToast(err.message, 'error');
        }
    }

    // ── 3. MODAL LOGIC (Edit Profile) ───────────────────────────
    const editModal = document.getElementById('editModal');
    const editForm = document.getElementById('editForm');
    const avatarInput = document.getElementById('avatarInput');
    const editPreview = document.getElementById('editPreview');

    if (editBtn) {
        editBtn.addEventListener('click', () => {
            if (!isOwner) return;
            if (editModal) {
                editModal.classList.add('active');
                const uInput = document.getElementById('editUsername');
                const bInput = document.getElementById('editBio');
                if (uInput) uInput.value = pUsername.textContent.replace('@', '');
                if (bInput) bInput.value = pBio.textContent === 'No bio yet.' ? '' : pBio.textContent;
                if (editPreview) editPreview.src = pAvatar?.src || '';
            }
        });
    }

    const cancelEdit = document.getElementById('cancelEdit');
    if (cancelEdit && editModal) {
        cancelEdit.addEventListener('click', () => editModal.classList.remove('active'));
    }

    if (avatarInput && editPreview) {
        avatarInput.addEventListener('change', function() {
            const file = this.files[0];
            if (file) {
                if (file.size > 10 * 1024 * 1024) return showToast('Image too large (max 10MB)', 'error');
                const reader = new FileReader();
                reader.onload = e => editPreview.src = e.target.result;
                reader.readAsDataURL(file);
            }
        });
    }

    if (editForm) {
        editForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('saveEdit');
            if (btn) {
                btn.disabled = true;
                btn.textContent = 'Saving...';
            }

            const formData = new FormData();
            formData.append('username', document.getElementById('editUsername')?.value || '');
            formData.append('bio', document.getElementById('editBio')?.value || '');
            if (avatarInput && avatarInput.files[0]) {
                formData.append('avatar', avatarInput.files[0]);
            }

            try {
                // Use fetch directly for FormData to avoid manual Content-Type set in apiRequest
                const res = await fetch(window.Blink.API + '/users/profile', {
                    method: 'PUT',
                    headers: { 'Authorization': 'Bearer ' + getToken() },
                    body: formData
                });

                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Update failed');

                if (data.success) {
                    showToast('Profile updated! ✨', 'success');
                    if (editModal) editModal.classList.remove('active');
                    loadProfile();
                    
                    // Update header/sidebar
                    window.Blink.populateSidebar();
                }
            } catch (err) {
                showToast(err.message, 'error');
            } finally {
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = 'Save Changes';
                }
            }
        });
    }

    // ── 4. CHANGE PASSWORD & DELETE (Omitted for brevity if UI doesn't match API exactly) ───
    // These would follow the same pattern as above using apiRequest('/users/...')

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.onclick = (e) => {
            e.preventDefault();
            logout();
        };
    }

    // Init
    loadProfile();
});
