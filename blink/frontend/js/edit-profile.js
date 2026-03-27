/* edit-profile.js – Logic for user profile management */
document.addEventListener('DOMContentLoaded', async () => {
    const { getToken, getUser, requireAuth, apiRequest, showToast, populateSidebar, setAuth } = window.Blink;

    if (!requireAuth()) return;
    await populateSidebar();

    const me = getUser();
    let cropper = null;

    // UI Elements
    const avatarInput = document.getElementById('avatarInput');
    const cropModal = document.getElementById('cropModal');
    const cropperImg = document.getElementById('cropperImg');
    const initialsEl = document.getElementById('initials');
    const currentAvatar = document.getElementById('currentAvatar');
    const editUsername = document.getElementById('editUsername');
    const editBio = document.getElementById('editBio');
    const editForm = document.getElementById('editProfileForm');

    // Pre-fill from localStorage (instant) then refresh from server
    function initUI() {
        editUsername.value = me.username || '';
        editBio.value = me.bio || '';
        
        const photo = me.profile_pic || me.profile_photo;
        if (photo) {
            currentAvatar.src = photo;
            currentAvatar.onload = () => {
                currentAvatar.style.display = 'block';
                initialsEl.style.display = 'none';
            };
        } else {
            currentAvatar.style.display = 'none';
            initialsEl.style.display = 'flex';
            initialsEl.textContent = (me.username || 'U')[0].toUpperCase();
        }
    }
    initUI();

    // Refresh from server to get latest data (profile_pic may have changed)
    try {
        const data = await apiRequest(`/users/${me.id}`);
        if (data?.user) {
            const u = data.user;
            const photo = u.profile_pic || u.profile_photo;
            if (photo) {
                currentAvatar.src = photo + (photo.includes('?') ? '&' : '?') + 't=' + Date.now();
                currentAvatar.onload = () => {
                    currentAvatar.style.display = 'block';
                    initialsEl.style.display = 'none';
                };
            }
            if (u.username) editUsername.value = u.username;
            if (u.bio !== undefined) editBio.value = u.bio || '';
        }
    } catch {}

    // ── Avatar Update Logic ──────────────────────────────────────
    let pendingAvatarBlob = null;

    // MOBILE FIX: Remove capture attribute if present
    if (avatarInput) {
        avatarInput.removeAttribute('capture');
        avatarInput.setAttribute('accept', 'image/*');
    }

    avatarInput?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Client-side validation
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif',
                              'image/heic', 'image/heif', 'image/bmp'];
        const isImage = allowedTypes.includes(file.type) || file.type.startsWith('image/');
        if (!isImage) {
            showToast('Please select an image file (JPG, PNG, or WebP)', 'error');
            return;
        }

        if (file.size > 10 * 1024 * 1024) {
            showToast('Image too large (Max 10MB)', 'error');
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            cropperImg.src = event.target.result;
            cropModal.style.display = 'flex';
            
            if (cropper) cropper.destroy();
            cropper = new Cropper(cropperImg, {
                aspectRatio: 1,
                viewMode: 2,
                guides: false,
                autoCropArea: 1
            });
        };
        reader.readAsDataURL(file);
    });

    document.getElementById('cancelCropBtn')?.addEventListener('click', () => {
        cropModal.style.display = 'none';
        if (cropper) cropper.destroy();
        avatarInput.value = '';
    });

    document.getElementById('confirmCropBtn')?.addEventListener('click', () => {
        const canvas = cropper.getCroppedCanvas({ width: 500, height: 500 });
        canvas.toBlob((blob) => {
            pendingAvatarBlob = blob;
            
            // Update preview immediately (local)
            const previewUrl = URL.createObjectURL(blob);
            currentAvatar.src = previewUrl;
            currentAvatar.style.display = 'block';
            initialsEl.style.display = 'none';
            
            cropModal.style.display = 'none';
            if (cropper) cropper.destroy();
            showToast('Photo ready to save', 'info');
        }, 'image/jpeg', 0.9);
    });

    document.getElementById('removeAvatarBtn')?.addEventListener('click', () => {
        if (!confirm('Remove profile photo?')) return;
        pendingAvatarBlob = 'REMOVE';
        currentAvatar.style.display = 'none';
        initialsEl.style.display = 'flex';
        initialsEl.textContent = (editUsername.value || 'U')[0].toUpperCase();
        showToast('Photo marked for removal', 'info');
    });

    // ── Save Profile (unified: avatar + username + bio) ──────────
    editForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const saveBtn = document.getElementById('saveProfileBtn');
        const originalText = saveBtn.textContent;
        
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<div class="spinner-small"></div> Saving...';

        try {
            // ── If avatar was changed, upload it FIRST ──────────
            if (pendingAvatarBlob instanceof Blob) {
                const avatarForm = new FormData();
                // CRITICAL: field name must be 'avatar' to match multer .single('avatar')
                avatarForm.append('avatar', pendingAvatarBlob, 'avatar.jpg');

                const avatarRes = await fetch(window.location.origin + '/api/upload-avatar', {
                    method: 'POST',
                    headers: { 
                        'Authorization': `Bearer ${getToken()}`
                    },
                    body: avatarForm,
                });

                const avatarData = await avatarRes.json();
                if (!avatarRes.ok) throw new Error(avatarData.error || 'Avatar upload failed');

                // Sync avatar URL to localStorage immediately
                const newUrl = avatarData.imageUrl || avatarData.profile_pic || avatarData.profile_photo;
                const userData = getUser();
                if (userData && newUrl) {
                    userData.profile_pic = newUrl;
                    userData.profile_photo = newUrl;
                    localStorage.setItem('blink_user', JSON.stringify(userData));
                }
            } else if (pendingAvatarBlob === 'REMOVE') {
                // TODO: Implement avatar removal endpoint if needed
                // For now, user can upload a new one to replace
            }

            // ── Then update username + bio ────────────────────────
            const username = editUsername.value.trim();
            const bio = editBio.value.trim();

            if (username) {
                const profileRes = await apiRequest('/users/profile/update', {
                    method: 'PUT',
                    body: JSON.stringify({ username, bio })
                });

                // Sync updated user data
                const curUser = getUser();
                if (curUser && profileRes?.user) {
                    Object.assign(curUser, { 
                        username: profileRes.user.username, 
                        bio: profileRes.user.bio 
                    });
                    localStorage.setItem('blink_user', JSON.stringify(curUser));
                }
            }

            showToast('Profile updated successfully!', 'success');
            await populateSidebar();
            pendingAvatarBlob = null;

            setTimeout(() => {
                window.location.href = 'profile.html';
            }, 1000);

        } catch (err) {
            console.error('[EditProfile] Error:', err);
            showToast(err.message, 'error');
            saveBtn.disabled = false;
            saveBtn.textContent = originalText;
        }
    });

}, false);
