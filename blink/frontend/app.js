/* ═══════════════════════════════════════════════════════════════════════════════
   BLINK 2.0 — Unified SPA Engine
   Auth | Feed | Explore | Upload | Profile
   ═══════════════════════════════════════════════════════════════════════════════ */

class BlinkApp {
    constructor() {
        this.API_BASE = this.detectApiBase();
        this.token = localStorage.getItem('blink_token');
        this.user = this.loadUser();
        this.currentPage = 'feed';
        this.feedLoaded = false;
        this.feedObserver = null;

        document.addEventListener('DOMContentLoaded', () => this.init());
    }

    /* ─────────────────────────────────────────────────────────
       INITIALIZATION
       ───────────────────────────────────────────────────────── */
    init() {
        this.setupAuth();
        this.setupNavigation();
        this.setupUpload();
        this.setupSearch();
        this.setupProfile();
        this.setupPasswordToggles();
        this.checkAuth();
    }

    detectApiBase() {
        const host = window.location.hostname;
        if (host === 'localhost' || host === '127.0.0.1') {
            return `http://${host}:${window.location.port || 5000}`;
        }
        return window.location.origin;
    }

    /* ─────────────────────────────────────────────────────────
       API CLIENT
       ───────────────────────────────────────────────────────── */
    async api(endpoint, options = {}) {
        const url = `${this.API_BASE}/api${endpoint}`;
        const headers = { ...options.headers };

        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }

        // Don't set Content-Type for FormData
        if (!(options.body instanceof FormData)) {
            headers['Content-Type'] = 'application/json';
        }

