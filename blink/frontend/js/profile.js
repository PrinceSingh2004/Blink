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

/**
 * Validate an image file before upload.
 * Returns { valid: boolean, error: string }
 */
function validateImageFile(file) {
    if (!file) return { valid: false, error: 'No file selected' };

    // Check type
    const allowedTypes = [
        'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
        'image/gif', 'image/heic', 'image/heif', 'image/bmp'
    ];
    const isImage = allowedTypes.includes(file.type) || file.type.startsWith('image/');
    if (!isImage) {
        return { valid: false, error: 'Please select an image file (JPG, PNG, or WebP)' };
    }

    // Check size (10MB client limit — server will resize)
    const MAX_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
        return { valid: false, error: `Image too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max 10MB.` };
    }

    // Warn about very large files (mobile)
    if (file.size > 5 * 1024 * 1024) {
        console.log('[Upload] Large file detected:', (file.size / 1024 / 1024).toFixed(1) + 'MB — server will compress');
    }

    return { valid: true, error: '' };
}

/**
 * Add cache-bust parameter to a URL
 */
function bustCache(url) {
    if (!url) return url;
    const separator = url.includes('?') ? '&' : '?';
    return url + separator + 'v=' + Date.now();
}

/**
 * Update ALL avatar images on the page to show the new URL
 */
function setAvatarSrc(url) {
    const ids = ['profilePhoto'];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el && url) {
            el.src = bustCache(url);
            el.style.display = 'block';
        }
    });
    // Update sidebar avatar too
    populateSidebar();
}

/**
 * Show upload loading spinner on avatar
 */
function showAvatarLoading() {
    const overlay = document.getElementById('avatarLoadingOverlay');
    if (overlay) overlay.classList.add('active');
    const wrap = document.getElementById('profileAvatarWrap');
    if (wrap) wrap.style.pointerEvents = 'none';
}

/**
 * Hide upload loading spinner
 */
