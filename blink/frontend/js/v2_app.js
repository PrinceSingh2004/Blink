/* ═══════════════════════════════════════════════════════════════════════════════
    BLINK v6.1 - PROFESSIONAL SPA ROUTER (V2)
    Clean | Event-Driven | Module-Safe | Auth-Connected
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
            
            // Re-initialization if needed
            window.addEventListener('popstate', (e) => {
                if(e.state?.page) this.navigateTo(e.state.page, {}, false);
            });
        });
    }

    setupNavigation() {
        document.addEventListener('click', (e) => {
            const link = e.target.closest('[data-page]');
            if (link) {
                e.preventDefault();
                const page = link.getAttribute('data-page');
                const params = link.dataset.params ? JSON.parse(link.dataset.params) : {};
                this.navigateTo(page, params);
            }
        });

        // Auth Logic
        this.setupAuthUI();
    }

    checkAuth() {
        const user = window.api?.getCurrentUser();
        if (!user) {
            document.getElementById('authOverlay')?.classList.add('active');
        } else {
            document.getElementById('authOverlay')?.classList.remove('active');
            this.loadInitialPage();
        }
    }

    navigateTo(page, params = {}, push = true) {
        console.log(`[BlinkV2] Routing to: ${page}`, params);
        
        // 1. Fragment Switch
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        const target = document.getElementById(`${page}-page`);
        if (!target) {
            console.error(`[BlinkV2] Target frequency missing: ${page}`);
            return this.navigateTo('home');
        }

        target.classList.add('active');
        this.currentPage = page;

        // 2. Nav Highlight
        document.querySelectorAll('.nav-item').forEach(link => {
            if (link.getAttribute('data-page') === page) link.classList.add('active');
            else link.classList.remove('active');
        });

        // 3. Update URL
        if(push) window.history.pushState({page}, '', `/${page == 'home' ? '' : page}`);

        // 4. Module Init
        this.initModule(page, params);
    }

    initModule(page, params) {
        switch(page) {
            case 'home':
                if (window.feed) window.feed.load();
                break;
            case 'profile':
                if (window.profile) window.profile.load(params.id);
                break;
            case 'messages':
                if (window.messenger) window.messenger.loadConversations();
                break;
            case 'live':
                // Live start initialization
                break;
        }
    }

    loadInitialPage() {
        const path = window.location.pathname.replace('/', '') || 'home';
        this.navigateTo(path);
    }

    setupAuthUI() {
        // Tab switching
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

    showToast(msg, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerText = msg;
        document.getElementById('toastContainer')?.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }
}

// Instantiate Global Module
const appV2 = new BlinkAppV2();
