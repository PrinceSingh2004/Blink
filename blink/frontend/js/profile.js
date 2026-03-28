/**
 * profile.js – Profile Management (Clean Rebuild)
 * ═══════════════════════════════════════════════════════════
 * Real-time UI updates, secure auth handling, persistent images
 * ═══════════════════════════════════════════════════════════
 */

document.addEventListener('DOMContentLoaded', async () => {
    // ── 1. HELPERS ───────────────────────────────────────────────
    const { getToken, getUser, setToken, setUser, requireAuth, apiRequest, showToast, clearAuth } = window.Blink;
    if (!requireAuth()) return;

    const me = getUser();
    const targetId = new URLSearchParams(window.location.search).get('id') || me.id;
    const isOwner = parseInt(targetId) === parseInt(me.id);

    // DOM Elements
    const pUsername = document.getElementById('pUsername');
    const pBio = document.getElementById('pBio');
    const pAvatar = document.getElementById('profileAvatar');
    const sVideos = document.getElementById('sVideos');
    const sFollowers = document.getElementById('sFollowers');
    const sFollowing = document.getElementById('sFollowing');
    const loader = document.getElementById('loader');
    const errorArea = document.getElementById('errorArea');

    // ── 2. LOAD PROFILE (With Timeout) ──────────────────────────
    async function loadProfile() {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 6000); // 6s timeout

            const res = await fetch(`/api/user/profile/${targetId}`, {
                headers: { 'Authorization': 'Bearer ' + getToken() },
                signal: controller.signal
            });

            clearTimeout(timeout);
            const data = await res.json();

            if (!res.ok) throw new Error(data.error || 'Failed to load');

            renderUser(data);
            loader.classList.add('hidden');
        } catch (err) {
            console.error('[Profile] Error:', err);
            loader.classList.add('hidden');
            errorArea.classList.remove('hidden');
            showToast('Failed to load profile. Connection timed out.', 'error');
        }
    }

    function renderUser(u) {
        document.title = `Blink | @${u.username}`;
        pUsername.textContent = '@' + u.username;
        pBio.textContent = u.bio || 'No bio yet.';
        sVideos.textContent = u.videos_count || 0;
        sFollowers.textContent = u.followers_count || 0;
        sFollowing.textContent = u.following_count || 0;

        if (u.avatar_url) {
            pAvatar.src = u.avatar_url;
            pAvatar.classList.remove('hidden');
            document.getElementById('avatarInitial').classList.add('hidden');
        } else {
            pAvatar.classList.add('hidden');
            const initial = document.getElementById('avatarInitial');
            initial.classList.remove('hidden');
            initial.textContent = u.username[0].toUpperCase();
        }
    }

    // ── 3. MODAL LOGIC (Edit Profile) ───────────────────────────
    const editModal = document.getElementById('editModal');
    const editForm = document.getElementById('editForm');
    const avatarInput = document.getElementById('avatarInput');
    const editPreview = document.getElementById('editPreview');

    document.getElementById('editBtn')?.addEventListener('click', () => {
        if (!isOwner) return showToast('You cannot edit this profile', 'error');
        editModal.classList.add('active');
        document.getElementById('editUsername').value = pUsername.textContent.replace('@', '');
        document.getElementById('editBio').value = pBio.textContent === 'No bio yet.' ? '' : pBio.textContent;
        editPreview.src = pAvatar.src || '';
    });

    document.getElementById('cancelEdit')?.addEventListener('click', () => editModal.classList.remove('active'));

    avatarInput.addEventListener('change', function() {
        const file = this.files[0];
        if (file) {
            if (file.size > 5 * 1024 * 1024) return showToast('Image too large (max 5MB)', 'error');
            const reader = new FileReader();
            reader.onload = e => editPreview.src = e.target.result;
            reader.readAsDataURL(file);
        }
    });

    editForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('saveEdit');
        btn.disabled = true;
        btn.textContent = 'Saving...';

        const formData = new FormData();
        formData.append('username', document.getElementById('editUsername').value);
        formData.append('bio', document.getElementById('editBio').value);
        if (avatarInput.files[0]) formData.append('avatar', avatarInput.files[0]);

        try {
            const res = await fetch('/api/user/update-profile', {
                method: 'PUT',
                headers: { 'Authorization': 'Bearer ' + getToken() },
                body: formData
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Update failed');

            // Update UI instantly
            renderUser(data.user);
            showToast('Profile updated! ✨', 'success');
            editModal.classList.remove('active');
            
            // Re-sync local user storage
            const updatedUser = { ...getUser(), ...data.user };
            setUser(updatedUser);
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Save Changes';
        }
    });

    // ── 4. CHANGE PASSWORD ──────────────────────────────────────
    const passModal = document.getElementById('passwordModal');
    const passForm = document.getElementById('passwordForm');
    
    document.getElementById('passwordBtn')?.addEventListener('click', () => passModal.classList.add('active'));
    document.getElementById('cancelPass')?.addEventListener('click', () => passModal.classList.remove('active'));

    passForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const oldP = document.getElementById('oldPass').value;
        const newP = document.getElementById('newPass').value;

        try {
            await apiRequest('/api/user/change-password', {
                method: 'PUT',
                body: JSON.stringify({ old_password: oldP, new_password: newP })
            });
            showToast('Password updated successfully', 'success');
            passModal.classList.remove('active');
            passForm.reset();
        } catch (err) { showToast(err.message, 'error'); }
    });

    // ── 5. DELETE ACCOUNT ───────────────────────────────────────
    document.getElementById('deleteBtn')?.addEventListener('click', async () => {
        if (!confirm('🚨 CRITICAL: Are you sure you want to delete your account? This cannot be undone.')) return;
        
        try {
            await apiRequest('/api/user/delete', { method: 'DELETE' });
            showToast('Account deleted. Goodbye!', 'info');
            setTimeout(() => { clearAuth(); window.location.href = 'login.html'; }, 1000);
        } catch (err) { showToast(err.message, 'error'); }
    });

    document.getElementById('logoutBtn')?.addEventListener('click', () => {
        clearAuth();
        window.location.href = 'login.html';
    });

    // Init
    loadProfile();
});