function hideAvatarLoading() {
    const overlay = document.getElementById('avatarLoadingOverlay');
    if (overlay) overlay.classList.remove('active');
    const wrap = document.getElementById('profileAvatarWrap');
    if (wrap) wrap.style.pointerEvents = '';
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

    const isOwnProfile = me && String(targetId) === String(me.id);
    console.log('[Profile] Viewing:', targetId, ' Me:', me?.id, ' Own:', isOwnProfile);
    let isFollowing = false;

    // Render user profile
    async function loadProfile() {
        const usernameEl = document.getElementById('profileUsername');
        const handleEl   = document.getElementById('profileHandle');
        const bioEl     = document.getElementById('profileBio');
        const followersEl = document.getElementById('statFollowers');
        const followingEl = document.getElementById('statFollowing');
        const videoCountEl = document.getElementById('videoCount');

        try {
            // Set a timeout for the fetch
            const fetchPromise = apiRequest(`/users/${targetId}`);
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Profile connection timed out')), 15000)
            );

            const data = await Promise.race([fetchPromise, timeoutPromise]);
            
            if (!data || !data.user) {
                throw new Error('Profile data not found');
            }

            const u = data.user;
            
            // Production-ready data mapping
            document.title = `Blink | @${u.username}`;
            if (usernameEl) usernameEl.textContent = u.username;
            if (handleEl)   handleEl.textContent   = '@' + u.username;
            if (bioEl)      bioEl.textContent      = u.bio || 'No bio yet.';
            if (followersEl) followersEl.textContent = fmt(u.followers_count || 0);
            if (followingEl) followingEl.textContent = fmt(u.following_count || 0);
            if (videoCountEl) videoCountEl.textContent = fmt(data.videos_count || u.videos_count || 0);

            // Handle online status
            const statusEl = document.getElementById('profileOnlineStatus');
            if (statusEl) {
                statusEl.setAttribute('data-online-user-id', u.id);
                if (window.Blink.socket) {
                    window.Blink.socket.emit('check_status', u.id);
                }
            }

            // Handle avatars
            const avatarEl = document.getElementById('profilePhoto');
            const initialEl = document.getElementById('profileAvatarInitial');
            
            // Use avatar_url (new alias) or fallback to photo/pic
            const photoUrl = u.avatar_url || u.profile_pic || u.profile_photo;
            
            if (photoUrl) {
                avatarEl.src = bustCache(photoUrl);
                avatarEl.onload = () => {
                    avatarEl.style.display = 'block';
                    if (initialEl) initialEl.style.display = 'none';
                };
                avatarEl.onerror = () => {
                    // Fallback to initial if image fails to load
                    avatarEl.style.display = 'none';
                    if (initialEl) {
                        initialEl.style.display = 'flex';
                        initialEl.textContent = (u.username || 'U')[0].toUpperCase();
                    }
                };
            } else {
                avatarEl.style.display = 'none';
                if (initialEl) {
                    initialEl.style.display = 'flex';
                    initialEl.textContent = (u.username || 'U')[0].toUpperCase();
                }
            }

            // Make avatar clickable to edit if it's my profile
            if (isOwnProfile) {
                const wrap = document.getElementById('profileAvatarWrap');
                const fileInput = document.getElementById('fileInput');

                if (wrap && fileInput) {
                    wrap.style.cursor = 'pointer';
                    wrap.title = 'Click to change profile photo';
                    
                    wrap.onclick = (e) => {
                        if (e.target.closest('#avatarLoadingOverlay')) return;
                        fileInput.click();
                    };

                    fileInput.setAttribute('accept', 'image/*');
                    fileInput.onchange = async function() {
                        const file = this.files[0];
                        if (!file) return;

                        const validation = validateImageFile(file);
                        if (!validation.valid) {
                            showToast(validation.error, 'error');
                            this.value = '';
                            return;
                        }

                        const formData = new FormData();
                        formData.append('avatar', file);

                        showAvatarLoading();
                        showToast('Updating profile photo...', 'info');

                        try {
                            const res = await fetch('/api/upload-avatar', {
                                method: 'POST',
                                headers: { 'Authorization': 'Bearer ' + getToken() },
                                body: formData
                            });

                            const uploadData = await res.json();
                            if (!res.ok) throw new Error(uploadData.error || 'Upload failed');

                            if (uploadData.success) {
                                const newUrl = uploadData.imageUrl || uploadData.avatar_url || uploadData.url;
                                setAvatarSrc(newUrl);
                                if (initialEl) initialEl.style.display = 'none';
                                
                                // Update localStorage user
                                const userToken = getUser();
                                if (userToken) {
                                    userToken.profile_pic = newUrl;
                                    userToken.profile_photo = newUrl;
                                    userToken.avatar_url = newUrl;
                                    localStorage.setItem('blink_user', JSON.stringify(userToken));
                                }
                                
                                showToast('Profile photo updated! ✨', 'success');
                                populateSidebar();
                            } else {
                                throw new Error(uploadData.error || 'Upload failed');
                            }
                        } catch (err) {
                            showToast(err.message, 'error');
                            console.error('[Profile] Upload error:', err);
                        } finally {
                            hideAvatarLoading();
                            this.value = '';
                        }
                    };
                }
                document.getElementById('editProfileBtn')?.classList.remove('hidden');
                document.getElementById('goLiveProfileBtn')?.classList.remove('hidden');
                document.getElementById('rowLogoutBtn')?.classList.remove('hidden');
            } else {
                const followBtn = document.getElementById('followBtn');
                if (followBtn) {
                    followBtn.classList.remove('hidden');
                    // Check follow status if logged in
                    if (me) {
                        try {
                            const s = await apiRequest(`/follow/status/${targetId}`);
                            isFollowing = s.following;
                            updateFollowBtn();
                        } catch (e) { console.warn('Follow status check failed', e); }
                    }
                }
            }

            // Load videos
            await loadVideos();

        } catch (err) { 
            console.error('[Profile] loadProfile Critical Error:', err);
            showToast('Failed to load profile. Please refresh.', 'error'); 
            
            // Fallback UI for fatal error
            if (usernameEl) usernameEl.textContent = 'User Not Found';
            if (handleEl) handleEl.textContent = '@error';
            if (bioEl) bioEl.textContent = 'We couldn\'t load this profile. It may have been deleted or there is a connection issue.';
            
            const videoGrid = document.getElementById('videoGrid');
            if (videoGrid) videoGrid.innerHTML = `
                <div style="grid-column:1/-1; padding:60px 20px; text-align:center;">
                    <div style="font-size:48px; color:var(--text-secondary); margin-bottom:16px;"><i class="bi bi-cloud-slash"></i></div>
                    <h3>Connection Error</h3>
                    <p style="color:var(--text-secondary); margin-bottom:20px;">We're having trouble reaching the server.</p>
                    <button class="btn btn-primary" onclick="window.location.reload()">Retry Now</button>
                </div>
            `;
        }
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

    // ─── EDIT PROFILE MODAL LOGIC ────────────────────────────────
    const editModal = document.getElementById('editProfileModal');
    const openEditBtn = document.getElementById('editProfileBtn');
    const closeEditBtn = document.getElementById('closeEditModal');
    const cancelEditBtn = document.getElementById('cancelEditBtn');
    const editForm = document.getElementById('editProfileForm');
    const editPhotoInput = document.getElementById('editPhotoInput');
    const changePhotoBtn = document.getElementById('changePhotoBtn');

    const openModal = () => {
        const u = getUser(); // Fresh data for modal
        if (!u) return;

        // Pre-fill fields
        document.getElementById('editUsernameInput').value = u.username;
        document.getElementById('editBioInput').value = u.bio || '';
        document.getElementById('editPhotoUsername').textContent = '@' + u.username;
        
        const preview = document.getElementById('editPhotoPreview');
        const initial = document.getElementById('editPhotoInitial');
        const photo = u.avatar_url || u.profile_pic || u.profile_photo;

        if (photo) {
            preview.src = bustCache(photo);
            preview.style.display = 'block';
            initial.style.display = 'none';
        } else {
            preview.style.display = 'none';
            initial.style.display = 'flex';
            initial.textContent = (u.username || 'U')[0].toUpperCase();
        }

        editModal.classList.add('open');
    };

    const closeModal = () => {
        editModal.classList.remove('open');
        editForm.reset();
        document.getElementById('editPhotoInput').value = '';
    };

    openEditBtn?.addEventListener('click', openModal);
    closeEditBtn?.addEventListener('click', closeModal);
    cancelEditBtn?.addEventListener('click', closeModal);
    editModal?.addEventListener('click', (e) => { if (e.target === editModal) closeModal(); });

    // Live Preview
    changePhotoBtn?.addEventListener('click', () => editPhotoInput.click());
    editPhotoInput?.addEventListener('change', function() {
        const file = this.files[0];
        if (file) {
            const validation = validateImageFile(file);
            if (!validation.valid) {
                 showToast(validation.error, 'error');
                 this.value = '';
                 return;
            }
            const reader = new FileReader();
            reader.onload = e => {
                const preview = document.getElementById('editPhotoPreview');
                preview.src = e.target.result;
                preview.style.display = 'block';
                document.getElementById('editPhotoInitial').style.display = 'none';
            };
            reader.readAsDataURL(file);
        }
    });

    // Bio Char Count
    document.getElementById('editBioInput')?.addEventListener('input', function() {
        document.getElementById('bioCharCount').textContent = this.value.length;
    });

    // Form Submission
    editForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const saveBtn = document.getElementById('saveProfileBtn');
        const saveTxt = document.getElementById('saveBtnText');
        const spinner = document.getElementById('saveBtnSpinner');

        // UI Feedback
        saveBtn.disabled = true;
        saveTxt.textContent = 'Saving...';
        spinner.classList.remove('hidden');

        try {
            const formData = new FormData();
            formData.append('username', document.getElementById('editUsernameInput').value.trim());
            formData.append('bio', document.getElementById('editBioInput').value.trim());
            
            if (editPhotoInput.files[0]) {
                formData.append('avatar', editPhotoInput.files[0]);
            }

            const res = await fetch('/api/user/update-profile', {
                method: 'PUT',
                headers: { 'Authorization': 'Bearer ' + getToken() },
                body: formData
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to update profile');

            if (data.success) {
                // Update Local Storage
                const u = data.user;
                localStorage.setItem('blink_user', JSON.stringify(u));
                
                // Update UI instantly
                document.getElementById('profileUsername').textContent = u.username;
                document.getElementById('profileHandle').textContent = '@' + u.username;
                document.getElementById('profileBio').textContent = u.bio || 'No bio yet.';
                
                // Update Avatars everywhere
                const photo = u.avatar_url || u.profile_photo;
                if (photo) {
                    const profilePhoto = document.getElementById('profilePhoto');
                    const profileInitial = document.getElementById('profileAvatarInitial');
                    if (profilePhoto) {
                        profilePhoto.src = bustCache(photo);
                        profilePhoto.style.display = 'block';
                        if (profileInitial) profileInitial.style.display = 'none';
                    }
                }

                showToast('Profile updated! ✨', 'success');
                populateSidebar(); // Sync sidebar avatar
                closeModal();
            }
        } catch (err) {
            showToast(err.message, 'error');
            console.error('[EditProfile] Submit Error:', err);
        } finally {
            saveBtn.disabled = false;
            saveTxt.textContent = 'Save Changes';
            spinner.classList.add('hidden');
        }
    });

    // ─── MOBILE LOGOUT BTN & MODAL ────────────────────────────────
    const mobileLogoutBtn = document.getElementById('mobileLogoutBtn');
    const rowLogoutBtn = document.getElementById('rowLogoutBtn');
    const logoutConfirmModal = document.getElementById('logoutConfirmModal');
    const cancelLogoutBtn = document.getElementById('cancelLogoutBtn');
    const confirmLogoutBtn = document.getElementById('confirmLogoutBtn');

    if (logoutConfirmModal) {
        if (isOwnProfile && mobileLogoutBtn) {
            mobileLogoutBtn.classList.remove('hidden');
        }
        if (isOwnProfile && rowLogoutBtn) {
            rowLogoutBtn.classList.remove('hidden');
        }

        const openModal = () => logoutConfirmModal.classList.add('open');

        mobileLogoutBtn?.addEventListener('click', openModal);
        rowLogoutBtn?.addEventListener('click', openModal);
        
        cancelLogoutBtn?.addEventListener('click', () => {
            logoutConfirmModal.classList.remove('open');
        });

        logoutConfirmModal.addEventListener('click', (e) => {
            if (e.target === logoutConfirmModal) {
                logoutConfirmModal.classList.remove('open');
            }
        });

        confirmLogoutBtn?.addEventListener('click', () => {
            logoutConfirmModal.classList.remove('open');
            localStorage.removeItem('blink_token');
            localStorage.removeItem('blink_user');
            sessionStorage.clear();
            window.location.replace('/pages/login.html');
        });
    }

    // Load videos
    async function loadVideos() {
        if (!targetId) return;
        try {
            const res = await fetch(`/api/user/${targetId}/videos`);
            const data = await res.json();
            
            console.log("Videos:", data);

            const countEl = document.getElementById("videoCount");
            if (countEl) countEl.innerText = data.count || 0;

            const container = document.getElementById("videoGrid");
            if (!container) return;
            container.innerHTML = "";

            if (!data.videos || data.videos.length === 0) {
                container.innerHTML = '<div class="tab-empty" style="grid-column:1/-1;"><div class="icon"><i class="bi bi-camera-reels-fill"></i></div><h3>No Videos Yet</h3><p>Upload your first video!</p></div>';
                return;
            }

            data.videos.forEach(video => {
                const div = document.createElement("div");
                div.className = "video-card";

                div.innerHTML = `
                  <video src="${video.video_url}" muted loop playsinline></video>
                `;

                if (isOwnProfile) {
                    const delBtn = document.createElement('button');
                    delBtn.className = 'btn-grid-delete';
                    delBtn.style.position = 'absolute';
                    delBtn.style.top = '5px';
                    delBtn.style.right = '5px';
                    delBtn.style.background = 'rgba(255,0,0,0.7)';
                    delBtn.style.color = 'white';
                    delBtn.style.border = 'none';
                    delBtn.style.borderRadius = '50%';
                    delBtn.style.padding = '5px 8px';
                    delBtn.style.cursor = 'pointer';
                    delBtn.innerHTML = '<i class="bi bi-trash3-fill"></i>';
                    delBtn.title = 'Delete Video';
                    delBtn.onclick = async (e) => {
                        e.stopPropagation();
                        if (!confirm('Are you sure you want to delete this video?')) return;
                        try {
                            const delRes = await fetch(`/api/videos/${video.id}`, {
                                method: 'DELETE',
                                headers: { 'Authorization': 'Bearer ' + getToken() }
                            });
                            if (delRes.ok) {
                                div.remove();
                                showToast('Video deleted');
                                loadVideos();
                            } else {
                                showToast('Failed to delete', 'error');
                            }
                        } catch (err) { showToast(err.message, 'error'); }
                    };
                    div.style.position = 'relative';
                    div.appendChild(delBtn);
                }

                const vid = div.querySelector('video');
                div.addEventListener('mouseenter', () => vid.play().catch(() => {}));
                div.addEventListener('mouseleave', () => { vid.pause(); vid.currentTime = 0; });

                container.appendChild(div);
            });
        } catch (err) {
            console.error('[loadVideos] error:', err);
            const container = document.getElementById("videoGrid");
            if (container) container.innerHTML = '<div class="tab-empty" style="grid-column:1/-1;"><h3>Failed to load videos</h3></div>';
        }
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
            if (u.profile_photo || u.profile_pic) { 
                prev.src = u.profile_photo || u.profile_pic; 
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
            const res  = await fetch('/api/upload-profile', { 
                method: 'POST', 
                headers: { 'Authorization': `Bearer ${getToken()}` }, 
                body: formData 
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            const user = window.Blink.getUser();
            user.profile_photo = data.profile_photo || data.imageUrl;
            user.profile_pic = user.profile_photo;
            localStorage.setItem('blink_user', JSON.stringify(user));
            await window.Blink.populateSidebar();
            
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
