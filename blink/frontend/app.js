/* ═══════════════════════════════════════════════════════════════════════════════
   BLINK 2.0 — Unified SPA Engine
   Auth | Feed | Double-Tap Like | Comments | Profiles | Mute | Search
   ═══════════════════════════════════════════════════════════════════════════════ */

class BlinkApp {
    constructor() {
        this.API_BASE = this.detectApiBase();
        this.token = localStorage.getItem('token');
        this.user = this.loadUser();
        this.feedLoaded = false;
        this._feedLoadId = 0;
        this._feedHasMore = true;
        this.exploreLoaded = false;
        this.selectedVideos = new Set();
        this.isSelectionMode = false;
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
        this.setupFeed();
        this.setupChat(); // Phase 7
        this.runSafetyCheck();
        this.checkAuth();
    }

    detectApiBase() {
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
        this.socket.on('receive_message', (msg) => {
            console.log("socket received:", msg);
            this.handleReceiveMessage(msg);
        });
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
                if (this.token) {
                    this.forceLogout(true, "Session expired. Please login again.");
                }
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

    getAvatarUrl(user) {
        const name = user?.name || user?.username || "User";
        return (
            user?.profile_photo || 
            user?.profilePhoto || 
            user?.avatar || 
            `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=6366f1&color=fff&bold=true`
        );
    }

    requireAuth() {
        if (!this.token || !this.user) {
            this.showLoginModal();
            return false;
        }
        return true;
    }

    showLoginModal() {
        document.getElementById('authOverlay').style.display = 'flex';
        this.showToast("Please login to continue", "info");
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
        document.getElementById('mobileLogoutBtn')?.addEventListener('click', (e) => { e.preventDefault(); this.logout(); });
        document.getElementById('logoutBtnDropdown')?.addEventListener('click', (e) => { e.preventDefault(); this.logout(); });

        // Toggle User Dropdown
        const userMenu = document.getElementById('sidebarUser');
        const dropdown = document.getElementById('userDropdown');
        userMenu?.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown?.classList.toggle('active');
        });
        document.addEventListener('click', () => dropdown?.classList.remove('active'));
    }

    /* ── Global Safety Check ── */
    runSafetyCheck() {
        if (!localStorage.getItem('token')) {
            // Already handled by checkAuth() which shows overlay,
            // but for absolute certainty on all pages:
            this.token = null; 
            this.user = null;
            this.checkAuth();
        }
    }

    checkAuth() {
        const overlay = document.getElementById('authOverlay');
        const shell = document.getElementById('appShell');
        
        // Show shell to everyone for public content
        shell.style.display = 'flex';
        
        if (this.token && this.user) {
            overlay.style.display = 'none';
            this.updateSidebar();
            this.loadConversations();
            if (this.socket) {
                this.socket.emit('join_user', this.user.id);
                console.log("Joined socket user room:", this.user.id);
            }
        } else {
            // Default to landing state if not logged in
            // But let them see the feed
            overlay.style.display = 'none'; 
            this.updateSidebar();
        }
        
        const lastPage = localStorage.getItem('lastPage') || 'feed';
        this.navigateTo(lastPage);
    }

    setAuth(token, user) {
        this.token = token; this.user = user;
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(user));
    }

    async logout() {
        this.forceLogout(true, "Logged out successfully");
    }

    async forceLogout(showToast = false, msg = "Logged out successfully") {
        try {
            // Global Logout API call
            await fetch(`${this.API_BASE}/api/logout`, {
                method: 'POST',
                credentials: 'include'
            }).catch(() => {});
            
            // Clean specific app tokens
            this.token = null; 
            this.user = null;
            
            // Clear ALL storage for safety
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            sessionStorage.clear();

            if (showToast) {
                this.showToast(msg, msg.includes("expired") ? "error" : "success");
                setTimeout(() => { window.location.href = "/login"; }, 1500);
            } else {
                window.location.href = "/login";
            }
        } catch (err) {
            console.error('Logout failed:', err);
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.location.href = "/login";
        }
    }

    loadUser() {
        try { return JSON.parse(localStorage.getItem('user')); }
        catch { return null; }
    }

    updateSidebar() {
        const name = document.getElementById('sidebarUsername');
        const avatar = document.getElementById('sidebarAvatar');
        const bottomLink = document.getElementById('bottomProfileLink');

        if (this.token && this.user) {
            const avatarUrl = this.getAvatarUrl(this.user);
            if (name) name.textContent = `@${this.user.username}`;
            if (avatar) avatar.innerHTML = `<img src="${avatarUrl}" alt="avatar" class="sidebar-avatar-img">`;
            
            if (bottomLink) {
                bottomLink.innerHTML = `<img src="${avatarUrl}" class="bottom-avatar-img" alt="me"><span>Profile</span>`;
            }
        } else {
            if (name) name.textContent = 'Guest';
            if (avatar) avatar.innerHTML = `<i class="bi bi-person-circle"></i>`;
            if (bottomLink) {
                bottomLink.innerHTML = `<i class="bi bi-person-circle"></i><span>Profile</span>`;
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

        if (page === 'feed') this.loadFeed(1, false);
        if (page === 'explore' && !this.exploreLoaded) this.loadExplore();
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

    async loadExplore() {
        const grid = document.getElementById('exploreGrid');
        if (!grid) return;
        
        try {
            const data = await this.api('/videos/explore');
            const videos = data?.data || [];
            this.exploreLoaded = true;

            grid.innerHTML = ""; // Clear before rendering

            if (videos.length === 0) {
                grid.innerHTML = '<div class="explore-empty"><p>No videos available right now</p></div>';
                return;
            }

            videos.forEach(video => {
                if (!video.videoUrl) return;

                const card = document.createElement("div");
                card.className = "explore-video-card";
                card.dataset.id = video.id;
                
                card.innerHTML = `
                    <video src="${video.videoUrl}" muted playsinline preload="none" loop></video>
                    <div class="explore-info">@${video.username}</div>
                `;

                // Toggle play/pause on click
                card.onclick = () => {
                    const vid = card.querySelector('video');
                    if (vid.paused) {
                        // Pause others for performance
                        grid.querySelectorAll('video').forEach(v => v.pause());
                        vid.play();
                    } else {
                        vid.pause();
                    }
                };

                grid.appendChild(card);
            });
        } catch(err) {
            console.error('Explore load error:', err);
            grid.innerHTML = '<div class="explore-empty"><p>Failed to load explore feed</p></div>';
        }
    }

    async refreshFeed() {
        console.log("REFRESHING FEED...");
        this.feedLoaded = false;
        this._feedLoadId++;
        this._feedHasMore = true;
        
        const container = document.getElementById('reelsContainer');
        if (container) {
            container.innerHTML = `
                <div class="feed-loading-overlay">
                    <div class="loading-spinner"></div>
                    <p>Shuffling your feed...</p>
                </div>`;
        }

        await this.loadFeed(1, false);
    }

    setupFeed() {
        const refreshBtn = document.getElementById('feedRefreshBtn');
        if (refreshBtn) {
            refreshBtn.onclick = () => this.refreshFeed();
        }
    }

    /* ─────────────────────────────────────────────────────────
       VIDEO FEED — With all social features
       ───────────────────────────────────────────────────────── */
    async loadFeed(page = 1, append = false) {
        const container = document.getElementById('reelsContainer');
        const refreshBtn = document.getElementById('feedRefreshBtn');
        if (!container) return;

        // Race condition guard: only apply the response from the latest request
        const loadId = ++this._feedLoadId;

        try {
            if (!append) {
                this.feedPage = 1;
                container.innerHTML = '<div class="reels-loading"><div class="pulse-loader"></div><p>Loading feed…</p></div>';
                refreshBtn?.classList.add('loading');
            } else {
                this.feedPage = page;
                if (this._feedLoadingMore) return; // Prevent double load
            }

            const data = await this.api(`/videos/feed?page=${this.feedPage}&limit=20&_t=${Date.now()}`);

            // Discard if a newer loadFeed was called while we were awaiting
            if (loadId !== this._feedLoadId) return;
            
            if (!data?.data || data.data.length === 0) {
                if (!append) {
                    container.innerHTML = `
                        <div class="feed-empty">
                            <div class="empty-icon-wrap">
                                <i class="bi bi-camera-reels"></i>
                            </div>
                            <h2>Nothing to see here</h2>
                            <p>The feed is quiet. Be the pioneer of new content or explore creators!</p>
                            <div class="empty-actions" style="display:flex; gap:12px; justify-content:center;">
                                <button class="btn-primary" id="emptyUploadBtn" style="padding:10px 24px;">Upload Video</button>
                                <button class="btn-outline" id="emptyExploreBtn" style="padding:10px 24px;">Explore</button>
                            </div>
                        </div>`;
                    document.getElementById('emptyUploadBtn')?.addEventListener('click', () => this.navigateTo('upload'));
                    document.getElementById('emptyExploreBtn')?.addEventListener('click', () => this.navigateTo('explore'));
                }
                refreshBtn?.classList.remove('loading');
                return;
            }

            const html = data.data.map(v => this.createReelCard(v)).join('');
            
            if (append) {
                container.insertAdjacentHTML('beforeend', html);
            } else {
                container.innerHTML = html;
                container.scrollTop = 0; // Scroll to top on fresh load
            }

            this.feedLoaded = true;
            this._feedHasMore = data.hasMore !== false;
            this.setupReelInteractions();
            this.setupAutoplay();
            refreshBtn?.classList.remove('loading');
        } catch (err) {
            if (loadId !== this._feedLoadId) return;
            this.feedLoaded = false;
            refreshBtn?.classList.remove('loading');
            if (!append) {
                container.innerHTML = `
                    <div class="feed-empty">
                        <div class="empty-icon-wrap">
                            <i class="bi bi-wifi-off"></i>
                        </div>
                        <h2>Connection Error</h2>
                        <p>${err.message || 'Failed to load feed'}</p>
                        <button id="retryFeedBtn" class="btn-primary" style="margin-top: 1.5rem; padding: 12px 32px;">
                            <i class="bi bi-arrow-clockwise"></i> Retry
                        </button>
                    </div>`;
                document.getElementById('retryFeedBtn')?.addEventListener('click', () => {
                    container.innerHTML = '<div class="reels-loading"><div class="pulse-loader"></div><p>Retrying…</p></div>';
                    this.loadFeed(1, false);
                });
            }
        }
    }

    createReelCard(video) {
        const user = video.user || {};
        const avatar = this.getAvatarUrl(user);
        const likedClass = video.isLiked ? 'liked' : '';
        const followBtn = video.isFollowing ? 
            `<button class="reel-follow-btn following" data-id="${user.id}">Following</button>` : 
            `<button class="reel-follow-btn" data-id="${user.id}">Follow</button>`;
        const isOwn = this.user && this.user.id === user.id;

        return `
        <div class="reel-card" data-id="${video.id}" data-userId="${user.id}">
            <div class="reel-video-wrapper">
                <video class="reel-video" src="${video.video_url || video.videoUrl}" playsinline loop muted autoplay preload="metadata" poster="${video.thumbnail_url || ''}"></video>
                
                <div class="reel-overlay">
                    <div class="reel-user" data-user-id="${user.id}">
                        <div class="reel-author" data-user-id="${user.id}">
                            <img src="${avatar}" class="reel-author-avatar" alt="${user.username}">
                            <div class="reel-user-row">
                                <span class="reel-author-name">@${user.username || 'user'}</span>
                                ${!isOwn ? followBtn : ''}
                            </div>
                        </div>
                    </div>
                    ${video.caption ? `<p class="reel-caption">${this.escapeHtml(video.caption)}</p>` : ''}
                </div>

                <div class="reel-actions">
                    <button class="reel-action-btn like-btn ${likedClass}" data-id="${video.id}">
                        <i class="bi ${video.isLiked ? 'bi-heart-fill' : 'bi-heart'}"></i>
                        <span>${this.formatCount(video.likes_count || 0)}</span>
                    </button>
                    <button class="reel-action-btn comment-btn" data-id="${video.id}">
                        <i class="bi bi-chat-dots-fill"></i>
                        <span>${this.formatCount(video.comments_count || 0)}</span>
                    </button>
                    <button class="reel-action-btn view-count-btn">
                        <i class="bi bi-play-fill"></i>
                        <span>${this.formatCount(video.views_count || 0)}</span>
                    </button>
                    <button class="reel-action-btn mute-btn">
                        <i class="bi ${this.isMuted ? 'bi-volume-mute-fill' : 'bi-volume-up-fill'}"></i>
                    </button>
                    <button class="reel-action-btn share-btn">
                        <i class="bi bi-send-fill"></i>
                    </button>
                </div>
                <div class="reel-play-indicator"><i class="bi bi-play-fill"></i></div>
                <div class="double-tap-heart"><i class="bi bi-heart-fill"></i></div>
            </div>
        </div>`;
    }

    /* ─────────────────────────────────────────────────────────
       REEL INTERACTIONS — Like, Double-tap, Mute, Comments, Views
       ───────────────────────────────────────────────────────── */
    setupReelInteractions() {
        const cards = document.querySelectorAll('.reel-card');

        cards.forEach(card => {
            if (card.dataset.eventsBound) return;
            card.dataset.eventsBound = '1';

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
                    if (this.requireAuth()) {
                        this.handleDoubleTapLike(card);
                    }
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
                if (!this.requireAuth()) return;
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

        // ── FEATURE 5: VIEW COUNT (3-second watch logic) ────────
        if (!this.viewTimers) this.viewTimers = new Map();
        
        cards.forEach(card => {
            const observer = new IntersectionObserver(entries => {
                entries.forEach(entry => {
                    const videoId = card.dataset.id;
                    const video = card.querySelector('video');
                    
                    if (entry.isIntersecting) {
                        // Start 3-second timer
                        if (!sessionStorage.getItem(`viewed_video_${videoId}`)) {
                            const timer = setTimeout(async () => {
                                // Check if video is still playing and not paused/empty
                                if (video && !video.paused) {
                                    sessionStorage.setItem(`viewed_video_${videoId}`, 'true');
                                    try {
                                        let sessionId = localStorage.getItem('guest_session_id');
                                        if (!sessionId) {
                                            sessionId = 'guest_' + Math.random().toString(36).substr(2, 9);
                                            localStorage.setItem('guest_session_id', sessionId);
                                        }

                                        const data = await this.api(`/videos/${videoId}/view`, { 
                                            method: 'POST',
                                            body: JSON.stringify({ watchedSeconds: 3, sessionId })
                                        });

                                        if (data?.success && data.views_count) {
                                            const viewBtn = card.querySelector('.view-count-btn span');
                                            if (viewBtn) viewBtn.textContent = this.formatCount(data.views_count);
                                        }
                                    } catch (err) {
                                        console.warn('View recording skipped or failed', err);
                                    }
                                }
                            }, 3000);
                            this.viewTimers.set(videoId, timer);
                        }
                    } else {
                        // Clear timer if scrolled away before 3 seconds
                        if (this.viewTimers.has(videoId)) {
                            clearTimeout(this.viewTimers.get(videoId));
                            this.viewTimers.delete(videoId);
                        }
                    }
                });
            }, { threshold: 0.7 });
            observer.observe(card);
        });

        // ── FEATURE 4: CLICK USERNAME → OPEN PROFILE ────────
        document.querySelectorAll('.reel-author-avatar, .reel-author-name').forEach(el => {
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                const author = el.closest('.reel-author');
                const userId = author.dataset.userId;
                if (userId) this.openUserProfile(parseInt(userId));
            });
        });

        // ── FEATURE 7: FOLLOW BUTTON ON REEL ────────
        document.querySelectorAll('.reel-follow-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (!this.requireAuth()) return;
                await this.toggleFollow(btn);
            });
        });
    }

    async toggleFollow(btn) {
        if (!this.user) { this.showToast('Please sign in to follow', 'error'); return; }
        if (btn.disabled) return;
        
        btn.disabled = true;
        const userId = btn.dataset.id;
        const originalText = btn.textContent;
        
        // Loading state
        btn.textContent = btn.classList.contains('reel-follow-btn') ? '...' : 'Please wait...';

        try {
            const data = await this.api(`/users/follow/${userId}`, { method: 'POST' });
            if (data?.success) {
                // Keep the state synced with the server response across all instances
                document.querySelectorAll(`button[data-id="${userId}"].following, button[data-id="${userId}"].profile-follow-btn, button[data-id="${userId}"].follow-btn, button[data-id="${userId}"].reel-follow-btn`).forEach(b => {
                    b.classList.toggle('following', data.isFollowing);
                    b.textContent = data.isFollowing ? 'Following' : 'Follow';
                });
                
                // Update profile stats if currently viewing that user
                const userStatFollowers = document.getElementById('userStatFollowers');
                if (userStatFollowers && document.getElementById('page-user-profile').classList.contains('active')) {
                    userStatFollowers.textContent = this.formatCount(data.followersCount || 0);
                }

                // Show single success toast
                if (data.message) {
                    this.showToast(data.message, 'success');
                }
            }
        } catch (err) {
            btn.textContent = originalText;
            this.showToast(err.message || 'Failed to toggle follow', 'error');
        } finally {
            btn.disabled = false;
        }
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
                    video.currentTime = 0;
                    const playPromise = video.play();
                    if (playPromise !== undefined) {
                        playPromise.catch(() => {
                            console.log("Autoplay prevented, waiting for interaction");
                        });
                    }
                } else {
                    video.pause();
                }
            });
        }, { threshold: 0.7 });

        document.querySelectorAll('.reel-card').forEach(card => {
            const video = card.querySelector('video');
            if (video) {
                video.onended = () => {
                    video.currentTime = 0;
                    video.play().catch(() => {});
                };
            }
            this.feedObserver.observe(card);
        });

        // Infinite scroll: load more when near bottom
        const container = document.getElementById('reelsContainer');
        if (container && !container._blinkScrollBound) {
            container._blinkScrollBound = true;
            container.addEventListener('scroll', () => {
                if (this._feedLoadingMore || !this._feedHasMore) return;
                const { scrollTop, scrollHeight, clientHeight } = container;
                if (scrollTop + clientHeight >= scrollHeight - clientHeight * 1.5) {
                    this._feedLoadingMore = true;
                    this.loadFeed(this.feedPage + 1, true).finally(() => {
                        this._feedLoadingMore = false;
                    });
                }
            });
        }
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
            if (!this.requireAuth()) return;
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
                        <div class="empty-icon-wrap" style="width:60px; height:60px; font-size:24px;">
                            <i class="bi bi-chat-dots"></i>
                        </div>
                        <p style="color:var(--text-primary); font-weight:600; margin-bottom:4px;">No comments yet</p>
                        <p style="font-size:12px;">Be the first to share your thoughts!</p>
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
        const avatar = this.getAvatarUrl({
            profile_photo: c.profile_photo,
            username: c.username
        });
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
                    localStorage.setItem('user', JSON.stringify(this.user));
                    document.getElementById('profileAvatar').src = data.profile_photo;
                    this.updateSidebar();
                    this.showToast('Avatar updated! ✨', 'success');
                }
            } catch (err) {
                this.showToast('Avatar upload failed', 'error');
            }
        });

        // Edit Profile Binding
        const editProfileBtn = document.getElementById('editProfileBtn');
        const editProfileModal = document.getElementById('editProfileModal');
        const closeEditProfileModal = document.getElementById('closeEditProfileModal');
        const editProfileForm = document.getElementById('editProfileForm');

        editProfileBtn?.addEventListener('click', () => {
            if (!this.user) return;
            document.getElementById('editProfileName').value = this.user.name || this.user.username;
            document.getElementById('editProfileUsername').value = this.user.username;
            document.getElementById('editProfileBio').value = this.user.bio || '';
            document.getElementById('editProfileAlert').style.display = 'none';
            editProfileModal.style.display = 'flex';
        });

        closeEditProfileModal?.addEventListener('click', () => {
            editProfileModal.style.display = 'none';
        });

        editProfileForm?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('saveProfileBtn');
            const alert = document.getElementById('editProfileAlert');
            const name = document.getElementById('editProfileName').value.trim();
            const username = document.getElementById('editProfileUsername').value.trim();
            const bio = document.getElementById('editProfileBio').value.trim();

            this.setButtonLoading(btn, true);
            alert.style.display = 'none';

            try {
                const data = await this.api('/users/profile', {
                    method: 'PUT',
                    body: JSON.stringify({ name, username, bio })
                });

                if (data?.success) {
                    this.showToast('Profile updated!', 'success');
                    editProfileModal.style.display = 'none';
                    this.loadProfile();
                }
            } catch (err) {
                alert.textContent = err.message || 'Failed to update profile';
                alert.style.display = 'block';
            } finally {
                this.setButtonLoading(btn, false);
            }
        });

        // Contact Us & Logout handlers
        const contactUsBtn = document.getElementById('contactUsBtn');
        const contactUsModal = document.getElementById('contactUsModal');
        const closeContactUsModal = document.getElementById('closeContactUsModal');
        const contactUsForm = document.getElementById('contactUsForm');
        const logoutBtn = document.getElementById('logoutBtn');

        contactUsBtn?.addEventListener('click', () => {
            contactUsModal.style.display = 'flex';
        });

        closeContactUsModal?.addEventListener('click', () => {
            contactUsModal.style.display = 'none';
        });

        contactUsForm?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('sendContactBtn');
            const alert = document.getElementById('contactUsAlert');
            const name = document.getElementById('contactName').value.trim();
            const email = document.getElementById('contactEmail').value.trim();
            const message = document.getElementById('contactMessage').value.trim();

            this.setButtonLoading(btn, true);
            alert.style.display = 'none';

            try {
                const data = await this.api('/contact', {
                    method: 'POST',
                    body: JSON.stringify({ name, email, message })
                });

                if (data?.success) {
                    this.showToast('Message sent successfully!', 'success');
                    contactUsModal.style.display = 'none';
                    contactUsForm.reset();
                }
            } catch (err) {
                alert.textContent = err.message || 'Failed to send message';
                alert.style.display = 'block';
            } finally {
                this.setButtonLoading(btn, false);
            }
        });

        logoutBtn?.addEventListener('click', () => {
            this.logout();
        });
    }

    async loadProfile() {
        if (!this.requireAuth()) {
            this.navigateTo('feed');
            return;
        }

        try {
            const data = await this.api('/users/me');
            if (data?.user) {
                const u = data.user;
                document.getElementById('profileName').textContent = u.name || u.username;
                document.getElementById('profileUsername').textContent = `@${u.username}`;
                document.getElementById('profileBio').textContent = u.bio || 'Blink member';
                document.getElementById('statPosts').textContent = u.posts_count || 0;
                document.getElementById('statFollowers').textContent = this.formatCount(u.followers_count || 0);
                document.getElementById('statFollowing').textContent = this.formatCount(u.following_count || 0);
                document.getElementById('statLikes').textContent = this.formatCount(u.total_likes || 0);
                document.getElementById('statViews').textContent = this.formatCount(u.total_views || 0);

                document.getElementById('profileAvatar').src = this.getAvatarUrl(u);

                // Update sidebar too
                this.user = { ...this.user, ...u };
                localStorage.setItem('user', JSON.stringify(this.user));
                this.updateSidebar();

                this.loadUserVideos(u.id, 'profileVideos');
                
                // Bind delete action
                document.getElementById('deleteModeBtn').onclick = () => this.deleteSelected();
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
                document.getElementById('userProfileName').textContent = u.name || u.username;
                document.getElementById('userProfileUsername').textContent = `@${u.username}`;
                document.getElementById('userProfileBio').textContent = u.bio || 'Blink member';
                document.getElementById('userStatPosts').textContent = u.posts_count || 0;
                document.getElementById('userStatFollowers').textContent = this.formatCount(u.followers_count || 0);
                document.getElementById('userStatFollowing').textContent = this.formatCount(u.following_count || 0);
                document.getElementById('userStatLikes').textContent = this.formatCount(u.total_likes || 0);
                document.getElementById('userStatViews').textContent = this.formatCount(u.total_views || 0);

                const avatarUrl = this.getAvatarUrl(u);
                document.getElementById('userProfileAvatar').src = avatarUrl;
                
                // Profile Actions
                const btnWrap = document.getElementById('userProfileActions');
                if (btnWrap) {
                    btnWrap.className = 'follow-actions';
                    btnWrap.innerHTML = `
                        <button class="follow-btn ${u.is_following ? 'following' : ''}" id="followBtn">
                            ${u.is_following ? 'Following' : 'Follow'}
                        </button>
                        <button class="message-btn" id="profileMsgBtn">
                            <i class="bi bi-chat-text"></i> Message
                        </button>
                    `;
                    const fBtn = document.getElementById('followBtn');
                    fBtn.dataset.id = u.id; // required for toggleFollow
                    fBtn.onclick = () => {
                        if (this.requireAuth()) this.toggleFollow(fBtn);
                    };
                    document.getElementById('profileMsgBtn').onclick = () => {
                        if (this.requireAuth()) this.openChatWithUser(u.id, u.username, avatarUrl);
                    };
                }

                this.loadUserVideos(userId, 'userProfileVideos');
            }
        } catch (err) {
            this.showToast('Failed to load profile', 'error');
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
                let thumb = v.thumbnail_url;
                if (!thumb && v.video_url && v.video_url.includes('cloudinary.com')) {
                    thumb = v.video_url.replace('/upload/', '/upload/so_1/').replace(/\.(mp4|webm|mov)$/i, '.jpg');
                }
                if (!thumb) thumb = 'https://via.placeholder.com/400x700/111/fff?text=Video';

                const isOwn = this.user && userId === this.user.id;
                return `
                <div class="profile-video-card" data-id="${v.id}" onclick="app.navigateTo('feed')">
                    <img src="${thumb}" alt="${v.caption || 'Video'}" class="profile-video-thumb" loading="lazy" onerror="this.src='https://via.placeholder.com/400x700/111/fff?text=Video'">
                    <div class="profile-video-overlay">
                        <div class="play-icon"><i class="bi bi-play-fill"></i></div>
                        <div class="profile-video-stats">
                            <span><i class="bi bi-heart-fill"></i> ${this.formatCount(v.likes_count || 0)}</span>
                            <span><i class="bi bi-eye-fill"></i> ${this.formatCount(v.views_count || 0)}</span>
                        </div>
                    </div>
                    ${isOwn ? `<button class="video-delete-btn" data-id="${v.id}"><i class="bi bi-trash3-fill"></i></button>` : ''}
                </div>`;
            }).join('');

            // Bind selection/click
            container.querySelectorAll('.profile-video-card').forEach(card => {
                card.onclick = () => {
                    if (this.isSelectionMode) {
                        this.toggleVideoSelection(card);
                    } else {
                        // Open full video view would go here
                    }
                };
                
                // Long press to enter selection mode
                let pressTimer;
                card.onmousedown = card.ontouchstart = () => {
                    pressTimer = setTimeout(() => this.enterSelectionMode(), 600);
                };
                card.onmouseup = card.ontouchend = () => clearTimeout(pressTimer);
            });

            // Legacy individual delete if needed (but we moved to bulk)
            container.querySelectorAll('.video-delete-btn').forEach(btn => {
                btn.onclick = (e) => {
                    e.stopPropagation();
                    this.enterSelectionMode();
                    this.toggleVideoSelection(btn.closest('.profile-video-card'));
                };
            });
        } catch {
            container.innerHTML = '<div class="profile-empty"><p>Failed to load videos</p></div>';
        }
    }

    enterSelectionMode() {
        if (!this.user || this.currentPage !== 'profile') return;
        this.isSelectionMode = true;
        const actionsMain = document.getElementById('profileActionsMain');
        if (actionsMain) actionsMain.style.display = 'block';
        document.getElementById('deleteModeBtn').style.display = 'block';
        document.querySelectorAll('.profile-video-card').forEach(c => c.classList.add('selecting'));
    }

    exitSelectionMode() {
        this.isSelectionMode = false;
        this.selectedVideos.clear();
        document.getElementById('deleteModeBtn').style.display = 'none';
        const actionsMain = document.getElementById('profileActionsMain');
        if (actionsMain) actionsMain.style.display = 'none';
        document.getElementById('deleteCount').textContent = '0';
        document.querySelectorAll('.profile-video-card').forEach(c => {
            c.classList.remove('selecting', 'selected');
        });
    }

    toggleVideoSelection(card) {
        const id = card.dataset.id;
        if (this.selectedVideos.has(id)) {
            this.selectedVideos.delete(id);
            card.classList.remove('selected');
        } else {
            this.selectedVideos.add(id);
            card.classList.add('selected');
        }
        document.getElementById('deleteCount').textContent = this.selectedVideos.size;
        
        if (this.selectedVideos.size === 0) {
            this.exitSelectionMode();
        }
    }

    async deleteSelected() {
        if (this.selectedVideos.size === 0) return;
        if (!confirm(`Delete ${this.selectedVideos.size} videos permanently?`)) return;

        const ids = Array.from(this.selectedVideos);
        try {
            const res = await this.api('/videos/delete-selected', {
                method: 'POST',
                body: JSON.stringify({ ids })
            });

            if (res?.success) {
                this.showToast(`${res.count} videos deleted`);
                this.exitSelectionMode();
                this.loadProfile(); // Refresh
            }
        } catch (err) {
            this.showToast('Failed to delete videos', 'error');
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
            if (q.length < 2) {
                // Restore explore grid when search is cleared
                this.exploreLoaded = false;
                this.loadExplore();
                return;
            }
            debounce = setTimeout(() => this.searchUsers(q), 400);
        });

        clearBtn?.addEventListener('click', () => {
            input.value = '';
            clearBtn.style.display = 'none';
            // Restore explore grid
            this.exploreLoaded = false;
            this.loadExplore();
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
            const avatar = this.getAvatarUrl(u);
            return `
            <div class="user-card" data-user-id="${u.id}">
                <div class="user-card-avatar-wrap">
                    <img src="${avatar}" class="user-card-avatar" alt="${u.username}">
                </div>
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
        const cancelUploadBtn = document.getElementById('cancelUploadBtn');
        let selectedFile = null;

        cancelUploadBtn?.addEventListener('click', () => {
            if (this.currentUploadXhr) {
                this.currentUploadXhr.abortedByBlink = true;
                this.currentUploadXhr.abort();
                this.currentUploadXhr = null;
                this.showToast('Upload cancelled', 'info');
                const progressDiv = document.getElementById('uploadProgress');
                progressDiv.style.display = 'none';
                form.style.display = 'block';
                this.setButtonLoading(uploadBtn, false);
            }
        });

        dropzone?.addEventListener('click', () => fileInput?.click());
        fileInput?.addEventListener('change', () => {
            if (fileInput.files[0]) selectFile(fileInput.files[0]);
        });

        const selectFile = (file) => {
            if (!file.type.startsWith('video/')) {
                this.showToast('Please select a valid video file (mp4, webm, etc.)', 'error');
                return;
            }
            if (file.size > 100 * 1024 * 1024) {
                this.showToast('Video is too large. Max size 100MB.', 'error');
                return;
            }
            selectedFile = file;
            preview.src = URL.createObjectURL(file);
            preview.play();
            dropzone.style.display = 'none';
            form.style.display = 'block';
        };

        const preventExit = (e) => {
            e.preventDefault();
            e.returnValue = '';
        };

        uploadBtn?.addEventListener('click', async () => {
            if (!this.requireAuth()) return;
            if (!selectedFile) return;
            
            const performUpload = async (retryCount = 0) => {
                const formData = new FormData();
                formData.append('video', selectedFile);
                formData.append('caption', document.getElementById('uploadCaption')?.value || '');

                this.setButtonLoading(uploadBtn, true);
                window.addEventListener('beforeunload', preventExit);
                
                const progressDiv = document.getElementById('uploadProgress');
                const statusText = document.getElementById('uploadStatus');
                const cancelBtn = document.getElementById('cancelUploadBtn');
                
                if (statusText) statusText.textContent = 'Preparing upload...';
                if (cancelBtn) cancelBtn.style.display = 'inline-flex';
                
                form.style.display = 'none';
                progressDiv.style.display = 'block';

                const xhr = new XMLHttpRequest();
                this.currentUploadXhr = xhr;
                xhr.open('POST', `${this.API_BASE}/api/upload/video`);
                if (this.token) xhr.setRequestHeader('Authorization', `Bearer ${this.token}`);

                xhr.upload.onprogress = (e) => {
                    if (e.lengthComputable) {
                        const percent = Math.round((e.loaded / e.total) * 100);
                        document.getElementById('progressText').textContent = `${percent}%`;
                        const offset = 283 - (283 * percent) / 100;
                        document.getElementById('progressCircle').style.strokeDashoffset = offset;
                        
                        const statusText = document.getElementById('uploadStatus');
                        if (statusText) {
                            if (percent < 100) {
                                statusText.textContent = `Uploading to server... (${percent}%)`;
                            } else {
                                // 100% reached, now the server takes over Cloudinary upload
                                statusText.textContent = 'Processing video... (stay on this page)';
                                if (cancelBtn) cancelBtn.style.display = 'none'; // Avoid cancelling during DB save
                            }
                        }
                    }
                };

                xhr.onload = () => {
                    this.currentUploadXhr = null;
                    window.removeEventListener('beforeunload', preventExit);
                    
                    let data;
                    try { data = JSON.parse(xhr.responseText); } catch(e) { data = {}; }

                    if (xhr.status >= 200 && xhr.status < 300 && data.success) {
                        const statusText = document.getElementById('uploadStatus');
                        if (statusText) statusText.textContent = 'Upload complete! 🎉';
                        this.showToast('Video published! 🎬', 'success');
                        
                        // Success! Now reset and refresh
                        setTimeout(() => {
                            this.feedLoaded = false;
                            this.navigateTo('feed');
                            location.reload(); // Refresh to show new video
                        }, 1000);
                    } else if (retryCount < 1 && xhr.status !== 0 && !xhr.abortedByBlink) {
                        console.log(`Retrying upload... attempt ${retryCount + 1}`);
                        performUpload(retryCount + 1);
                    } else {
                        this.setButtonLoading(uploadBtn, false);
                        const errorMsg = data.error || data.message || 'Server upload failed';
                        if (xhr.status !== 0) this.showToast(`Upload failed: ${errorMsg}`, 'error');
                        
                        progressDiv.style.display = 'none';
                        form.style.display = 'block';
                    }
                };

                xhr.onabort = () => {
                    this.currentUploadXhr = null;
                    window.removeEventListener('beforeunload', preventExit);
                    console.log('Upload aborted.');
                };

                xhr.onerror = () => {
                    this.currentUploadXhr = null;
                    window.removeEventListener('beforeunload', preventExit);
                    this.setButtonLoading(uploadBtn, false);
                    this.showToast('Network error during upload', 'error');
                    progressDiv.style.display = 'none';
                    form.style.display = 'block';
                };

                xhr.send(formData);
            };

            performUpload();
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
        const searchInput = document.getElementById('chatSearchInput');

        // Conversation Search
        if (searchInput) {
            searchInput.oninput = (e) => {
                const term = e.target.value.toLowerCase();
                document.querySelectorAll('.conv-item').forEach(item => {
                    const name = item.querySelector('.conv-name').textContent.toLowerCase();
                    item.style.display = name.includes(term) ? 'flex' : 'none';
                });
            };
        }

        backBtn?.addEventListener('click', () => {
            this.closeChat();
        });
    }

    async loadConversations() {
        const list = document.getElementById('conversationList');
        if (!list) return;

        try {
            const data = await this.api('/chats');
            console.log("conversations response:", data);
            this.conversations = data?.conversations || [];
            this.renderConversations();
            this.updateBadges();
        } catch (err) {
            list.innerHTML = `<div class="chat-error">Failed to load chats</div>`;
        }
    }

    updateBadges() {
        const totalUnread = this.conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0);
        const badge = document.getElementById('chatBadge');
        const mobileBadge = document.getElementById('mobileChatBadge');
        
        if (badge) {
            badge.textContent = totalUnread > 99 ? '99+' : totalUnread;
            badge.style.display = totalUnread > 0 ? 'flex' : 'none';
        }
        if (mobileBadge) {
            mobileBadge.textContent = totalUnread > 99 ? '99+' : totalUnread;
            mobileBadge.style.display = totalUnread > 0 ? 'flex' : 'none';
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
            const avatar = this.getAvatarUrl({
                profile_photo: c.other_profile_photo,
                username: c.other_username
            });
            const activeClass = this.activeReceiverId === c.other_user_id ? 'active' : '';
            const unread = c.unread_count > 0 ? `<span class="conv-unread">${c.unread_count}</span>` : '';
            
            return `
            <div class="conv-item ${activeClass}" data-id="${c.other_user_id}" onclick="app.openChatWithUser(${c.other_user_id}, '${c.other_username}', '${avatar}')">
                <div class="conv-avatar-wrap">
                    <img src="${avatar}" class="conv-avatar">
                    <div class="status-dot offline" data-user-id="${c.other_user_id}"></div>
                </div>
                <div class="conv-info">
                    <div class="conv-name-row">
                        <span class="conv-name">${c.other_username}</span>
                        <span class="conv-time">${this.timeAgo(c.last_message_at || Date.now())}</span>
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
        // Find other user id from conversations list to redirect to openChatWithUser
        const conv = this.conversations.find(c => c.id === convId);
        if (conv) {
            this.openChatWithUser(conv.other_user_id, username, avatar);
        } else {
            this.showToast('Could not open chat', 'error');
        }
    }

    renderMessages(messages) {
        const container = document.getElementById('chatMessages');
        if (!container) return;

        if (!messages || messages.length === 0) {
            container.innerHTML = `
                <div class="chat-empty-history">
                    <div class="empty-history-icon"><i class="bi bi-chat-dots"></i></div>
                    <p>Start your conversation 👋</p>
                </div>`;
            return;
        }

        const currentUserId = Number(this.user.id);
        container.innerHTML = messages.map((m, idx) => {
            const isMine = Number(m.sender_id) === currentUserId;
            const isLastMessage = idx === messages.length - 1;
            const seenText = (isMine && isLastMessage && m.is_read === 1) ? '<div class="msg-seen-status">Seen</div>' : '';
            
            return `
            <div class="message-row ${isMine ? 'mine' : 'theirs'}" data-id="${m.id}">
                <div class="message-bubble">${this.escapeHtml(m.message)}</div>
                <div class="msg-meta">
                    ${new Date(m.createdAt || m.created_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
                ${seenText}
            </div>`;
        }).join('');
        
        container.scrollTop = container.scrollHeight;
    }

    async sendMessage() {
        const input = document.getElementById('messageInput');
        const text = input.value.trim();
        if (!text || !this.activeReceiverId) return;

        const receiverId = this.activeReceiverId;
        console.log("SENDING MESSAGE:", { receiverId, text });

        input.value = '';
        input.style.height = '44px'; // Reset height
        document.getElementById('sendMsgBtn').disabled = true;

        try {
            const res = await this.api(`/chats/${receiverId}`, {
                method: 'POST',
                body: JSON.stringify({ message: text })
            });

            if (res?.success) {
                const savedMessage = res.message;
                console.log("MESSAGE SAVED ON SERVER:", savedMessage.id);
                this.appendMessageLocally(savedMessage);
                
                // Socket emit
                this.socket.emit('send_message', {
                    sender_id: this.user.id,
                    receiver_id: receiverId,
                    message: text,
                    conversation_id: savedMessage.conversation_id
                });
            }
        } catch (err) {
            console.error("SEND ERROR:", err);
            this.showToast('Failed to send message', 'error');
        }
    }

    appendMessageLocally(msg) {
        const container = document.getElementById('chatMessages');
        if (!container) return;
        
        // Check for duplicates
        const existing = container.querySelector(`[data-id="${msg.id}"]`);
        if (existing) return;

        // Remove empty history message if present
        const empty = container.querySelector('.chat-empty-history');
        if (empty) empty.remove();

        const isMine = Number(msg.sender_id) === Number(this.user.id);
        const msgHtml = `
        <div class="message-row ${isMine ? 'mine' : 'theirs'}" data-id="${msg.id}">
            <div class="message-bubble">${this.escapeHtml(msg.message)}</div>
            <div class="msg-meta">
                ${new Date(msg.createdAt || msg.created_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
        </div>`;
        container.insertAdjacentHTML('beforeend', msgHtml);
        container.scrollTop = container.scrollHeight;
    }

    handleReceiveMessage(msg) {
        const currentUserId = Number(this.user.id);
        const activeId = Number(this.activeReceiverId);
        const senderId = Number(msg.sender_id);
        const receiverId = Number(msg.receiver_id);

        const isMine = (senderId === currentUserId);
        const isFromActive = (senderId === activeId);
        const isToActive = (receiverId === activeId);

        if (isFromActive || (isMine && isToActive)) {
            this.appendMessageLocally(msg);
            
            // If it's from the active user, mark as read instantly
            if (isFromActive) {
                this.api(`/chats/${senderId}/read`, { method: 'PUT' });
            }
        }
        
        // Refresh conversation list to show latest message and badges
        this.loadConversations();
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
            this.updateBadges();
        }
    }

    handleOnlineStatus(data) {
        document.querySelectorAll(`.status-dot[data-user-id="${data.userId}"]`).forEach(dot => {
            dot.className = `status-dot ${data.status}`;
        });
    }

    async openChatWithUser(userId, username, avatar) {
        if (!this.user) { this.showToast('Please sign in to message', 'error'); return; }
        
        this.activeReceiverId = userId;
        this.activeConversationId = null;

        // UI Transitions
        this.navigateTo('chat');

        const msgContainer = document.getElementById('chatMessages');
        if (!msgContainer) return;

        // Header Info
        document.getElementById('chatHeaderName').textContent = username;
        document.getElementById('chatHeaderAvatar').src = avatar;
        document.getElementById('chatEmptyState').style.display = 'none';
        document.getElementById('chatActive').style.display = 'flex';
        
        if (window.innerWidth <= 768) {
            document.getElementById('chatListPanel').classList.add('hidden');
            document.getElementById('chatWindowPanel').classList.add('active');
        }

        this.renderConversations();

        // Load Messages Logic
        const fetchHistory = async () => {
            try {
                console.log("FETCHING CHAT HISTORY FOR:", userId);
                const data = await this.api(`/chats/${userId}`);
                console.log("CHAT HISTORY RESPONSE:", data);
                
                this.renderMessages(data.messages || []);
                
                // Mark as read
                this.api(`/chats/${userId}/read`, { method: 'PUT' });
                this.loadConversations(); // Refresh list to clear badges

                if (data.messages && data.messages.length > 0) {
                    this.activeConversationId = data.messages[0].conversation_id;
                    if (this.activeConversationId) {
                        this.socket.emit('join_room', this.activeConversationId);
                    }
                }
            } catch (err) {
                console.error("CHAT HISTORY ERROR:", err);
                msgContainer.innerHTML = `
                    <div class="chat-error">
                        <p>Failed to load history</p>
                        <p style="font-size: 10px; opacity: 0.7;">${err.message || 'Unknown error'}</p>
                        <button class="btn-retry" onclick="app.openChatWithUser(${userId}, '${username}', '${avatar}')">
                            Retry
                        </button>
                    </div>`;
            }
        };

        fetchHistory();
    }

    handleTextareaChange(el) {
        const sendBtn = document.getElementById('sendMsgBtn');
        if (sendBtn) sendBtn.disabled = !el.value.trim();
        
        el.style.height = "44px";
        el.style.height = `${Math.min(el.scrollHeight, 120)}px`;

        // Typing logic
        if (this.activeConversationId) {
            clearTimeout(this.typingTimeout);
            this.socket.emit('typing', { 
                conversationId: this.activeConversationId, 
                userId: this.user.id, 
                isTyping: true 
            });
            this.typingTimeout = setTimeout(() => {
                this.socket.emit('typing', { 
                    conversationId: this.activeConversationId, 
                    userId: this.user.id, 
                    isTyping: false 
                });
            }, 2000);
        }
    }

    handleKeyDown(e) {
        if (e.key === "Enter" && !e.shiftKey && window.innerWidth > 768) {
            e.preventDefault();
            this.sendMessage();
        }
    }

    closeChat() {
        const listPanel = document.getElementById('chatListPanel');
        const windowPanel = document.getElementById('chatWindowPanel');
        if (listPanel) listPanel.classList.remove('hidden');
        if (windowPanel) windowPanel.classList.remove('active');
        this.activeReceiverId = null;
        this.activeConversationId = null;
    }

    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
}

// ── Boot ──
const app = new BlinkApp();
