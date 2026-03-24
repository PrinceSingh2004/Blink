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

    // Pre-fill
    function initUI() {
        editUsername.value = me.username || '';
        editBio.value = me.bio || '';
        
        // Fix: Check both common keys used in DB
        const photo = me.profile_photo || me.profile_pic;
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

    // 1. Avatar Update Logic
    let pendingAvatarBlob = null;

    avatarInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (file.size > 5 * 1024 * 1024) { // Increased to 5MB for better user exp, backend will handle it
            showToast('Image too large (Max 5MB)', 'error');
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

    document.getElementById('cancelCropBtn').addEventListener('click', () => {
        cropModal.style.display = 'none';
        if (cropper) cropper.destroy();
        avatarInput.value = '';
    });

    document.getElementById('confirmCropBtn').addEventListener('click', () => {
        // High quality crop for Cloudinary to handle optimization
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

    document.getElementById('removeAvatarBtn').addEventListener('click', () => {
        if (!confirm('Remove profile photo?')) return;
        pendingAvatarBlob = 'REMOVE'; // Special flag
        currentAvatar.style.display = 'none';
        initialsEl.style.display = 'flex';
        initialsEl.textContent = (editUsername.value || 'U')[0].toUpperCase();
        showToast('Photo marked for removal', 'info');
    });

    // 2. Profile Info Logic (Unified)
    editForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const saveBtn = document.getElementById('saveProfileBtn');
        const originalText = saveBtn.textContent;
        
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<div class="spinner-small"></div> Saving...';

        try {
            const formData = new FormData();
            formData.append('username', editUsername.value.trim());
            formData.append('bio', editBio.value.trim());

            if (pendingAvatarBlob instanceof Blob) {
                formData.append('photo', pendingAvatarBlob, 'avatar.jpg');
            } else if (pendingAvatarBlob === 'REMOVE') {
                formData.append('profile_pic', ''); // Send empty to clear
            }

            const res = await fetch(window.location.origin + '/api/user/update-profile', {
                method: 'POST',
                headers: { 
                    'Authorization': `Bearer ${getToken()}` 
                    // Note: Do NOT set Content-Type, browser will set multipart/form-data + boundary
                },
                body: formData
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Update failed');

            // Success -> Update local state and redirect
            setAuth(getToken(), data.user);
            
            // Aggressively update all avatar elements on the current page
            const newUrl = data.imageUrl ? (data.imageUrl + '?t=' + Date.now()) : null;
            const avatars = ['profileImg', 'currentAvatar'];
            avatars.forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    if (newUrl) {
                        el.src = newUrl;
                        el.style.display = 'block';
                        if (initialsEl) initialsEl.style.display = 'none';
                    } else {
                        el.style.display = 'none';
                        if (initialsEl) {
                            initialsEl.style.display = 'flex';
                            initialsEl.textContent = (data.user.username || 'U')[0].toUpperCase();
                        }
                    }
                }
            });

            showToast('Profile updated successfully!', 'success');
            await populateSidebar();

            
            setTimeout(() => {
                window.location.href = 'profile.html';
            }, 1000);

        } catch (err) {
            console.error('[Update] Error:', err);
            showToast(err.message, 'error');
            saveBtn.disabled = false;
            saveBtn.textContent = originalText;
        }
    });


}, false);
