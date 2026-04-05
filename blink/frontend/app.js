/* ═══════════════════════════════════════════════════════════════════════════════
   BLINK 2.0 — Unified SPA Engine
   Auth | Feed | Double-Tap Like | Comments | Profiles | Mute | Search
   ═══════════════════════════════════════════════════════════════════════════════ */

class BlinkApp {
    constructor() {
        this.API_BASE = this.detectApiBase();
        this.token = localStorage.getItem('blink_token');
        this.user = this.loadUser();
        this.currentPage = 'feed';
        this.feedLoaded = false;
        this.feedObserver = null;
        this.isMuted = true;           // Feature 6: mute state
        this.viewedVideos = new Set();  // Feature 5: session-based view tracking
        this.commentVideoId = null;    // Feature 3: active comment video
        
        // Phase 7: Chat State
        this.activeConversationId = null;
        this.conversations = [];
        this.isTypingTimeout = null;
        
        // Phase 4: Socket.IO
        this.socket = typeof io !== 'undefined' ? io() : null;
        this.setupSocket();

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
        this.setupComments();
        this.setupChat(); // Phase 7
        this.checkAuth();
    }

    detectApiBase() {
        const host = window.location.hostname;
        if (host === 'localhost' || host === '127.0.0.1') {
            return `http://${host}:5000`;
        }
        if (window.location.protocol === 'file:') {
            return 'http://localhost:5000';
        }
        return 'https://blink-yzoo.onrender.com';
    }

    setupSocket() {
        if (!this.socket) return;
        this.socket.on('update_likes', (data) => {
            const btn = document.querySelector(`.like-btn[data-id="${data.videoId}"]`);
            if (btn) btn.querySelector('span').textContent = this.formatCount(data.likes_count);
        });
        this.socket.on('update_views', (data) => {
            const btn = document.querySelector(`.reel-card[data-id="${data.videoId}"] .view-count-btn span`);
            if (btn) btn.textContent = this.formatCount(data.views_count);
        });

        // Phase 7: Chat Sockets
        this.socket.on('receive_message', (msg) => this.handleReceiveMessage(msg));
        this.socket.on('user_typing', (data) => this.handleUserTyping(data));
        this.socket.on('new_message_notification', (data) => this.handleChatNotification(data));
        this.socket.on('online_status', (data) => this.handleOnlineStatus(data));
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

        if (!(options.body instanceof FormData)) {
            headers['Content-Type'] = 'application/json';
        }

        try {
            const res = await fetch(url, { ...options, headers });
            const data = await res.json().catch(() => null);

            if (res.status === 401) {
                this.logout();
                return null;
            }
            if (!res.ok) {
                const errorMsg = data?.error || data?.message || `HTTP ${res.status}`;
                console.error(`API Error [${res.status}] on ${endpoint}:`, data);
                throw new Error(errorMsg);
            }
            return data;
        } catch (err) {
            console.error(`API ${endpoint} failed:`, err.message, err);
            throw err;
        }
    }

