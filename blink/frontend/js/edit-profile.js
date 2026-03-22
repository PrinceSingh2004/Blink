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
        if (me.profile_photo) {
            currentAvatar.src = me.profile_photo;
            currentAvatar.style.display = 'block';
            initialsEl.style.display = 'none';
        } else {
            initialsEl.textContent = (me.username || 'U')[0].toUpperCase();
        }
    }
    initUI();

    // 1. Avatar Update Logic
    avatarInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (file.size > 2 * 1024 * 1024) {
            showToast('Image too large (Max 2MB)', 'error');
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
                guides: false
            });
        };
        reader.readAsDataURL(file);
    });

    document.getElementById('cancelCropBtn').addEventListener('click', () => {
        cropModal.style.display = 'none';
        if (cropper) cropper.destroy();
    });

    document.getElementById('confirmCropBtn').addEventListener('click', () => {
        const canvas = cropper.getCroppedCanvas({ width: 400, height: 400 });
        canvas.toBlob(async (blob) => {
            const formData = new FormData();
            formData.append('avatar', blob, 'avatar.jpg');

            cropModal.style.display = 'none';
            showToast('Uploading photo...');

            try {
                const res = await fetch(window.location.origin + '/api/users/upload-profile', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${getToken()}` },
                    body: formData
                });
                
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Upload failed');

                // Update local session
                setAuth(getToken(), data.user);
                
                // Update UI
                currentAvatar.src = data.profile_photo;
                currentAvatar.style.display = 'block';
                initialsEl.style.display = 'none';
                
                showToast('Photo updated!', 'success');
                await populateSidebar();
            } catch (err) {
                showToast(err.message, 'error');
            }
        }, 'image/jpeg');
    });

    // 2. Profile Info Logic
    editForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const saveBtn = document.getElementById('saveProfileBtn');
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';

        try {
            const data = await apiRequest('/users/profile/update', {
                method: 'PUT',
                body: JSON.stringify({
                    username: editUsername.value.trim(),
                    bio: editBio.value.trim()
                })
            });

            // Sync local storage
            setAuth(getToken(), data.user);
            showToast('Profile updated!', 'success');
            
            // Wait a sec and go back
            setTimeout(() => window.location.href = 'profile.html', 800);
        } catch (err) {
            showToast(err.message, 'error');
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save Changes';
        }
    });

}, false);