        try {
            const res = await fetch(url, {
                ...options,
                headers
            });

            const data = await res.json();

            if (res.status === 401) {
                this.logout();
                return null;
            }

            if (!res.ok) {
                throw new Error(data.error || data.message || `HTTP ${res.status}`);
            }

            return data;
        } catch (err) {
            console.error(`API ${endpoint}:`, err.message);
            throw err;
        }
    }

    /* ─────────────────────────────────────────────────────────
       AUTH SYSTEM
       ───────────────────────────────────────────────────────── */
    setupAuth() {
        // Tab switching
        const tabLogin = document.getElementById('tabLogin');
        const tabSignup = document.getElementById('tabSignup');
        const loginForm = document.getElementById('loginForm');
        const signupForm = document.getElementById('signupForm');
        const indicator = document.getElementById('tabIndicator');

        tabLogin?.addEventListener('click', () => {
            tabLogin.classList.add('active');
            tabSignup.classList.remove('active');
            loginForm.classList.add('active');
            signupForm.classList.remove('active');
            indicator?.classList.remove('right');
        });

        tabSignup?.addEventListener('click', () => {
            tabSignup.classList.add('active');
            tabLogin.classList.remove('active');
            signupForm.classList.add('active');
            loginForm.classList.remove('active');
            indicator?.classList.add('right');
        });

        // Login
        loginForm?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('loginBtn');
            const alert = document.getElementById('loginAlert');
            const identifier = document.getElementById('loginIdentifier').value.trim();
            const password = document.getElementById('loginPassword').value;

            if (!identifier || !password) {
                this.showAlert(alert, 'Please fill in all fields', 'error');
                return;
            }

            this.setButtonLoading(btn, true);
            this.hideAlert(alert);

            try {
                const data = await this.api('/auth/login', {
                    method: 'POST',
                    body: JSON.stringify({ identifier, password })
                });

                if (data?.success) {
                    this.setAuth(data.token, data.user);
                    this.showToast(`Welcome back, ${data.user.username}!`, 'success');
                    setTimeout(() => window.location.reload(), 600);
                }
            } catch (err) {
                this.showAlert(alert, err.message || 'Invalid credentials', 'error');
                this.setButtonLoading(btn, false);
            }
        });

        // Signup
        signupForm?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('signupBtn');
            const alert = document.getElementById('signupAlert');
            const username = document.getElementById('signupUsername').value.trim();
            const email = document.getElementById('signupEmail').value.trim();
            const password = document.getElementById('signupPassword').value;

            if (!username || !email || !password) {
                this.showAlert(alert, 'All fields are required', 'error');
                return;
            }
            if (password.length < 6) {
                this.showAlert(alert, 'Password must be at least 6 characters', 'error');
                return;
            }

            this.setButtonLoading(btn, true);
            this.hideAlert(alert);

            try {
                const data = await this.api('/auth/register', {
                    method: 'POST',
                    body: JSON.stringify({ username, email, password })
                });

                if (data?.success) {
                    this.setAuth(data.token, data.user);
                    this.showToast('Account created! Welcome to Blink! 🎉', 'success');
                    setTimeout(() => window.location.reload(), 600);
                }
            } catch (err) {
                this.showAlert(alert, err.message || 'Registration failed', 'error');
                this.setButtonLoading(btn, false);
            }
        });

        // Logout
        document.getElementById('logoutBtn')?.addEventListener('click', () => this.logout());
    }

    checkAuth() {
        const overlay = document.getElementById('authOverlay');
        const shell = document.getElementById('appShell');

        if (this.token && this.user) {
            overlay.style.display = 'none';
            shell.style.display = 'flex';
            this.updateSidebar();
            this.navigateTo('feed');
        } else {
            overlay.style.display = 'flex';
            shell.style.display = 'none';
        }
    }

    setAuth(token, user) {
        this.token = token;
        this.user = user;
        localStorage.setItem('blink_token', token);
        localStorage.setItem('blink_user', JSON.stringify(user));
    }

    logout() {
        this.token = null;
        this.user = null;
        localStorage.removeItem('blink_token');
        localStorage.removeItem('blink_user');
        window.location.reload();
    }

    loadUser() {
        try {
            const u = localStorage.getItem('blink_user');
            return u ? JSON.parse(u) : null;
        } catch { return null; }
    }

    updateSidebar() {
        if (!this.user) return;
        const name = document.getElementById('sidebarUsername');
        const avatar = document.getElementById('sidebarAvatar');

        if (name) name.textContent = `@${this.user.username}`;
        if (avatar) {
            if (this.user.profile_photo) {
                avatar.innerHTML = `<img src="${this.user.profile_photo}" alt="avatar">`;
            } else {
                avatar.textContent = (this.user.username || 'U')[0].toUpperCase();
            }
        }
    }

    /* ─────────────────────────────────────────────────────────
       NAVIGATION
       ───────────────────────────────────────────────────────── */
    setupNavigation() {
        document.addEventListener('click', (e) => {
            const link = e.target.closest('[data-page]');
            if (link) {
                e.preventDefault();
                this.navigateTo(link.getAttribute('data-page'));
            }
        });
    }

    navigateTo(page) {
        // Update pages
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        const target = document.getElementById(`page-${page}`);
        if (target) target.classList.add('active');

        // Update sidebar nav
        document.querySelectorAll('.nav-link[data-page]').forEach(link => {
            link.classList.toggle('active', link.getAttribute('data-page') === page);
        });

        // Update bottom nav
        document.querySelectorAll('.bottom-link[data-page]').forEach(link => {
            link.classList.toggle('active', link.getAttribute('data-page') === page);
        });

        this.currentPage = page;

        // Page-specific loading
        if (page === 'feed' && !this.feedLoaded) this.loadFeed();
        if (page === 'profile') this.loadProfile();
    }

    /* ─────────────────────────────────────────────────────────
       VIDEO FEED — Vertical Reels
       ───────────────────────────────────────────────────────── */
    async loadFeed() {
        const container = document.getElementById('reelsContainer');
        if (!container) return;

        try {
            const data = await this.api('/videos/feed');
            if (!data?.data || data.data.length === 0) {
                container.innerHTML = `
                    <div class="feed-empty">
                        <i class="bi bi-camera-video"></i>
                        <h2>No videos yet</h2>
                        <p>Be the first to share a Blink!</p>
                    </div>`;
                return;
            }

            container.innerHTML = data.data.map(v => this.createReelCard(v)).join('');
            this.feedLoaded = true;
            this.setupReelInteractions();
            this.setupAutoplay();
        } catch (err) {
            container.innerHTML = `
                <div class="feed-empty">
                    <i class="bi bi-wifi-off"></i>
                    <h2>Connection Error</h2>
                    <p>${err.message}</p>
                </div>`;
        }
    }

    createReelCard(video) {
        const avatar = video.profile_photo || `https://ui-avatars.com/api/?name=${video.username}&background=6366f1&color=fff&size=80`;
        return `
        <div class="reel-card" data-id="${video.id}">
            <video src="${video.video_url}" loop playsinline preload="metadata"></video>
            <div class="reel-overlay"></div>
            <div class="reel-play-indicator"><i class="bi bi-play-fill"></i></div>
            <div class="reel-actions">
                <button class="reel-action-btn like-btn" data-id="${video.id}">
                    <i class="bi bi-heart-fill"></i>
                    <span>${this.formatCount(video.likes_count || 0)}</span>
                </button>
                <button class="reel-action-btn" onclick="app.showToast('Views: ${video.views_count || 0}', 'info')">
                    <i class="bi bi-eye-fill"></i>
                    <span>${this.formatCount(video.views_count || 0)}</span>
                </button>
            </div>
            <div class="reel-info">
                <div class="reel-author">
                    <img src="${avatar}" class="reel-author-avatar" alt="${video.username}">
                    <span class="reel-author-name">@${video.username}</span>
                </div>
                ${video.caption ? `<p class="reel-caption">${this.escapeHtml(video.caption)}</p>` : ''}
            </div>
        </div>`;
    }

    setupReelInteractions() {
        // Click to play/pause
        document.querySelectorAll('.reel-card video').forEach(video => {
            video.addEventListener('click', () => {
                const indicator = video.closest('.reel-card').querySelector('.reel-play-indicator');
                if (video.paused) {
                    video.play();
                    indicator?.classList.remove('visible');
                } else {
                    video.pause();
                    indicator?.classList.add('visible');
                }
            });
        });

        // Like buttons
        document.querySelectorAll('.like-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const videoId = btn.dataset.id;
                try {
                    const data = await this.api(`/videos/${videoId}/like`, { method: 'POST' });
                    if (data?.success) {
                        btn.classList.toggle('liked', data.liked);
                        const span = btn.querySelector('span');
                        const current = parseInt(span.textContent) || 0;
                        span.textContent = data.liked ? current + 1 : Math.max(0, current - 1);
                    }
                } catch (err) {
                    this.showToast('Please log in to like', 'error');
                }
            });
        });

        // Track views
        document.querySelectorAll('.reel-card').forEach(card => {
            let viewed = false;
            const observer = new IntersectionObserver(entries => {
                entries.forEach(entry => {
                    if (entry.isIntersecting && !viewed) {
                        viewed = true;
                        const id = card.dataset.id;
                        this.api(`/videos/${id}/view`, { method: 'POST' }).catch(() => {});
                    }
                });
            }, { threshold: 0.5 });
            observer.observe(card);
        });
    }

    setupAutoplay() {
        if (this.feedObserver) this.feedObserver.disconnect();

        this.feedObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                const video = entry.target.querySelector('video');
                if (!video) return;
                if (entry.isIntersecting) {
                    video.play().catch(() => {});
                    video.muted = true; // Browser autoplay policy
                } else {
                    video.pause();
                }
            });
        }, { threshold: 0.7 });

        document.querySelectorAll('.reel-card').forEach(card => {
            this.feedObserver.observe(card);
        });
    }

    /* ─────────────────────────────────────────────────────────
       EXPLORE — Search
       ───────────────────────────────────────────────────────── */
    setupSearch() {
        const input = document.getElementById('searchInput');
        const clearBtn = document.getElementById('searchClear');
        let debounce = null;

        input?.addEventListener('input', () => {
            clearTimeout(debounce);
            const q = input.value.trim();
            clearBtn.style.display = q ? 'block' : 'none';

            if (q.length < 2) {
                this.renderSearchResults([]);
                return;
            }

            debounce = setTimeout(() => this.searchUsers(q), 400);
        });

        clearBtn?.addEventListener('click', () => {
            input.value = '';
            clearBtn.style.display = 'none';
            this.renderSearchResults([]);
        });
    }

    async searchUsers(q) {
        try {
            const data = await this.api(`/users/search?q=${encodeURIComponent(q)}`);
            this.renderSearchResults(data?.users || []);
        } catch (err) {
            this.showToast('Search failed', 'error');
        }
    }

    renderSearchResults(users) {
        const grid = document.getElementById('exploreGrid');
        if (!grid) return;

        if (users.length === 0) {
            grid.innerHTML = `
                <div class="explore-empty">
                    <i class="bi bi-compass"></i>
                    <p>Search for creators to discover new content</p>
                </div>`;
            return;
        }

        grid.innerHTML = users.map(u => {
            const avatar = u.profile_photo || `https://ui-avatars.com/api/?name=${u.username}&background=6366f1&color=fff&size=150`;
            return `
            <div class="user-card">
                <img src="${avatar}" class="user-card-avatar" alt="${u.username}">
                <div class="user-card-name">@${u.username}</div>
                <div class="user-card-bio">${this.escapeHtml(u.bio || 'Blink Creator')}</div>
            </div>`;
        }).join('');
    }

    /* ─────────────────────────────────────────────────────────
       UPLOAD
       ───────────────────────────────────────────────────────── */
    setupUpload() {
        const dropzone = document.getElementById('uploadDropzone');
        const fileInput = document.getElementById('videoFileInput');
        const form = document.getElementById('uploadForm');
        const preview = document.getElementById('uploadPreview');
        const captionInput = document.getElementById('uploadCaption');
        const captionCount = document.getElementById('captionCount');
        const changeBtn = document.getElementById('changeVideoBtn');
        const uploadBtn = document.getElementById('uploadBtn');

        let selectedFile = null;

        // Dropzone click
        dropzone?.addEventListener('click', () => fileInput?.click());

        // Drag & drop
        dropzone?.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropzone.classList.add('dragover');
        });
        dropzone?.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
        dropzone?.addEventListener('drop', (e) => {
            e.preventDefault();
            dropzone.classList.remove('dragover');
            const file = e.dataTransfer.files[0];
            if (file && file.type.startsWith('video/')) {
                selectFile(file);
            }
        });

        // File selection
        fileInput?.addEventListener('change', () => {
            if (fileInput.files[0]) selectFile(fileInput.files[0]);
        });

        const selectFile = (file) => {
            if (file.size > 100 * 1024 * 1024) {
                this.showToast('File too large. Max 100MB.', 'error');
                return;
            }
            selectedFile = file;
            preview.src = URL.createObjectURL(file);
            preview.play();
            dropzone.style.display = 'none';
            form.style.display = 'block';
        };

        // Change video
        changeBtn?.addEventListener('click', () => {
            selectedFile = null;
            form.style.display = 'none';
            dropzone.style.display = 'block';
            fileInput.value = '';
        });

        // Character count
        captionInput?.addEventListener('input', () => {
            captionCount.textContent = `${captionInput.value.length}/500`;
        });

        // Submit upload
        uploadBtn?.addEventListener('click', async () => {
            if (!selectedFile) {
                this.showToast('Select a video first', 'error');
                return;
            }

            const caption = document.getElementById('uploadCaption')?.value || '';
            const hashtags = document.getElementById('uploadHashtags')?.value || '';

            const formData = new FormData();
            formData.append('video', selectedFile);
            formData.append('caption', caption);
            formData.append('hashtags', hashtags);

            this.setButtonLoading(uploadBtn, true);
            const progressDiv = document.getElementById('uploadProgress');
            const uploadCard = document.getElementById('uploadCard');

            // Show progress
            form.style.display = 'none';
            progressDiv.style.display = 'block';

            try {
                const data = await this.api('/upload/video', {
                    method: 'POST',
                    body: formData
                });

                if (data?.success) {
                    this.showToast('Video published! 🎬', 'success');
                    this.feedLoaded = false; // Force refresh
                    
                    // Reset form
                    selectedFile = null;
                    fileInput.value = '';
                    document.getElementById('uploadCaption').value = '';
                    document.getElementById('uploadHashtags').value = '';
                    captionCount.textContent = '0/500';
                    progressDiv.style.display = 'none';
                    dropzone.style.display = 'block';
                    
                    this.navigateTo('feed');
                }
            } catch (err) {
                this.showToast(`Upload failed: ${err.message}`, 'error');
                progressDiv.style.display = 'none';
                form.style.display = 'block';
            } finally {
                this.setButtonLoading(uploadBtn, false);
            }
        });
    }

    /* ─────────────────────────────────────────────────────────
       PROFILE
       ───────────────────────────────────────────────────────── */
    setupProfile() {
        const avatarInput = document.getElementById('avatarInput');
        avatarInput?.addEventListener('change', async () => {
            const file = avatarInput.files[0];
            if (!file) return;

            const formData = new FormData();
            formData.append('photo', file);

            try {
                this.showToast('Updating avatar...', 'info');
                const data = await this.api('/upload/profile-photo', {
                    method: 'POST',
                    body: formData
                });

                if (data?.success) {
                    this.user.profile_photo = data.profile_photo;
                    localStorage.setItem('blink_user', JSON.stringify(this.user));
                    document.getElementById('profileAvatar').src = data.profile_photo;
                    this.updateSidebar();
                    this.showToast('Avatar updated! ✨', 'success');
                }
            } catch (err) {
                this.showToast('Avatar upload failed', 'error');
            }
        });
    }

    async loadProfile() {
        if (!this.user) return;

        try {
            const data = await this.api('/users/me');
            if (data?.user) {
                const u = data.user;
                document.getElementById('profileUsername').textContent = `@${u.username}`;
                document.getElementById('profileBio').textContent = u.bio || 'Blink member';
                document.getElementById('statPosts').textContent = u.posts_count || 0;

                const joinDate = u.created_at ? new Date(u.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '—';
                document.getElementById('statJoined').textContent = joinDate;

                if (u.profile_photo) {
                    document.getElementById('profileAvatar').src = u.profile_photo;
                } else {
                    document.getElementById('profileAvatar').src = `https://ui-avatars.com/api/?name=${u.username}&background=6366f1&color=fff&size=150`;
                }

                // Load user's videos
                this.loadUserVideos(u.id);
            }
        } catch (err) {
            console.error('Profile load error:', err);
        }
    }

    async loadUserVideos(userId) {
        const container = document.getElementById('profileVideos');
        if (!container) return;

        try {
            const data = await this.api(`/videos/user/${userId}`);
            if (!data?.data || data.data.length === 0) {
                container.innerHTML = `
                    <div class="profile-empty">
                        <i class="bi bi-camera-video"></i>
                        <p>No videos yet. Upload your first Blink!</p>
                    </div>`;
                return;
            }

            container.innerHTML = data.data.map(v => {
                const thumb = v.thumbnail_url || v.video_url;
                return `
                <div class="profile-video-card">
                    <img src="${thumb}" alt="${v.caption || 'Video'}" loading="lazy" 
                         onerror="this.parentElement.innerHTML='<video src=\\'${v.video_url}\\' muted></video>'">
                    <div class="video-stats">
                        <span><i class="bi bi-heart-fill"></i> ${this.formatCount(v.likes_count)}</span>
                        <span><i class="bi bi-eye-fill"></i> ${this.formatCount(v.views_count)}</span>
                    </div>
                </div>`;
            }).join('');
        } catch {
            container.innerHTML = '<div class="profile-empty"><p>Failed to load videos</p></div>';
        }
    }

    /* ─────────────────────────────────────────────────────────
       UI UTILITIES
       ───────────────────────────────────────────────────────── */
    setupPasswordToggles() {
        document.querySelectorAll('.pw-toggle').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const input = btn.closest('.input-group')?.querySelector('input');
                if (!input) return;
                const icon = btn.querySelector('i');
                if (input.type === 'password') {
                    input.type = 'text';
                    icon.className = 'bi bi-eye-slash-fill';
                } else {
                    input.type = 'password';
                    icon.className = 'bi bi-eye-fill';
                }
            });
        });
    }

    showToast(message, type = 'info') {
        let container = document.getElementById('toastContainer');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toastContainer';
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
            <span>${message}</span>
            <button class="toast-close" onclick="this.parentElement.remove()">×</button>
        `;
        container.appendChild(toast);

        requestAnimationFrame(() => toast.classList.add('show'));
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 400);
        }, 4000);
    }

    showAlert(el, message, type) {
        if (!el) return;
        el.textContent = message;
        el.className = `auth-alert ${type}`;
    }

    hideAlert(el) {
        if (!el) return;
        el.className = 'auth-alert';
        el.textContent = '';
    }

    setButtonLoading(btn, loading) {
        if (!btn) return;
        btn.classList.toggle('loading', loading);
        btn.disabled = loading;
    }

    formatCount(num) {
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
        return String(num || 0);
    }

    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
}

// ── Boot ──
const app = new BlinkApp();
