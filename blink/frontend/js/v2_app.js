/* ═══════════════════════════════════════════════════════════════════════════════
    BLINK v6.0 - PROFESSIONAL SPA ROUTER (V2)
    Clean | Event-Driven | Module-Safe
    ═══════════════════════════════════════════════════════════════════════════════ */

class BlinkAppV2 {
    constructor() {
        this.currentPage = 'home';
        this.init();
    }

    init() {
        window.app = this;
        document.addEventListener('DOMContentLoaded', () => {
            this.setupNavigation();
            this.checkAuth();
        });
    }

    setupNavigation() {
        // Universal click listener for data-page items
        document.addEventListener('click', (e) => {
            const link = e.target.closest('[data-page]');
            if (link) {
                e.preventDefault();
                const page = link.getAttribute('data-page');
                this.navigateTo(page);
            }
        });

        // Auth Tabs
        const tabLogin = document.getElementById('tabLogin');
        const tabSignup = document.getElementById('tabSignup');
        const loginForm = document.getElementById('loginForm');
        const signupForm = document.getElementById('signupForm');

        tabLogin?.addEventListener('click', () => {
            tabLogin.classList.add('active');
            tabSignup.classList.remove('active');
            loginForm.classList.add('active');
            signupForm.classList.remove('active');
        });

        tabSignup?.addEventListener('click', () => {
            tabSignup.classList.add('active');
            tabLogin.classList.remove('active');
            signupForm.classList.add('active');
            loginForm.classList.remove('active');
        });
    }

    checkAuth() {
        const user = window.api?.getCurrentUser();
        const authOverlay = document.getElementById('authOverlay');
        
        if (!user) {
            authOverlay?.classList.add('active');
        } else {
            authOverlay?.classList.remove('active');
            this.navigateTo('home');
        }
    }

    navigateTo(page) {
        console.log(`[BlinkV2] Routing to: ${page}`);
        
        // 1. Fragment Switch
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        const target = document.getElementById(`${page}-page`);
        if (target) {
            target.classList.add('active');
            this.currentPage = page;
        }

        // 2. Nav Highlight
        document.querySelectorAll('.nav-item').forEach(link => {
            if (link.getAttribute('data-page') === page) link.classList.add('active');
            else link.classList.remove('active');
        });

        // 3. Module Init
        this.initModule(page);
    }

    initModule(page) {
        switch(page) {
            case 'home':
                this.loadFeed();
                break;
            case 'profile':
                this.loadProfile();
                break;
        }
    }

    async loadFeed() {
        if (window.feed) window.feed.load();
        else {
            // Basic loader placeholder
            const container = document.getElementById('reelsContainer');
            if (container) container.innerHTML = '<div style="height: 100vh; display:flex; align-items:center; justify-content:center;"><h2>Loading Binks...</h2></div>';
        }
    }

    loadProfile() {
        const user = window.api?.getCurrentUser();
        if (user) {
            document.getElementById('profUsername').value = user.username || '';
            document.getElementById('profBio').value = user.bio || '';
            document.getElementById('userAvatar').src = user.profile_photo || 'https://via.placeholder.com/150';
        }
    }
}

// Global Launch
const blink = new BlinkAppV2();