    /* ─────────────────────────────────────────────────────────
       AUTH SYSTEM
       ───────────────────────────────────────────────────────── */
    setupAuth() {
        const tabLogin = document.getElementById('tabLogin');
        const tabSignup = document.getElementById('tabSignup');
        const loginForm = document.getElementById('loginForm');
        const signupForm = document.getElementById('signupForm');
        const indicator = document.getElementById('tabIndicator');

        tabLogin?.addEventListener('click', () => {
            tabLogin.classList.add('active'); tabSignup.classList.remove('active');
            loginForm.classList.add('active'); signupForm.classList.remove('active');
            indicator?.classList.remove('right');
        });
        tabSignup?.addEventListener('click', () => {
            tabSignup.classList.add('active'); tabLogin.classList.remove('active');
            signupForm.classList.add('active'); loginForm.classList.remove('active');
            indicator?.classList.add('right');
        });

        // Login
        loginForm?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('loginBtn');
            const alert = document.getElementById('loginAlert');
            const identifierInput = document.getElementById('loginIdentifier');
            const passwordInput = document.getElementById('loginPassword');
            const identifier = identifierInput.value.trim();
            const password = passwordInput.value;

            this.clearFieldErrors(loginForm);
            if (!identifier) { this.highlightFieldError(identifierInput, alert, 'Email or username is required'); return; }
            if (!password) { this.highlightFieldError(passwordInput, alert, 'Password is required'); return; }
            
            this.setButtonLoading(btn, true); this.hideAlert(alert);

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
                this.setButtonLoading(btn, false);
                const fieldMap = { 'identifier': identifierInput, 'password': passwordInput };
                if (err.field && fieldMap[err.field]) {
                    this.highlightFieldError(fieldMap[err.field], alert, err.message);
                } else {
                    this.showAlert(alert, err.message || 'Invalid credentials', 'error');
                }
            }
        });

        // Add auto-clear on type
        loginForm?.querySelectorAll('input').forEach(input => {
            input.addEventListener('input', () => this.clearFieldErrors(loginForm));
        });

        // Signup
        signupForm?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('signupBtn');
            const alert = document.getElementById('signupAlert');
            const userInput = document.getElementById('signupUsername');
            const emailInput = document.getElementById('signupEmail');
            const passInput = document.getElementById('signupPassword');
            
            const username = userInput.value.trim();
            const email = emailInput.value.trim();
            const password = passInput.value;

            this.clearFieldErrors(signupForm);
            if (!username) { this.highlightFieldError(userInput, alert, 'Username is required'); return; }
            if (!email) { this.highlightFieldError(emailInput, alert, 'Email is required'); return; }
            if (!password) { this.highlightFieldError(passInput, alert, 'Password is required'); return; }
            if (password.length < 6) { this.highlightFieldError(passInput, alert, 'Password must be at least 6 characters'); return; }
            
            this.setButtonLoading(btn, true); this.hideAlert(alert);

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
                this.setButtonLoading(btn, false);
                const fieldMap = { 'username': userInput, 'email': emailInput, 'password': passInput };
                if (err.field && fieldMap[err.field]) {
                    this.highlightFieldError(fieldMap[err.field], alert, err.message);
                } else {
                    this.showAlert(alert, err.message || 'Registration failed', 'error');
                }
            }
        });

        signupForm?.querySelectorAll('input').forEach(input => {
            input.addEventListener('input', () => this.clearFieldErrors(signupForm));
        });

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
        this.token = token; this.user = user;
        localStorage.setItem('blink_token', token);
        localStorage.setItem('blink_user', JSON.stringify(user));
    }

    async logout() {
        try {
            // Server-side logout (clears session in DB)
            await this.api('/auth/logout', { method: 'POST' });
        } catch (err) {
            console.error('Logout API failed:', err);
        }

        // Client-side cleanup
        this.token = null; 
        this.user = null;
        localStorage.removeItem('blink_token');
        localStorage.removeItem('blink_user');
        window.location.reload();
    }

    loadUser() {
        try { return JSON.parse(localStorage.getItem('blink_user')); }
        catch { return null; }
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
            if (link) { e.preventDefault(); this.navigateTo(link.getAttribute('data-page')); }
        });
    }

    navigateTo(page) {
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        const target = document.getElementById(`page-${page}`);
        if (target) target.classList.add('active');

        document.querySelectorAll('.nav-link[data-page]').forEach(link => {
            link.classList.toggle('active', link.getAttribute('data-page') === page);
        });
        document.querySelectorAll('.bottom-link[data-page]').forEach(link => {
            link.classList.toggle('active', link.getAttribute('data-page') === page);
        });

        this.currentPage = page;

        if (page === 'feed' && !this.feedLoaded) this.loadFeed();
        if (page === 'profile') this.loadProfile();
        if (page === 'chat') {
            this.loadConversations();
            // Reset chat list visibility for mobile
            const panel = document.getElementById('chatListPanel');
            if (panel) panel.classList.remove('hidden');
            const window = document.getElementById('chatWindowPanel');
            if (window) window.classList.remove('active');
        }
    }

    /* ─────────────────────────────────────────────────────────
       VIDEO FEED — With all social features
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
            this.feedLoaded = false; // allow retry
            container.innerHTML = `
                <div class="feed-empty">
                    <i class="bi bi-wifi-off"></i>
                    <h2>Connection Error</h2>
                    <p>${err.message || 'Failed to load feed'}</p>
                    <button id="retryFeedBtn" style="
                        margin-top:1.5rem;
                        padding:.75rem 2rem;
                        background:linear-gradient(135deg,#6366f1,#8b5cf6);
                        border:none; border-radius:999px;
                        color:#fff; font-size:.95rem;
                        font-weight:600; cursor:pointer;
                        box-shadow:0 4px 20px rgba(99,102,241,.4);
                    ">
                        <i class="bi bi-arrow-clockwise"></i> Retry
                    </button>
                </div>`;
            document.getElementById('retryFeedBtn')?.addEventListener('click', () => this.loadFeed());
        }
    }

    createReelCard(video) {
        const avatar = video.profile_photo || `https://ui-avatars.com/api/?name=${video.username}&background=6366f1&color=fff&size=80`;
        const likedClass = video.liked_by_me ? 'liked' : '';
        return `
        <div class="reel-card" data-id="${video.id}" data-userId="${video.userId}">
            <video src="${video.videoUrl}" loop playsinline preload="metadata" muted></video>
            <div class="reel-overlay"></div>
            <div class="reel-play-indicator"><i class="bi bi-play-fill"></i></div>
            <div class="double-tap-heart"><i class="bi bi-heart-fill"></i></div>
            <div class="reel-actions">
                <button class="reel-action-btn like-btn ${likedClass}" data-id="${video.id}">
                    <i class="bi bi-heart-fill"></i>
                    <span>${this.formatCount(video.likes_count || 0)}</span>
                </button>
                <button class="reel-action-btn comment-btn" data-id="${video.id}">
                    <i class="bi bi-chat-dots-fill"></i>
                    <span>${this.formatCount(video.comments_count || 0)}</span>
                </button>
                <button class="reel-action-btn view-count-btn">
                    <i class="bi bi-eye-fill"></i>
                    <span>${this.formatCount(video.views_count || 0)}</span>
                </button>
                <button class="reel-action-btn mute-btn" title="Toggle sound">
                    <i class="bi bi-volume-mute-fill"></i>
                </button>
            </div>
            <div class="reel-info">
                <div class="reel-author" data-user-id="${video.user_id}">
                    <img src="${avatar}" class="reel-author-avatar" alt="${video.username}" loading="lazy">
                    <span class="reel-author-name">@${video.username}</span>
                </div>
                ${video.caption ? `<p class="reel-caption">${this.escapeHtml(video.caption)}</p>` : ''}
            </div>
        </div>`;
    }

    /* ─────────────────────────────────────────────────────────
       REEL INTERACTIONS — Like, Double-tap, Mute, Comments, Views
       ───────────────────────────────────────────────────────── */
    setupReelInteractions() {
        const cards = document.querySelectorAll('.reel-card');

        cards.forEach(card => {
            const video = card.querySelector('video');
            const indicator = card.querySelector('.reel-play-indicator');
            const doubleTapHeart = card.querySelector('.double-tap-heart');
            let lastTap = 0;

            // ── FEATURE 2: DOUBLE TAP TO LIKE ──────────────────
            video.addEventListener('click', (e) => {
                const now = Date.now();
                const timeSince = now - lastTap;

                if (timeSince < 300 && timeSince > 0) {
                    // Double tap detected!
                    e.preventDefault();
                    this.handleDoubleTapLike(card);
                } else {
                    // Single tap — play/pause after a short delay
                    setTimeout(() => {
                        const now2 = Date.now();
                        if (now2 - lastTap >= 300) {
                            if (video.paused) {
                                video.play();
                                indicator?.classList.remove('visible');
                            } else {
                                video.pause();
                                indicator?.classList.add('visible');
                            }
                        }
                    }, 300);
                }
                lastTap = now;
            });

            // Prevent context menu on long press mobile
            video.addEventListener('contextmenu', e => e.preventDefault());
        });

        // ── FEATURE 1: LIKE BUTTON ──────────────────────────
        document.querySelectorAll('.like-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                await this.toggleLike(btn);
            });
        });

        // ── FEATURE 3: COMMENT BUTTON ───────────────────────
        document.querySelectorAll('.comment-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.openComments(btn.dataset.id);
            });
        });

        // ── FEATURE 6: MUTE / UNMUTE ────────────────────────
        document.querySelectorAll('.mute-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.isMuted = !this.isMuted;
                this.updateAllMuteState();
            });
        });

        // ── FEATURE 5: VIEW COUNT (once per session) ────────
        cards.forEach(card => {
            const observer = new IntersectionObserver(entries => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const id = card.dataset.id;
                        if (!this.viewedVideos.has(id)) {
                            this.viewedVideos.add(id);
                            this.api(`/videos/${id}/view`, { method: 'POST' }).catch(() => {});
                        }
                    }
                });
            }, { threshold: 0.5 });
            observer.observe(card);
        });

        // ── FEATURE 4: CLICK USERNAME → OPEN PROFILE ────────
        document.querySelectorAll('.reel-author').forEach(author => {
            author.addEventListener('click', (e) => {
                e.stopPropagation();
                const userId = author.dataset.userId;
                if (userId) this.openUserProfile(parseInt(userId));
            });
        });
    }

    /* ── FEATURE 2: Double Tap Heart Animation ───────────── */
    async handleDoubleTapLike(card) {
        const videoId = card.dataset.id;
        const heartOverlay = card.querySelector('.double-tap-heart');
        const likeBtn = card.querySelector('.like-btn');

        // Trigger heart animation
        heartOverlay.classList.remove('active');
        void heartOverlay.offsetWidth; // Force reflow
        heartOverlay.classList.add('active');

        // Remove animation class after it completes
        setTimeout(() => heartOverlay.classList.remove('active'), 900);

        // Only like if not already liked
        if (!likeBtn.classList.contains('liked')) {
            await this.toggleLike(likeBtn);
        }
    }

    /* ── FEATURE 1: Toggle Like with optimistic update ───── */
    async toggleLike(btn) {
        const videoId = btn.dataset.id;
        const wasLiked = btn.classList.contains('liked');
        const span = btn.querySelector('span');
        const currentCount = parseInt(span.textContent) || 0;

        // Optimistic update
        btn.classList.toggle('liked');
        btn.classList.add('pop');
        span.textContent = wasLiked ? Math.max(0, currentCount - 1) : currentCount + 1;

        // Remove pop class after animation
        setTimeout(() => btn.classList.remove('pop'), 400);

        try {
            const data = await this.api(`/videos/${videoId}/like`, { method: 'POST' });
            if (data?.success) {
                // Sync with server truth
                btn.classList.toggle('liked', data.liked);
                span.textContent = this.formatCount(data.likes_count);
            }
        } catch (err) {
            // Revert optimistic update
            btn.classList.toggle('liked', wasLiked);
            span.textContent = currentCount;
            this.showToast('Please log in to like', 'error');
        }
    }

    /* ── FEATURE 6: Mute/Unmute all videos ───────────────── */
    updateAllMuteState() {
        document.querySelectorAll('.reel-card video').forEach(video => {
            video.muted = this.isMuted;
        });
        document.querySelectorAll('.mute-btn i').forEach(icon => {
            icon.className = this.isMuted ? 'bi bi-volume-mute-fill' : 'bi bi-volume-up-fill';
        });
    }

    setupAutoplay() {
        if (this.feedObserver) this.feedObserver.disconnect();

        this.feedObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                const video = entry.target.querySelector('video');
                if (!video) return;
                if (entry.isIntersecting) {
                    video.muted = this.isMuted;
                    video.play().catch(() => {});
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
       FEATURE 3: COMMENTS SYSTEM
       ───────────────────────────────────────────────────────── */
    setupComments() {
        const drawer = document.getElementById('commentsDrawer');
        const backdrop = document.getElementById('commentsBackdrop');
        const closeBtn = document.getElementById('commentsClose');
        const form = document.getElementById('commentForm');

        // Close
        backdrop?.addEventListener('click', () => this.closeComments());
        closeBtn?.addEventListener('click', () => this.closeComments());

        // Submit
        form?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const input = document.getElementById('commentInput');
            const text = input.value.trim();
            if (!text || !this.commentVideoId) return;

            const sendBtn = document.getElementById('commentSendBtn');
            sendBtn.disabled = true;
            input.value = '';

            try {
                const data = await this.api(`/videos/${this.commentVideoId}/comments`, {
                    method: 'POST',
                    body: JSON.stringify({ text })
                });

                if (data?.success) {
                    this.prependComment(data.comment);
                    this.updateCommentCount(this.commentVideoId, data.comments_count);
                    document.getElementById('commentsCountBadge').textContent = data.comments_count;
                }
            } catch (err) {
                this.showToast(err.message || 'Failed to post comment', 'error');
                input.value = text; // Restore on failure
            } finally {
                sendBtn.disabled = false;
                input.focus();
            }
        });
    }

    async openComments(videoId) {
        this.commentVideoId = videoId;
        const drawer = document.getElementById('commentsDrawer');
        const list = document.getElementById('commentsList');
        const badge = document.getElementById('commentsCountBadge');

        drawer.classList.add('open');
        list.innerHTML = '<div class="comments-empty"><div class="pulse-loader" style="width:32px;height:32px;"></div></div>';
        badge.textContent = '…';

        try {
            const data = await this.api(`/videos/${videoId}/comments`);
            const comments = data?.data || [];
            badge.textContent = comments.length;

            if (comments.length === 0) {
                list.innerHTML = `
                    <div class="comments-empty">
                        <i class="bi bi-chat-dots"></i>
                        <p>No comments yet. Be the first!</p>
                    </div>`;
            } else {
                list.innerHTML = comments.map(c => this.createCommentHTML(c)).join('');
                this.bindCommentActions();
            }
        } catch (err) {
            list.innerHTML = '<div class="comments-empty"><p>Failed to load comments</p></div>';
        }

        document.getElementById('commentInput')?.focus();
    }

    closeComments() {
        document.getElementById('commentsDrawer')?.classList.remove('open');
        this.commentVideoId = null;
    }

    createCommentHTML(c) {
        const avatar = c.profile_photo || `https://ui-avatars.com/api/?name=${c.username}&background=6366f1&color=fff&size=72`;
        const isOwn = this.user && c.user_id === this.user.id;
        return `
        <div class="comment-item" data-id="${c.id}">
            <img src="${avatar}" class="comment-avatar" data-user-id="${c.user_id}" alt="${c.username}">
            <div class="comment-body">
                <div class="comment-meta">
                    <span class="comment-username" data-user-id="${c.user_id}">@${c.username}</span>
                    <span class="comment-time">${this.timeAgo(c.created_at)}</span>
                    ${isOwn ? `<button class="comment-delete" data-id="${c.id}" title="Delete"><i class="bi bi-trash3"></i></button>` : ''}
                </div>
                <p class="comment-text">${this.escapeHtml(c.text)}</p>
            </div>
        </div>`;
    }

    prependComment(c) {
        const list = document.getElementById('commentsList');
        const empty = list.querySelector('.comments-empty');
        if (empty) empty.remove();

        const temp = document.createElement('div');
        temp.innerHTML = this.createCommentHTML(c);
        const item = temp.firstElementChild;
        list.prepend(item);
        this.bindCommentActions();
    }

    bindCommentActions() {
        // Delete buttons
        document.querySelectorAll('.comment-delete').forEach(btn => {
            btn.onclick = async () => {
                const commentId = btn.dataset.id;
                try {
                    const data = await this.api(`/comments/${commentId}`, { method: 'DELETE' });
                    if (data?.success) {
                        btn.closest('.comment-item')?.remove();
                        this.updateCommentCount(this.commentVideoId, data.comments_count);
                        document.getElementById('commentsCountBadge').textContent = data.comments_count;

                        if (!document.querySelector('.comment-item')) {
                            document.getElementById('commentsList').innerHTML = `
                                <div class="comments-empty">
                                    <i class="bi bi-chat-dots"></i>
                                    <p>No comments yet. Be the first!</p>
                                </div>`;
                        }
                    }
                } catch (err) {
                    this.showToast('Failed to delete', 'error');
                }
            };
        });

        // Click on username/avatar → open profile
        document.querySelectorAll('.comment-username, .comment-avatar').forEach(el => {
            el.onclick = () => {
                const userId = el.dataset.userId;
                if (userId) {
                    this.closeComments();
                    this.openUserProfile(parseInt(userId));
                }
            };
        });
    }

    updateCommentCount(videoId, count) {
        const btn = document.querySelector(`.comment-btn[data-id="${videoId}"]`);
        if (btn) btn.querySelector('span').textContent = this.formatCount(count);
    }

    /* ─────────────────────────────────────────────────────────
       FEATURE 4: USER PROFILE — Self & Others
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
                const data = await this.api('/upload/profile-photo', { method: 'POST', body: formData });

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
                document.getElementById('statFollowers').textContent = this.formatCount(u.followers_count || 0);
                document.getElementById('statFollowing').textContent = this.formatCount(u.following_count || 0);
                document.getElementById('statLikes').textContent = this.formatCount(u.total_likes || 0);
                document.getElementById('statViews').textContent = this.formatCount(u.total_views || 0);

                const avatarUrl = u.profile_photo || `https://ui-avatars.com/api/?name=${u.username}&background=6366f1&color=fff&size=150`;
                document.getElementById('profileAvatar').src = avatarUrl;

                this.loadUserVideos(u.id, 'profileVideos');
            }
        } catch (err) {
            console.error('Profile load error:', err);
        }
    }

    /* ── Open other user's profile ───────────────────────── */
    async openUserProfile(userId) {
        // If it's the current user, navigate to own profile
        if (this.user && userId === this.user.id) {
            this.navigateTo('profile');
            return;
        }

        // Show user profile page
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.getElementById('page-user-profile').classList.add('active');
        this.currentPage = 'user-profile';

        // Clear active nav
        document.querySelectorAll('.nav-link[data-page], .bottom-link[data-page]').forEach(l => l.classList.remove('active'));

        try {
            const data = await this.api(`/users/${userId}`);
            if (data?.user) {
                const u = data.user;
                document.getElementById('userProfileUsername').textContent = `@${u.username}`;
                document.getElementById('userProfileBio').textContent = u.bio || 'Blink member';
                document.getElementById('userStatPosts').textContent = u.posts_count || 0;
                document.getElementById('userStatFollowers').textContent = this.formatCount(u.followers_count || 0);
                document.getElementById('userStatFollowing').textContent = this.formatCount(u.following_count || 0);
                document.getElementById('userStatLikes').textContent = this.formatCount(u.total_likes || 0);
                document.getElementById('userStatViews').textContent = this.formatCount(u.total_views || 0);

                const avatarUrl = u.profile_photo || `https://ui-avatars.com/api/?name=${u.username}&background=6366f1&color=fff&size=150`;
                document.getElementById('userProfileAvatar').src = avatarUrl;
                
                // Profile Actions
                const btnWrap = document.getElementById('userProfileActions');
                if (btnWrap) {
                    btnWrap.innerHTML = `
                        <button class="profile-follow-btn ${u.is_following ? 'following' : ''}" id="followBtn">
                            ${u.is_following ? 'Following' : 'Follow'}
                        </button>
                        <button class="profile-msg-btn" id="profileMsgBtn">
                            <i class="bi bi-chat-text"></i> Message
                        </button>
                    `;
                    document.getElementById('followBtn').onclick = () => this.toggleFollow(u.id);
                    document.getElementById('profileMsgBtn').onclick = () => this.openChatWithUser(u.id, u.username, avatarUrl);
                }

                this.loadUserVideos(userId, 'userProfileVideos');
            }
        } catch (err) {
            this.showToast('Failed to load profile', 'error');
        }
    }

    async toggleFollow(userId) {
        const btn = document.getElementById('followBtn');
        if (!this.user) { this.showToast('Please sign in to follow', 'error'); return; }
        
        try {
            const data = await this.api(`/users/follow/${userId}`, { method: 'POST' });
            if (data?.success) {
                const isFollowing = btn.classList.toggle('following');
                btn.textContent = isFollowing ? 'Following' : 'Follow';
                this.showToast(isFollowing ? 'Followed!' : 'Unfollowed');
            }
        } catch (err) {
            this.showToast('Failed to toggle follow', 'error');
        }
    }

    async loadUserVideos(userId, containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        try {
            const data = await this.api(`/videos/user/${userId}`);
            if (!data?.data || data.data.length === 0) {
                container.innerHTML = `
                    <div class="profile-empty">
                        <i class="bi bi-camera-video"></i>
                        <p>No videos yet${containerId === 'profileVideos' ? '. Upload your first Blink!' : ''}</p>
                    </div>`;
                return;
            }

            container.innerHTML = data.data.map(v => {
                const thumb = v.thumbnail_url || v.video_url;
                const isOwn = this.user && userId === this.user.id;
                return `
                <div class="profile-video-card" data-id="${v.id}">
                    <img src="${thumb}" alt="${v.caption || 'Video'}" loading="lazy"
                         onerror="this.style.display='none'; this.parentElement.insertAdjacentHTML('afterbegin', '<video src=\\'${v.video_url}\\' muted></video>')">
                    <div class="video-stats">
                        <span><i class="bi bi-heart-fill"></i> ${this.formatCount(v.likes_count)}</span>
                        <span><i class="bi bi-eye-fill"></i> ${this.formatCount(v.views_count)}</span>
                    </div>
                    ${isOwn ? `<button class="video-delete-btn" data-id="${v.id}"><i class="bi bi-trash3-fill"></i></button>` : ''}
                </div>`;
            }).join('');

            // Bind delete
            container.querySelectorAll('.video-delete-btn').forEach(btn => {
                btn.onclick = async (e) => {
                    e.stopPropagation();
                    if (!confirm('Delete this video forever?')) return;
                    try {
                        const res = await this.api(`/videos/${btn.dataset.id}`, { method: 'DELETE' });
                        if (res?.success) {
                            btn.closest('.profile-video-card').remove();
                            this.showToast('Video deleted');
                        }
                    } catch (err) { this.showToast('Delete failed', 'error'); }
                };
            });
        } catch {
            container.innerHTML = '<div class="profile-empty"><p>Failed to load videos</p></div>';
        }
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
            if (q.length < 2) { this.renderSearchResults([]); return; }
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
            <div class="user-card" data-user-id="${u.id}">
                <img src="${avatar}" class="user-card-avatar" alt="${u.username}">
                <div class="user-card-name">@${u.username}</div>
                <div class="user-card-bio">${this.escapeHtml(u.bio || 'Blink Creator')}</div>
            </div>`;
        }).join('');

        // Click user cards → open profile
        grid.querySelectorAll('.user-card').forEach(card => {
            card.addEventListener('click', () => {
                const userId = parseInt(card.dataset.userId);
                if (userId) this.openUserProfile(userId);
            });
        });
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

        dropzone?.addEventListener('click', () => fileInput?.click());
        dropzone?.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('dragover'); });
        dropzone?.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
        dropzone?.addEventListener('drop', (e) => {
            e.preventDefault(); dropzone.classList.remove('dragover');
            const file = e.dataTransfer.files[0];
            if (file && file.type.startsWith('video/')) selectFile(file);
        });

        fileInput?.addEventListener('change', () => {
            if (fileInput.files[0]) selectFile(fileInput.files[0]);
        });

        const selectFile = (file) => {
            if (file.size > 100 * 1024 * 1024) { this.showToast('File too large. Max 100MB.', 'error'); return; }
            selectedFile = file;
            preview.src = URL.createObjectURL(file);
            preview.play();
            dropzone.style.display = 'none';
            form.style.display = 'block';
        };

        changeBtn?.addEventListener('click', () => {
            selectedFile = null; form.style.display = 'none';
            dropzone.style.display = 'block'; fileInput.value = '';
        });

        captionInput?.addEventListener('input', () => {
            captionCount.textContent = `${captionInput.value.length}/500`;
        });

        uploadBtn?.addEventListener('click', async () => {
            if (!selectedFile) { this.showToast('Select a video first', 'error'); return; }

            const caption = document.getElementById('uploadCaption')?.value || '';
            const hashtags = document.getElementById('uploadHashtags')?.value || '';

            const formData = new FormData();
            formData.append('video', selectedFile);
            formData.append('caption', caption);
            formData.append('hashtags', hashtags);

            this.setButtonLoading(uploadBtn, true);
            const progressDiv = document.getElementById('uploadProgress');

            form.style.display = 'none';
            progressDiv.style.display = 'block';
            
            // Phase 6: Upload Progress via XHR
            const xhr = new XMLHttpRequest();
            xhr.open('POST', `${this.API_BASE}/api/upload/video`);
            if (this.token) xhr.setRequestHeader('Authorization', `Bearer ${this.token}`);

            xhr.upload.onprogress = (e) => {
                if (e.lengthComputable) {
                    const percent = Math.round((e.loaded / e.total) * 100);
                    document.getElementById('progressText').textContent = `${percent}%`;
                    const offset = 283 - (283 * percent) / 100;
                    document.getElementById('progressCircle').style.strokeDashoffset = offset;
                }
            };

            xhr.onload = () => {
                this.setButtonLoading(uploadBtn, false);
                const data = JSON.parse(xhr.responseText);
                if (xhr.status >= 200 && xhr.status < 300 && data.success) {
                    this.showToast('Video published! 🎬', 'success');
                    this.feedLoaded = false;
                    selectedFile = null; 
                    if(fileInput) fileInput.value = '';
                    if(form) form.style.display = 'none';
                    if(dropzone) dropzone.style.display = 'block';
                    if(document.getElementById('uploadCaption')) document.getElementById('uploadCaption').value = '';
                    if(document.getElementById('uploadHashtags')) document.getElementById('uploadHashtags').value = '';
                    if(captionCount) captionCount.textContent = '0/500';
                    progressDiv.style.display = 'none';
                    this.navigateTo('feed');
                } else {
                    this.showToast(`Upload failed: ${data.error || 'Server error'}`, 'error');
                    progressDiv.style.display = 'none';
                    if(form) form.style.display = 'block';
                }
            };

            xhr.onerror = () => {
                this.setButtonLoading(uploadBtn, false);
                this.showToast('Upload failed: Connection error', 'error');
                progressDiv.style.display = 'none';
                if(form) form.style.display = 'block';
            };

            xhr.send(formData);
        });
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
                input.type = input.type === 'password' ? 'text' : 'password';
                icon.className = input.type === 'password' ? 'bi bi-eye-fill' : 'bi bi-eye-slash-fill';
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
        toast.innerHTML = `<span>${message}</span><button class="toast-close" onclick="this.parentElement.remove()">×</button>`;
        container.appendChild(toast);

        requestAnimationFrame(() => toast.classList.add('show'));
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 400);
        }, 4000);
    }

    showAlert(el, message, type) { if (!el) return; el.textContent = message; el.className = `auth-alert ${type}`; }
    hideAlert(el) { if (!el) return; el.className = 'auth-alert'; el.textContent = ''; }
    
    highlightFieldError(input, alertEl, message) {
        if (!input) return;
        input.classList.add('field-error');
        // Show message in specific span if exists
        const errorSpan = document.getElementById(`${input.id}Error`);
        if (errorSpan) {
            errorSpan.textContent = message;
            errorSpan.classList.add('visible');
        } else {
            // Fallback to global alert if span missing
            this.showAlert(alertEl, message, 'error');
        }
        input.focus();
    }

    clearFieldErrors(form) {
        if (!form) return;
        form.querySelectorAll('input').forEach(i => {
            i.classList.remove('field-error');
            const span = document.getElementById(`${i.id}Error`);
            if (span) {
                span.textContent = '';
                span.classList.remove('visible');
            }
        });
        const alert = form.querySelector('.auth-alert');
        if (alert) this.hideAlert(alert);
    }
    setButtonLoading(btn, loading) { if (!btn) return; btn.classList.toggle('loading', loading); btn.disabled = loading; }

    formatCount(num) {
        num = parseInt(num) || 0;
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
        return String(num);
    }

    timeAgo(dateStr) {
        const now = Date.now();
        const date = new Date(dateStr).getTime();
        const diff = Math.floor((now - date) / 1000);
        if (diff < 60) return 'just now';
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
        if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
        return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    /* ─────────────────────────────────────────────────────────
       Phase 7: DIRECT MESSAGING (DM)
       ───────────────────────────────────────────────────────── */
    setupChat() {
        const input = document.getElementById('messageInput');
        const sendBtn = document.getElementById('sendMsgBtn');
        const backBtn = document.getElementById('chatBack');

        input?.addEventListener('input', () => {
            const hasText = input.value.trim().length > 0;
            sendBtn.disabled = !hasText;
            sendBtn.classList.toggle('active', hasText);
            
            // Typing Indicator
            this.socket.emit('typing', { 
                conversationId: this.activeConversationId, 
                userId: this.user.id, 
                isTyping: hasText 
            });
        });

        sendBtn?.addEventListener('click', () => this.sendMessage());
        input?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        backBtn?.addEventListener('click', () => {
            document.getElementById('chatListPanel')?.classList.remove('hidden');
            document.getElementById('chatWindowPanel')?.classList.remove('active');
        });
    }

    async loadConversations() {
        const list = document.getElementById('conversationList');
        if (!list) return;

        try {
            const data = await this.api('/chat/conversations');
            this.conversations = data?.conversations || [];
            this.renderConversations();
        } catch (err) {
            list.innerHTML = `<div class="chat-error">Failed to load chats</div>`;
        }
    }

    renderConversations() {
        const list = document.getElementById('conversationList');
        if (!list) return;

        if (this.conversations.length === 0) {
            list.innerHTML = `<div class="chat-empty-list">No messages yet</div>`;
            return;
        }

        list.innerHTML = this.conversations.map(c => {
            const avatar = c.other_profile_photo || `https://ui-avatars.com/api/?name=${c.other_username}&background=6366f1&color=fff`;
            const activeClass = this.activeConversationId === c.id ? 'active' : '';
            const unread = c.unread_count > 0 ? `<span class="conv-unread">${c.unread_count}</span>` : '';
            
            return `
            <div class="conv-item ${activeClass}" data-id="${c.id}" onclick="app.openChat(${c.id}, '${c.other_username}', '${avatar}')">
                <div class="conv-avatar-wrap">
                    <img src="${avatar}" class="conv-avatar">
                    <div class="status-dot offline" data-user-id="${c.other_user_id}"></div>
                </div>
                <div class="conv-info">
                    <div class="conv-name-row">
                        <span class="conv-name">${c.other_username}</span>
                        <span class="conv-time">${this.timeAgo(c.last_message_at || c.created_at)}</span>
                    </div>
                    <div class="conv-msg-row">
                        <span class="conv-last-msg">${this.escapeHtml(c.last_message || 'No messages yet')}</span>
                        ${unread}
                    </div>
                </div>
            </div>`;
        }).join('');
    }

    async openChat(convId, username, avatar) {
        this.activeConversationId = convId;
        this.renderConversations(); // Update active state in list

        // UI Transitions
        document.getElementById('chatEmptyState').style.display = 'none';
        document.getElementById('chatActive').style.display = 'flex';
        
        // Mobile Transition
        if (window.innerWidth <= 768) {
            document.getElementById('chatListPanel').classList.add('hidden');
            document.getElementById('chatWindowPanel').classList.add('active');
        }

        // Header Info
        document.getElementById('chatHeaderName').textContent = username;
        document.getElementById('chatHeaderAvatar').src = avatar;

        // Join Room
        this.socket.emit('join_room', convId);

        // Load Messages
        const msgContainer = document.getElementById('chatMessages');
        msgContainer.innerHTML = '<div class="chat-loading"><i class="bi bi-arrow-clockwise spin"></i></div>';

        try {
            const data = await this.api(`/chat/messages/${convId}`);
            this.renderMessages(data.messages || []);
        } catch (err) {
            msgContainer.innerHTML = '<div class="chat-error">Failed to load history</div>';
        }
    }

    renderMessages(messages) {
        const container = document.getElementById('chatMessages');
        if (!container) return;

        container.innerHTML = messages.map(m => {
            const isSent = m.sender_id === this.user.id;
            const seenIcon = isSent ? (m.seen ? '<i class="bi bi-check2-all msg-seen"></i>' : '<i class="bi bi-check2"></i>') : '';
            return `
            <div class="message ${isSent ? 'sent' : 'received'}">
                <div class="msg-bubble">${this.escapeHtml(m.text)}</div>
                <div class="msg-meta">
                    ${new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    ${seenIcon}
                </div>
            </div>`;
        }).join('');
        
        container.scrollTop = container.scrollHeight;
    }

    async sendMessage() {
        const input = document.getElementById('messageInput');
        const text = input.value.trim();
        if (!text || !this.activeConversationId) return;

        const conv = this.conversations.find(c => c.id === this.activeConversationId);
        const receiverId = conv ? conv.other_user_id : null;

        input.value = '';
        document.getElementById('sendMsgBtn').disabled = true;

        // Optimistic UI & Socket
        const msgData = {
            conversationId: this.activeConversationId,
            senderId: this.user.id,
            receiverId: receiverId,
            text: text,
            created_at: new Date()
        };

        this.socket.emit('send_message', msgData);
        
        // Save to DB
        try {
            await this.api('/chat/messages', {
                method: 'POST',
                body: JSON.stringify({
                    receiverId,
                    text
                })
            });
        } catch (err) {
            this.showToast('Message failed to sync', 'error');
        }
    }

    handleReceiveMessage(msg) {
        if (this.activeConversationId === msg.conversationId) {
            const container = document.getElementById('chatMessages');
            const isSent = msg.senderId === this.user.id;
            const msgHtml = `
            <div class="message ${isSent ? 'sent' : 'received'}">
                <div class="msg-bubble">${this.escapeHtml(msg.text)}</div>
                <div class="msg-meta">
                    ${new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
            </div>`;
            container.insertAdjacentHTML('beforeend', msgHtml);
            container.scrollTop = container.scrollHeight;
            
            // Emit seen if received
            if (!isSent) this.socket.emit('seen', { conversationId: msg.conversationId, userId: this.user.id });
        }
        this.loadConversations(); // Refresh last message in list
    }

    handleUserTyping(data) {
        if (this.activeConversationId === data.conversationId) {
            const indicator = document.getElementById('chatTyping');
            if (data.isTyping) {
                indicator.classList.add('visible');
            } else {
                indicator.classList.remove('visible');
            }
        }
    }

    handleChatNotification(data) {
        if (this.activeConversationId !== data.conversationId) {
            this.showToast(`New message from @user`, 'info');
            this.loadConversations();
        }
    }

    handleOnlineStatus(data) {
        document.querySelectorAll(`.status-dot[data-user-id="${data.userId}"]`).forEach(dot => {
            dot.className = `status-dot ${data.status}`;
        });
    }

    async openChatWithUser(userId, username, avatar) {
        if (!this.user) { this.showToast('Please sign in to message', 'error'); return; }
        
        try {
            // First we ensure the conversation exists by calling the sendMessage endpoint with empty/init
            // or we just find the conversation ID.
            const data = await this.api('/chat/messages', {
                method: 'POST',
                body: JSON.stringify({
                    receiverId: userId,
                    text: '' // Initialize conversation
                })
            });

            if (data?.conversationId) {
                this.navigateTo('chat');
                // Wait for page transition then open
                setTimeout(() => {
                    this.openChat(data.conversationId, username, avatar);
                }, 100);
            }
        } catch (err) {
            this.showToast('Failed to start chat', 'error');
        }
    }

    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
}

// ── Boot ──
const app = new BlinkApp();
