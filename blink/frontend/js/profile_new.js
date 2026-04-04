/* ═══════════════════════════════════════════════════════════════════════════════
    BLINK v5.0 - USER PROFILE ENGINE
    Instagram-style profile with drag & drop uploads
    ═══════════════════════════════════════════════════════════════════════════════ */

class UserProfile {
    constructor() {
        this.profile = null;
        this.isOwn = false;
        this.init();
    }

    init() {
        // Global access
        window.profile = this;
    }

    async load(userId) {
        if (!userId) return;
        
        try {
            window.app.showLoading();
            // Using window.api for consistency
            const data = await window.api.request(`/users/${userId}`);
            
            if (data) {
                this.profile = data.user || data; 
                this.isOwn = this.profile.id === window.api.getCurrentUser()?.id;
                this.render();
                this.setupUploads();
            }
        } catch (err) {
            console.error("Profile load error:", err);
            window.app.showError("Failed to synchronize profile universe.");
        } finally {
            window.app.hideLoading();
        }
    }

    render() {
        const p = this.profile;
        if (!p) return;

        // --- Header Section ---
        const cover = document.querySelector('.profile-cover img');
        if (cover) cover.src = p.cover_photo || 'https://images.unsplash.com/photo-1614850523296-d8c1af93d400?auto=format&fit=crop&q=80&w=1200';

        const avatar = document.querySelector('.profile-avatar img') || document.querySelector('.profile-pic-container img');
        if (avatar) avatar.src = p.profile_photo || p.profile_pic || this.getFallbackAvatar(p.username);

        const nameEl = document.querySelector('.profile-name') || document.querySelector('.profile-details h1');
        if (nameEl) {
            nameEl.innerHTML = `
                ${p.display_name || p.username} 
                ${p.is_verified ? '<i class="bi bi-patch-check-fill text-primary"></i>' : ''}
            `;
        }
        
        const bioEl = document.querySelector('.profile-bio') || document.querySelector('.profile-details p:last-child');
        if (bioEl) bioEl.textContent = p.bio || 'Exploring the Blink universe...';
        
        // --- Stats Section ---
        const postCountEl = document.getElementById('postCount');
        if (postCountEl) postCountEl.textContent = p.videos_count || p.posts_count || 0;
        
        const followerCountEl = document.getElementById('followerCount');
        if (followerCountEl) followerCountEl.textContent = p.followers_count || 0;
        
        const followingCountEl = document.getElementById('followingCount');
        if (followingCountEl) followingCountEl.textContent = p.following_count || 0;

        // --- Action Buttons ---
        const actions = document.getElementById('profileActions') || document.querySelector('.profile-actions');
        if (actions) {
            if (this.isOwn) {
                actions.innerHTML = `
                    <button class="btn btn-secondary" onclick="window.profile.openEditModal()">Edit Profile</button>
                    <button class="btn btn-secondary"><i class="bi bi-gear-fill"></i></button>
                `;
            } else {
                actions.innerHTML = `
                    <button class="btn ${p.is_following ? 'btn-secondary' : 'btn-primary'}" onclick="window.profile.toggleFollow()">
                        ${p.is_following ? 'Following' : 'Follow'}
                    </button>
                    <button class="btn btn-secondary" onclick="window.app.navigateTo('messages', {id: ${p.id}})">Message</button>
                `;
            }
        }

        // --- Video Grid ---
        this.loadVideos();
    }

    async loadVideos() {
        const grid = document.getElementById('profileGrid') || document.querySelector('.profile-grid');
        if (!grid) return;

        try {
            const userId = this.profile.id;
            // Endpoint might be /videos/user/:id or /users/:id/videos
            const data = await window.api.request(`/videos/user/${userId}`);
            const videos = Array.isArray(data) ? data : (data.videos || []);

            if (videos.length === 0) {
                grid.innerHTML = `
                    <div class="empty-state" style="grid-column: 1/-1;">
                        <i class="bi bi-grid-3x3"></i>
                        <p>No posts yet</p>
                    </div>
                `;
                return;
            }

            grid.innerHTML = videos.map(v => `
                <div class="grid-item" onclick="window.feed.openReel(${v.id})">
                    <img src="${v.thumbnail_url || v.video_url}" loading="lazy" style="width:100%; height:100%; object-fit:cover;">
                    <div class="grid-overlay">
                        <span><i class="bi bi-play-fill"></i> ${v.views_count || 0}</span>
                    </div>
                </div>
            `).join('');
        } catch (err) {
            console.error("Video grid error:", err);
        }
    }

    setupUploads() {
        if (!this.isOwn) return;

        const avatarContainer = document.querySelector('.profile-avatar') || document.querySelector('.profile-pic-container');
        if (!avatarContainer) return;

        avatarContainer.style.cursor = 'pointer';

        // Click to upload
        avatarContainer.onclick = () => this.triggerUpload();

        // Drag & Drop
        avatarContainer.ondragover = (e) => { e.preventDefault(); avatarContainer.style.border = '2px dashed var(--primary)'; };
        avatarContainer.ondragleave = () => { avatarContainer.style.border = 'none'; };
        avatarContainer.ondrop = (e) => {
            e.preventDefault();
            avatarContainer.style.border = 'none';
            const file = e.dataTransfer.files[0];
            if (file) this.handleFile(file);
        };
    }

    triggerUpload() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = (e) => {
            if (e.target.files[0]) this.handleFile(e.target.files[0]);
        };
        input.click();
    }

    async handleFile(file) {
        if (!file.type.startsWith('image/')) {
            window.app.showError("Only image frequencies allowed.");
            return;
        }

        // 1. Instant Preview
        const reader = new FileReader();
        const avatarImg = document.querySelector('.profile-avatar img') || document.querySelector('.profile-pic-container img');
        
        reader.onload = (e) => {
            if (avatarImg) {
                avatarImg.style.opacity = '0.5';
                avatarImg.src = e.target.result;
            }
        };
        reader.readAsDataURL(file);

        // 2. Upload to Blink Cloud
        try {
            window.app.showLoading();
            const base64 = await this.toBase64(file);
            const res = await window.api.request('/users/update-profile', {
                method: 'POST',
                body: JSON.stringify({ profile_pic: base64, username: this.profile.username })
            });

            if (res) {
                window.app.showSuccess("Universe identity updated!");
                if (avatarImg) avatarImg.style.opacity = '1';
                // Update local user object
                const user = window.api.getCurrentUser();
                if (user) {
                    user.profile_pic = res.profile_pic || base64;
                    localStorage.setItem('user', JSON.stringify(user));
                }
            }
        } catch (err) {
            console.error("Upload error:", err);
            window.app.showError("Failed to synchronize image pulse.");
            this.render(); // Reset UI
        } finally {
            window.app.hideLoading();
        }
    }

    async toggleFollow() {
        const p = this.profile;
        try {
            const method = p.is_following ? 'DELETE' : 'POST';
            await window.api.request(`/users/${p.id}/follow`, { method });
            
            p.is_following = !p.is_following;
            p.followers_count += p.is_following ? 1 : -1;
            this.render();
        } catch (err) {
            window.app.showError("Follow pulse failed.");
        }
    }

    getFallbackAvatar(username) {
        return `https://ui-avatars.com/api/?name=${encodeURIComponent(username || 'U')}&background=ff2c55&color=fff&size=200`;
    }

    toBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result);
            reader.onerror = error => reject(error);
        });
    }

    openEditModal() {
        const modal = document.getElementById('editProfileModal');
        if (modal) modal.classList.add('active');
    }
}

// Global initialization
window.profile = new UserProfile();
