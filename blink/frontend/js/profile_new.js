/* ═══════════════════════════════════════════════════════════════════════════════
   BLINK v4.0 - USER PROFILE MODULE
   Profile display, edit modal, follow/unfollow, video grid
   ═══════════════════════════════════════════════════════════════════════════════ */

class UserProfile {
    constructor() {
        this.currentProfile = null;
        this.currentUserId = null;
    }

    /**
     * Load profile
     */
    async load(userId) {
        try {
            window.app?.showLoading?.();

            const response = await window.api?.getProfile?.(userId);
            if (response?.user) {
                this.currentProfile = response.user;
                this.currentUserId = userId;
                this.displayProfile();
                this.setupInteractions();
            }

            window.app?.hideLoading?.();
        } catch (error) {
            window.app?.hideLoading?.();
            window.app?.showError?.('Failed to load profile');
        }
    }

    /**
     * Display profile
     */
    displayProfile() {
        if (!this.currentProfile) return;

        const profile = this.currentProfile;
        const isOwnProfile = profile.id === window.auth?.getUser?.()?.id;

        // Cover photo
        const coverImg = document.querySelector('.profile-cover img');
        if (coverImg) {
            coverImg.src = profile.cover_photo || 'https://via.placeholder.com/1200x300?text=Cover+Photo';
        }

        // Profile photo
        const profileImg = document.querySelector('.profile-pic-container img');
        if (profileImg) {
            profileImg.src = profile.profile_photo || 'https://via.placeholder.com/200?text=' + profile.username[0].toUpperCase();
        }

        // Profile info
        const profileDetails = document.querySelector('.profile-details');
        if (profileDetails) {
            profileDetails.innerHTML = `
                <h1>${profile.display_name || profile.username}</h1>
                <p>@${profile.username}</p>
                <p style="margin-top: 1rem; color: var(--text-secondary);">${profile.bio || 'No bio yet'}</p>
            `;
        }

        // Stats
        const stats = document.querySelector('.profile-stats');
        if (stats) {
            stats.innerHTML = `
                <div style="text-align: center;">
                    <span class="stat-number">${profile.videos_count || 0}</span>
                    <span class="stat-label">Videos</span>
                </div>
                <div style="text-align: center;">
                    <span class="stat-number">${profile.followers_count || 0}</span>
                    <span class="stat-label">Followers</span>
                </div>
                <div style="text-align: center;">
                    <span class="stat-number">${profile.following_count || 0}</span>
                    <span class="stat-label">Following</span>
                </div>
            `;
        }

        // Actions
        const actions = document.querySelector('.profile-actions');
        if (actions) {
            if (isOwnProfile) {
                actions.innerHTML = `
                    <button class="btn-primary" onclick="window.profile.showEditModal()">Edit Profile</button>
                    <button class="btn-secondary" onclick="window.profile.showSettings()">Settings</button>
                `;
            } else {
                const isFollowing = profile.isFollowing || false;
                actions.innerHTML = `
                    <button class="btn-${isFollowing ? 'secondary' : 'primary'}" onclick="window.profile.toggleFollow()">
                        ${isFollowing ? 'Following' : 'Follow'}
                    </button>
                    <button class="btn-secondary" onclick="window.app.redirect('messages')">Message</button>
                `;
            }
        }

        // Video grid
        this.displayVideos(profile.videos || []);
    }

    /**
     * Display videos grid
     */
    displayVideos(videos) {
        const grid = document.querySelector('.profile-grid');
        if (!grid) return;

        if (videos.length === 0) {
            grid.innerHTML = `
                <div class="empty-state" style="grid-column: 1 / -1;">
                    <i class="bi bi-film"></i>
                    <p>No videos yet</p>
                </div>
            `;
            return;
        }

        grid.innerHTML = videos.map(video => `
            <img 
                src="${video.thumbnail || video.video_url}" 
                alt="${video.caption}"
                style="cursor: pointer;"
                onclick="window.location.href='video.html?id=${video.id}'"
            >
        `).join('');
    }

    /**
     * Toggle follow
     */
    async toggleFollow() {
        if (!window.auth?.requireAuth?.()) return;

        try {
            const isFollowing = this.currentProfile.isFollowing;

            if (isFollowing) {
                await window.api?.unfollowUser?.(this.currentProfile.id);
                this.currentProfile.isFollowing = false;
                this.currentProfile.followers_count--;
            } else {
                await window.api?.followUser?.(this.currentProfile.id);
                this.currentProfile.isFollowing = true;
                this.currentProfile.followers_count++;
            }

            this.displayProfile();
            window.app?.showSuccess?.(isFollowing ? 'Unfollowed!' : 'Following!');
        } catch (error) {
            window.app?.showError?.('Failed to update follow status');
        }
    }

