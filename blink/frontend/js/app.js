/* ═══════════════════════════════════════════════════════════════════════════════
    BLINK v5.0 - APP ROUTER & SPA HUB
    Standardized class names | Robust page switching | URL sync
    ═══════════════════════════════════════════════════════════════════════════════ */

class BlinkApp {
    constructor() {
        this.currentPage = 'feed';
        this.init();
        
        // Handle back/forward buttons
        window.addEventListener('popstate', (e) => {
            if (e.state && e.state.page) {
                this.navigateTo(e.state.page, {}, false); // false to avoid pushState loop
            }
        });
    }

    init() {
        // Global access
        window.app = this;
    }

    setupNavigation() {
        // Handle all navigation links with data-page attribute
        document.addEventListener('click', (e) => {
            const navLink = e.target.closest('[data-page]');
            if (navLink) {
                e.preventDefault();
                const page = navLink.getAttribute('data-page');
                const params = navLink.dataset.params ? JSON.parse(navLink.dataset.params) : {};
                this.navigateTo(page, params);
            }
        });

        // Logout
        document.querySelectorAll('#logout-btn, #logout-btn-profile').forEach(btn => {
            btn.onclick = (e) => {
                e.preventDefault();
                window.api.logout();
            };
        });
    }

    navigateTo(page, params = {}) {
        console.log(`[Blink] Navigating to: ${page}`, params);

        // 1. Hide all pages
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

        // 2. Show target page
        const pageTarget = document.getElementById(`${page}-page`);
        if (pageTarget) {
            pageTarget.classList.add('active');
            this.currentPage = page;
            
            // Sync URL (Optional: but good for SPA)
            window.history.pushState({page}, '', `/${page == 'feed' ? '' : page}`);

            // 3. Update Nav Active States
            this.updateActiveNav(page);

            // 4. Fire page-specific init
            this.initPageModule(page, params);
        } else {
            console.error(`[Blink] Fragment frequency not found: ${page}-page`);
            this.navigateTo('feed');
        }
    }

    initPageModule(page, params) {
        switch(page) {
            case 'feed':
                if (window.feed) window.feed.load();
                break;
            case 'messages':
                if (window.messenger) {
                    if (params.id) window.messenger.openChat(params.id, params.username, params.avatar);
                    else window.messenger.loadConversations();
                }
                break;
            case 'profile':
                if (window.profile) {
                    const userId = params.id || window.api.getCurrentUser()?.id;
                    window.profile.load(userId);
                }
                break;
            case 'explore':
                // Explore module init
                break;
            case 'live':
                if (window.live) window.live.loadActiveStreams();
                break;
        }
    }

    updateActiveNav(page) {
        document.querySelectorAll('[data-page]').forEach(link => {
            if (link.getAttribute('data-page') === page) {
                link.classList.add('active');
            } else {
                link.classList.remove('active');
            }
        });
    }

    loadInitialPage() {
        const path = window.location.pathname.replace('/', '') || 'feed';
        this.navigateTo(path);
    }

    // Modal Helpers
    showModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) modal.classList.add('active');
    }

    hideModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) modal.classList.remove('active');
    }

    showLoading() {
        // UI implementation for global loader
    }

    hideLoading() {
        // UI implementation for global loader
    }

    showError(msg) {
        if(window.Blink?.showToast) window.Blink.showToast(msg, 'error');
        else alert(msg);
    }

    showSuccess(msg) {
        if(window.Blink?.showToast) window.Blink.showToast(msg, 'success');
        else console.log("Success:", msg);
    }
}

// Global initialization
document.addEventListener('DOMContentLoaded', () => {
    const app = new BlinkApp();
    app.setupNavigation(); // Crucial
    
    // Check authentication
    const user = window.api?.getCurrentUser?.();
    const authModal = document.getElementById('auth-modal');
    
    if (user && user.id) {
        if (authModal) authModal.classList.remove('active');
    } else {
        if (authModal) authModal.classList.add('active');
    }
    
    app.loadInitialPage();
});
