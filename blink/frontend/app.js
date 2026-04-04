/* ═══════════════════════════════════════════════════════════════════════════════
    BLINK v7.0 - UNIFIED SPA ENGINE
    Auth | Feed | Live | Search | Logic
    ═══════════════════════════════════════════════════════════════════════════════ */

class BlinkApp {
    constructor() {
        this.currentUser = JSON.parse(localStorage.getItem('blink_identity'));
        this.currentPage = 'home';
        this.init();
    }

    init() {
        window.app = this;
        document.addEventListener('DOMContentLoaded', () => {
            this.setupNavigation();
            this.setupAuth();
            this.checkAuth();
            this.setupSearch();
            this.setupLive();
        });
    }

    // --- 1. NAVIGATION & ROUTING ---
    setupNavigation() {
        document.addEventListener('click', (e) => {
            const link = e.target.closest('[data-page]');
            if (link) {
                e.preventDefault();
                this.navigateTo(link.getAttribute('data-page'));
            }
        });

        document.getElementById('logoutBtn')?.addEventListener('click', () => {
            localStorage.removeItem('blink_token');
            localStorage.removeItem('blink_identity');
            location.reload();
        });
    }

    navigateTo(page) {
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.getElementById(`${page}-page`)?.classList.add('active');
        
        document.querySelectorAll('.nav-item').forEach(link => {
            if (link.getAttribute('data-page') === page) link.classList.add('active');
            else link.classList.remove('active');
        });

        this.currentPage = page;
        if (page === 'home') this.loadFeed();
    }

    // --- 2. AUTH SYSTEM ---
    setupAuth() {
        const tabLogin = document.getElementById('tabLogin');
        const tabSignup = document.getElementById('tabSignup');
        const loginForm = document.getElementById('loginForm');
        const signupForm = document.getElementById('signupForm');

        tabLogin?.addEventListener('click', () => {
            tabLogin.classList.add('active'); tabSignup.classList.remove('active');
            loginForm.classList.add('active'); signupForm.classList.remove('active');
        });

        tabSignup?.addEventListener('click', () => {
            tabSignup.classList.add('active'); tabLogin.classList.remove('active');
            signupForm.classList.add('active'); loginForm.classList.remove('active');
        });

        loginForm?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('logEmail').value;
            const password = document.getElementById('logPass').value;
            try {
                const res = await this.request('/api/auth/login', 'POST', { email, password });
                if (res.success) {
                    localStorage.setItem('blink_token', res.token);
                    localStorage.setItem('blink_identity', JSON.stringify(res.user));
                    location.reload();
                }
            } catch (err) { alert("Invalid identity frequencies."); }
        });
    }

    checkAuth() {
        const authModal = document.getElementById('authModal');
        if (!this.currentUser) { authModal?.classList.add('active'); }
        else { authModal?.classList.remove('active'); this.navigateTo('home'); }
    }

    // --- 3. VIDEO FEED ENGINE ---
    async loadFeed() {
        const container = document.getElementById('reelsContainer');
        if (!container) return;
        container.innerHTML = '<div style="height:100vh; display:flex; align-items:center; justify-content:center;"><h2>Syncing...</h2></div>';

        try {
            const res = await this.request('/api/videos');
            if (res.success) this.renderReels(res.data);
        } catch (e) { container.innerHTML = '<h2>Connection Lost</h2>'; }
    }

    renderReels(videos) {
        const container = document.getElementById('reelsContainer');
        container.innerHTML = videos.map(v => `
            <div class="reel-card">
                <video src="${v.video_url}" loop playsinline muted></video>
                <div class="reel-ui">
                    <div class="reel-side">
                        <button onclick="window.app.toggleLike(this, ${v.id})"><i class="bi bi-heart-fill"></i><span>${v.likes_count}</span></button>
                    </div>
                    <div class="reel-info">
                        <h3>@${v.username}</h3>
                        <p>${v.caption || ''}</p>
                    </div>
                </div>
            </div>
        `).join('');

        this.setupAutoplay();
    }

    setupAutoplay() {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                const video = entry.target.querySelector('video');
                if (entry.isIntersecting) video?.play();
                else video?.pause();
            });
        }, { threshold: 0.7 });

        document.querySelectorAll('.reel-card').forEach(card => observer.observe(card));
    }

    async toggleLike(btn, videoId) {
        try {
            await this.request(`/api/videos/${videoId}/like`, 'POST');
            const count = btn.querySelector('span');
            count.innerText = parseInt(count.innerText) + 1;
            btn.querySelector('i').style.color = 'red';
        } catch (e) { console.error('Like failed'); }
    }

    // --- 4. SEARCH & SEARCH UI ---
    setupSearch() {
        const input = document.getElementById('searchInput');
        let timeout = null;
        input?.addEventListener('input', () => {
            clearTimeout(timeout);
            timeout = setTimeout(async () => {
                const res = await this.request(`/api/search?q=${input.value}`);
                this.renderSearchResults(res.users);
            }, 500);
        });
    }

    renderSearchResults(users) {
        const grid = document.getElementById('exploreGrid');
        grid.innerHTML = users.map(u => `
            <div class="user-card">
                <img src="${u.profile_photo || 'https://via.placeholder.com/150'}">
                <h3>${u.username}</h3>
                <button onclick="window.app.navigateTo('profile')">View Profile</button>
            </div>
        `).join('');
    }

    // --- 5. LIVE STREAMING ---
    setupLive() {
        const startBtn = document.getElementById('startLiveBtn');
        const endBtn = document.getElementById('endLiveBtn');
        const localVideo = document.getElementById('localVideo');
        const liveTag = document.getElementById('liveTag');

        startBtn?.addEventListener('click', async () => {
            try {
                this.stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                localVideo.srcObject = this.stream;
                localVideo.play();
                startBtn.style.display = 'none';
                endBtn.style.display = 'block';
                liveTag.style.display = 'block';
            } catch (e) { alert("Camera resource denied."); }
        });

        endBtn?.addEventListener('click', () => {
            this.stream?.getTracks().forEach(t => t.stop());
            localVideo.srcObject = null;
            startBtn.style.display = 'block';
            endBtn.style.display = 'none';
            liveTag.style.display = 'none';
        });
    }

    // --- 6. GLOBAL API HANDLER ---
    async request(url, method = 'GET', body = null) {
        const headers = { 'Content-Type': 'application/json' };
        const token = localStorage.getItem('blink_token');
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : null });
        return await res.json();
    }
}

// Global Launch
const app = new BlinkApp();