    /**
     * Show edit profile modal
     */
    showEditModal() {
        const modal = document.getElementById('editProfileModal');
        if (!modal) return;

        const profile = this.currentProfile;

        const form = modal.querySelector('form');
        if (form) {
            form.innerHTML = `
                <div>
                    <label>Display Name</label>
                    <input type="text" value="${profile.display_name || ''}" name="display_name">
                </div>
                <div>
                    <label>Username</label>
                    <input type="text" value="${profile.username}" name="username" readonly>
                </div>
                <div>
                    <label>Bio</label>
                    <textarea name="bio" maxlength="150">${profile.bio || ''}</textarea>
                    <small>${(profile.bio || '').length}/150</small>
                </div>
                <div>
                    <label>
                        <input type="file" accept="image/*" name="profile_photo" onchange="window.profile.handleProfilePhotoSelect(this)">
                        Change Profile Photo
                    </label>
                </div>
                <div>
                    <label>
                        <input type="file" accept="image/*" name="cover_photo" onchange="window.profile.handleCoverPhotoSelect(this)">
                        Change Cover Photo
                    </label>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                    <button type="button" class="btn-secondary" onclick="document.getElementById('editProfileModal').classList.remove('active')">Cancel</button>
                    <button type="submit" class="btn-primary">Save Changes</button>
                </div>
            `;

            form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveProfile(form);
            });
        }

        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    /**
     * Handle profile photo selection
     */
    async handleProfilePhotoSelect(input) {
        if (!input.files[0]) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const base64 = e.target.result;
                await window.api?.uploadProfilePhoto?.(base64);
                window.app?.showSuccess?.('Profile photo updated!');
                this.currentProfile.profile_photo = base64;
                this.displayProfile();
            } catch (error) {
                window.app?.showError?.('Failed to upload photo');
            }
        };
        reader.readAsDataURL(input.files[0]);
    }

    /**
     * Handle cover photo selection
     */
    async handleCoverPhotoSelect(input) {
        if (!input.files[0]) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const base64 = e.target.result;
                await window.api?.uploadCoverPhoto?.(base64);
                window.app?.showSuccess?.('Cover photo updated!');
                this.currentProfile.cover_photo = base64;
                this.displayProfile();
            } catch (error) {
                window.app?.showError?.('Failed to upload cover');
            }
        };
        reader.readAsDataURL(input.files[0]);
    }

    /**
     * Save profile changes
     */
    async saveProfile(form) {
        try {
            const data = new FormData(form);
            const updates = {
                display_name: data.get('display_name'),
                bio: data.get('bio')
            };

            const response = await window.api?.updateProfile?.(updates);
            if (response?.user) {
                this.currentProfile = response.user;
                this.displayProfile();
                window.app?.showSuccess?.('Profile updated!');
                document.getElementById('editProfileModal').classList.remove('active');
                document.body.style.overflow = '';
            }
        } catch (error) {
            window.app?.showError?.('Failed to save profile');
        }
    }

    /**
     * Show settings
     */
    showSettings() {
        alert('Settings page coming soon!');
    }

    /**
     * Setup interactions
     */
    setupInteractions() {
        const editBtn = document.querySelector('.edit-pic-btn');
        const editCoverBtn = document.querySelector('.edit-cover-btn');

        if (editBtn && this.currentProfile.id === window.auth?.getUser?.()?.id) {
            editBtn.addEventListener('click', (e) => {
                e.preventDefault();
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = 'image/*';
                input.onchange = (evt) => {
                    if (evt.target.files[0]) {
                        this.handleProfilePhotoSelect(evt.target);
                    }
                };
                input.click();
            });
        }

        if (editCoverBtn && this.currentProfile.id === window.auth?.getUser?.()?.id) {
            editCoverBtn.addEventListener('click', (e) => {
                e.preventDefault();
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = 'image/*';
                input.onchange = (evt) => {
                    if (evt.target.files[0]) {
                        this.handleCoverPhotoSelect(evt.target);
                    }
                };
                input.click();
            });
        }
    }
}

// Create global instance
window.profile = new UserProfile();

export default window.profile;
