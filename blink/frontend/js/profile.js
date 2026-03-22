/* profile.js – Profile and Edit Profile page */
document.addEventListener('DOMContentLoaded', async () => {
const { getToken, getUser, requireAuth, apiRequest, showToast, populateSidebar } = window.Blink;

await populateSidebar();


// ── Helpers ───────────────────────────────────────────────────
function fmt(n) {
    const v = parseInt(n) || 0;
    if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M';
    if (v >= 1_000)     return (v / 1_000).toFixed(1) + 'K';
    return String(v);
}
function getUrlParam(k) { return new URLSearchParams(window.location.search).get(k); }
function timeAgo(dateStr) {
    const sec = Math.floor((Date.now() - new Date(dateStr)) / 1000);
    if (sec < 60)   return 'just now';
    if (sec < 3600) return Math.floor(sec/60)  + 'm ago';
    if (sec < 86400)return Math.floor(sec/3600) + 'h ago';
    return Math.floor(sec/86400) + 'd ago';
}

// ═══ PROFILE PAGE ════════════════════════════════════════════
if (document.getElementById('profilePage')) {
    const me = getUser();
    let targetId = getUrlParam('id');

    // Handle string 'null' or missing ID
    if (!targetId || targetId === 'null') {
        targetId = (me && me.id);
    }

    if (!targetId) { window.location.href = '/pages/login.html'; return; }

    const isOwnProfile = me && parseInt(targetId) === parseInt(me.id);
    let isFollowing = false;

    // Render user profile
    async function loadProfile() {
        try {
            const data = await apiRequest(`/users/${targetId}`);
            const u    = data.user;
            document.title = `Blink | @${u.username}`;
            document.getElementById('profileUsername').textContent = u.username;
            document.getElementById('profileHandle').textContent   = '@' + u.username;
            document.getElementById('profileBio').textContent      = u.bio || 'No bio yet.';
            document.getElementById('statFollowers').textContent   = fmt(u.followers_count);
            document.getElementById('statFollowing').textContent   = fmt(u.following_count);
            document.getElementById('statLikes').textContent       = fmt(u.total_likes);


            const statusEl = document.getElementById('profileOnlineStatus');
            if (statusEl) {
                statusEl.setAttribute('data-online-user-id', u.id);
                // Check status via socket if it's already connected
                if (window.Blink.socket) {
                    window.Blink.socket.emit('check_status', u.id);
                } else {
                    // Try again in a bit if socket is still connecting
                    setTimeout(() => window.Blink.socket?.emit('check_status', u.id), 1000);
                }
            }

            if (u.is_live) {
                document.getElementById('profileLiveBadge')?.classList.add('active');
            }

            const avatarEl = document.getElementById('profileAvatar');
            const initialEl = document.getElementById('profileAvatarInitial');
            
            if (u.profile_photo) {
                avatarEl.src = u.profile_photo;
                avatarEl.style.display = 'block';
                if (initialEl) initialEl.style.display = 'none';
            } else {
                avatarEl.style.display = 'none';
                if (initialEl) {
                    initialEl.style.display = 'block';
                    initialEl.textContent = (u.username || 'U')[0].toUpperCase();
                }
            }

            // Make avatar clickable to edit if it's my profile
            if (isOwnProfile) {
                const wrap = document.getElementById('profileAvatarWrap');
                if (wrap) {
                    wrap.style.cursor = 'pointer';
                    wrap.title = 'Click to change profile photo';
                    wrap.addEventListener('click', () => window.location.href = 'edit-profile.html');
                }
            }

            // Show/hide action buttons
            if (isOwnProfile) {
                document.getElementById('editProfileBtn')?.classList.remove('hidden');
                document.getElementById('goLiveProfileBtn')?.classList.remove('hidden');
            } else if (me) {
                const followBtn = document.getElementById('followBtn');
                followBtn?.classList.remove('hidden');
                // Check follow status
                const s = await apiRequest(`/follow/status/${targetId}`);
                isFollowing = s.following;
                updateFollowBtn();
            }
        } catch (err) { showToast('Failed to load profile', 'error'); }
    }

    function updateFollowBtn() {
        const btn = document.getElementById('followBtn');
        if (!btn) return;
        btn.textContent = isFollowing ? 'Following' : 'Follow';
        btn.className   = `btn ${isFollowing ? 'btn-secondary' : 'btn-primary'} btn-sm`;
    }

    document.getElementById('followBtn')?.addEventListener('click', async () => {
        if (!getToken()) { showToast('Sign in to follow users'); return; }
        try {
            if (isFollowing) {
                await apiRequest(`/follow/${targetId}`, { method: 'DELETE' });
                isFollowing = false;
                const el = document.getElementById('statFollowers');
                el.textContent = fmt(parseInt(el.textContent.replace(/\D/g,'')) - 1);
                showToast('Unfollowed');
            } else {
                await apiRequest(`/follow/${targetId}`, { method: 'POST' });
                isFollowing = true;
                const el = document.getElementById('statFollowers');
                el.textContent = fmt(parseInt(el.textContent.replace(/\D/g,'')) + 1);
                showToast('Following!');
            }
            updateFollowBtn();
        } catch (err) { showToast(err.message, 'error'); }
    });

    document.getElementById('editProfileBtn')?.addEventListener('click', () => {
        window.location.href = '/pages/edit-profile.html';
    });

    // ─── MOBILE LOGOUT BTN & MODAL ────────────────────────────────
    const mobileLogoutBtn = document.getElementById('mobileLogoutBtn');
    const logoutConfirmModal = document.getElementById('logoutConfirmModal');
    const cancelLogoutBtn = document.getElementById('cancelLogoutBtn');
    const confirmLogoutBtn = document.getElementById('confirmLogoutBtn');

    if (mobileLogoutBtn && logoutConfirmModal) {
        // Only show button if browsing your OWN profile
        if (isOwnProfile) {
            mobileLogoutBtn.classList.remove('hidden');
        }

        mobileLogoutBtn.addEventListener('click', () => {
            logoutConfirmModal.classList.add('open');
        });
        
        cancelLogoutBtn?.addEventListener('click', () => {
            logoutConfirmModal.classList.remove('open');
        });

        // Close on backdrop click
        logoutConfirmModal.addEventListener('click', (e) => {
            if (e.target === logoutConfirmModal) {
                logoutConfirmModal.classList.remove('open');
            }
        });

        confirmLogoutBtn?.addEventListener('click', () => {
            logoutConfirmModal.classList.remove('open');
            // Execute logout
            localStorage.removeItem('blink_token');
            localStorage.removeItem('blink_user');
            sessionStorage.clear();
            window.location.replace('/pages/login.html');
        });
    }

    // Load videos
    async function loadVideos() {
        const grid = document.getElementById('videoGrid');
        try {
            const data = await apiRequest(`/videos/user/${targetId}`);
            if (!data.videos.length) {
                grid.innerHTML = '<div class="tab-empty"><div class="icon"><i class="bi bi-camera-reels-fill"></i></div><h3>No Videos Yet</h3><p>Upload your first video!</p></div>';
                return;
            }
            grid.innerHTML = '';
            if (isOwnProfile) {
                const addBtn = document.createElement('div');
                addBtn.className = 'grid-video-item grid-add-btn';
                addBtn.innerHTML = '<i class="bi bi-plus-lg"></i><span>New Video</span>';
                addBtn.onclick = () => window.location.href = '/pages/upload.html';
                grid.appendChild(addBtn);
            }
            data.videos.forEach(v => {
                const item = document.createElement('div');
                item.className = 'grid-video-item';
                item.innerHTML = `
                    <video src="${v.video_url}" loop muted playsinline preload="none"></video>
                    <div class="grid-play-count"><i class="bi bi-heart-fill"></i> ${fmt(v.likes_count)}</div>
                `;

                if (isOwnProfile) {
                    const delBtn = document.createElement('button');
                    delBtn.className = 'btn-grid-delete';
                    delBtn.innerHTML = '<i class="bi bi-trash3-fill"></i>';
                    delBtn.title = 'Delete Video';
                    delBtn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        if (!confirm('Are you sure you want to delete this video?')) return;
                        try {
                            await apiRequest(`/videos/${v.id}`, { method: 'DELETE' });
                            item.remove();
                            showToast('Video deleted');
                        } catch (err) { showToast(err.message, 'error'); }
                    });
                    item.appendChild(delBtn);
                }

                const vid = item.querySelector('video');
                item.addEventListener('mouseenter', () => vid.play().catch(() => {}));
                item.addEventListener('mouseleave', () => { vid.pause(); vid.currentTime = 0; });
                grid.appendChild(item);
            });
        } catch { grid.innerHTML = '<div class="tab-empty"><h3>Failed to load videos</h3></div>'; }
    }

    // Tabs
    document.querySelectorAll('.profile-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.profile-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-panel').forEach(p => p.style.display = 'none');
            tab.classList.add('active');
            const panel = document.getElementById('panel-' + tab.dataset.tab);
            if (panel) panel.style.display = '';
        });
        tab.addEventListener('keydown', e => { if (e.key === 'Enter') tab.click(); });
    });

    // Load mini live discovery
    async function loadLiveDiscovery() {
        const disc = document.getElementById('profileLiveDiscovery');
        const grid = document.getElementById('profileLiveGrid');
        if (!disc || !grid) return;

        try {
            const data = await apiRequest('/live/now');
            const streams = data.streams || [];
            
            // Filter out the current user if they are live
            const otherStreams = streams.filter(s => parseInt(s.user_id) !== parseInt(me.id));

            if (otherStreams.length) {
                disc.style.display = 'block';
                grid.innerHTML = otherStreams.map(s => `
                    <div class="live-mini-card" onclick="window.location.href='live.html?id=${s.stream_id}'" style="cursor:pointer;">
                        <div class="live-mini-badge">LIVE</div>
                        <div class="live-mini-avatar">
                            <img src="${s.profile_photo || `https://i.pravatar.cc/100?u=${s.user_id}`}" alt="">
                        </div>
                        <div class="live-mini-username">@${s.username}</div>
                    </div>
                `).join('');
            } else {
                disc.style.display = 'none';
            }
        } catch {}
    }

    loadProfile();
    loadVideos();
    loadLiveDiscovery();
}

    // Real-time updates for discovery grid
    if (window.Blink.socket) {
        window.Blink.socket.on('profile_updated', () => {
            console.log('[Blink] Remote profile update detected, refreshing discovery...');
            if (typeof loadLiveDiscovery === 'function') loadLiveDiscovery();
        });
    }

// ─── GO LIVE PROFILE BTN ──────────────────────────────────────
document.getElementById('goLiveProfileBtn')?.addEventListener('click', () => {
    window.location.href = '/pages/live.html';
});

// ═══ EDIT PROFILE PAGE ═══════════════════════════════════════
if (document.getElementById('editProfilePage')) {
    if (!requireAuth()) throw new Error('Auth required');

    const me = getUser();
    let cropper = null;
    let croppedBlob = null;

    // Load current data
    async function loadCurrentProfile() {
        try {
            const data = await apiRequest(`/users/${me.id}`);
            const u = data.user;
            document.getElementById('editUsername').value = u.username || '';
            document.getElementById('editBio').value      = u.bio   || '';
            const prev = document.getElementById('avatarPreview');
            if (u.profile_photo) { 
                prev.src = u.profile_photo; 
                prev.style.display = 'block'; 
                document.getElementById('avatarInitial').style.display = 'none'; 
            } else { 
                document.getElementById('avatarInitial').textContent = (u.username||'U')[0].toUpperCase(); 
            }
        } catch {}
    }
    loadCurrentProfile();

    // Cropper Workflow
    const avatarInput   = document.getElementById('avatarInput');
    const cropperModal  = document.getElementById('cropperModal');
    const cropperTarget = document.getElementById('cropperTarget');
    const saveCropBtn   = document.getElementById('saveCropBtn');
    const cancelCropBtn = document.getElementById('cancelCropBtn');

    avatarInput?.addEventListener('change', function () {
        const file = this.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = e => {
            cropperTarget.src = e.target.result;
            cropperModal.style.display = 'flex';
            if (cropper) cropper.destroy();
            cropper = new Cropper(cropperTarget, {
                aspectRatio: 1,
                viewMode: 1,
                background: false
            });
        };
        reader.readAsDataURL(file);
    });

    cancelCropBtn?.addEventListener('click', () => {
        cropperModal.style.display = 'none';
        avatarInput.value = '';
    });

    saveCropBtn?.addEventListener('click', () => {
        if (!cropper) return;
        const canvas = cropper.getCroppedCanvas({ width: 300, height: 300 });
        canvas.toBlob(blob => {
            croppedBlob = blob;
            // Show preview
            const reader = new FileReader();
            reader.onload = e => {
                const prev = document.getElementById('avatarPreview');
                prev.src = e.target.result;
                prev.style.display = 'block';
                document.getElementById('avatarInitial').style.display = 'none';
            };
            reader.readAsDataURL(blob);
            cropperModal.style.display = 'none';
        }, 'image/jpeg', 0.85);
    });

    document.getElementById('uploadAvatarBtn')?.addEventListener('click', async () => {
        if (!croppedBlob) { showToast('Please choose and crop a photo first', 'error'); return; }
        const btn = document.getElementById('uploadAvatarBtn');
        btn.disabled = true;
        const formData = new FormData();
        formData.append('avatar', croppedBlob, 'avatar.jpg');
        try {
            // Production Endpoint: Always uses the root-level upload route
            const res  = await fetch('/upload-profile', { 
                method: 'POST', 
                headers: { 'Authorization': `Bearer ${getToken()}` }, 
                body: formData 
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            const user = window.Blink.getUser();
            user.profile_photo = data.profile_photo;
            localStorage.setItem('blink_user', JSON.stringify(user));
            await window.Blink.populateSidebar();
            
            // Broadcast the update via socket
            if (window.Blink.socket) {
                window.Blink.socket.emit('profile_updated', { userId: user.id });
            }

            showToast('Avatar updated successfully!', 'success');
            croppedBlob = null;
        } catch (err) { showToast(err.message, 'error'); }
        finally { btn.disabled = false; }
    });

    // Update profile form
    document.getElementById('updateProfileForm')?.addEventListener('submit', async e => {
        e.preventDefault();
        const btn = document.getElementById('updateProfileBtn');
        btn.disabled = true;
        try {
            const data = await apiRequest('/users/profile/update', {
                method: 'PUT',
                body: JSON.stringify({
                    username: document.getElementById('editUsername').value.trim(),
                    bio:      document.getElementById('editBio').value.trim()
                })
            });
            const curUser = window.Blink.getUser();
            Object.assign(curUser, { username: data.user.username, bio: data.user.bio });
            localStorage.setItem('blink_user', JSON.stringify(curUser));
            showToast('Profile updated!', 'success');
        } catch (err) { showToast(err.message, 'error'); }
        finally { btn.disabled = false; }
    });

    // Change password form
    document.getElementById('changePasswordForm')?.addEventListener('submit', async e => {
        e.preventDefault();
        const btn      = document.getElementById('changePwBtn');
        const newPw    = document.getElementById('newPasswordInput').value;
        const confirmPw= document.getElementById('confirmPasswordInput').value;
        if (newPw !== confirmPw) { showToast('Passwords do not match', 'error'); return; }
        btn.disabled = true;
        try {
            await apiRequest('/users/profile/password', {
                method: 'PUT',
                body: JSON.stringify({
                    current_password: document.getElementById('currentPasswordInput').value,
                    new_password:     newPw
                })
            });
            showToast('Password changed!', 'success');
            e.target.reset();
        } catch (err) { showToast(err.message, 'error'); }
        finally { btn.disabled = false; }
    });

    // Delete account
    document.getElementById('deleteAccountBtn')?.addEventListener('click', async () => {
        const confirm1 = confirm('Are you sure you want to PERMANENTLY delete your account? This will remove all your videos and data.');
        if (!confirm1) return;
        const confirm2 = confirm('Final warning: This action cannot be undone. Proceed with deletion?');
        if (!confirm2) return;

        try {
            await apiRequest('/users/profile', { method: 'DELETE' });
            showToast('Account deleted successfully');
            setTimeout(() => {
                const { logout } = window.Blink;
                logout();
            }, 1500);
        } catch (err) {
            showToast(err.message, 'error');
        }
    });
}


}); // end DOMContentLoaded
