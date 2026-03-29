/* ═══════════════════════════════════════════════════════════════════════════════
   BLINK v4.0 - APP ROUTER & INITIALIZATION
   Page routing, navigation, mobile/desktop mode, initialization
   ═══════════════════════════════════════════════════════════════════════════════ */

class BlinkApp {
    constructor() {
        this.currentPage = null;
        this.isInitialized = false;
        this.init();
    }

    /**
     * Initialize app
     */
    init() {
        if (this.isInitialized) return;

        document.addEventListener('DOMContentLoaded', () => {
            this.setupNavigation();
            this.setupPageRouting();
            this.setupResponsiveMode();
            this.loadInitialPage();
            this.isInitialized = true;
        });
    }

    /**
     * Setup navigation event listeners
     */
    setupNavigation() {
        // Mobile bottom nav
        const mobileNavItems = document.querySelectorAll('.mobile-nav .nav-item');
        mobileNavItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const page = item.dataset.page;
                this.navigateTo(page);
                this.updateActiveNav();
            });
        });

        // Desktop sidebar nav
        const desktopNavLinks = document.querySelectorAll('.desktop-nav .nav-link');
        desktopNavLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const page = link.dataset.page;
                this.navigateTo(page);
                this.updateActiveNav();
            });
        });

        // Logout button
        const logoutBtn = document.querySelector('.logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if (window.auth) {
                    window.auth.logout();
                }
            });
        }
    }

    /**
     * Navigate to page
     */
    navigateTo(page) {
        // Hide all pages
        document.querySelectorAll('.page').forEach(p => {
            p.classList.remove('active');
        });

        // Show selected page
        const pageElement = document.getElementById(`${page}-page`);
        if (pageElement) {
            pageElement.classList.add('active');
            this.currentPage = page;

            // Initialize page-specific functionality
            this.initializePage(page);
        }
    }

    /**
     * Update active nav item
     */
    updateActiveNav() {
        // Mobile nav
        document.querySelectorAll('.mobile-nav .nav-item').forEach(item => {
            if (item.dataset.page === this.currentPage) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });

        // Desktop nav
        document.querySelectorAll('.desktop-nav .nav-link').forEach(link => {
            if (link.dataset.page === this.currentPage) {
                link.classList.add('active');
            } else {
                link.classList.remove('active');
            }
        });
    }

    /**
     * Initialize page-specific functionality
     */
    initializePage(page) {
        switch (page) {
            case 'feed':
                this.initFeedPage();
                break;
            case 'create':
                this.initCreatePage();
                break;
            case 'live':
                this.initLivePage();
                break;
            case 'messages':
                this.initMessagesPage();
                break;
            case 'profile':
                this.initProfilePage();
                break;
            case 'explore':
                this.initExplorePage();
                break;
        }
    }

    /**
     * Initialize Feed Page
     */
    initFeedPage() {
        if (window.feed && typeof window.feed.loadFeed === 'function') {
            window.feed.loadFeed();
        }
    }

    /**
     * Initialize Create Page
     */
    initCreatePage() {
        if (window.upload && typeof window.upload.init === 'function') {
            window.upload.init();
        }
    }

    /**
     * Initialize Live Page
     */
    initLivePage() {
        if (window.live && typeof window.live.init === 'function') {
            window.live.init();
        }
    }

    /**
     * Initialize Messages Page
     */
    initMessagesPage() {
        if (window.messenger && typeof window.messenger.init === 'function') {
            window.messenger.init();
        }
    }

    /**
     * Initialize Profile Page
     */
    initProfilePage() {
        if (window.profile && typeof window.profile.load === 'function') {
            const user = window.auth?.getUser?.();
            if (user) {
                window.profile.load(user.id);
            }
        }
    }

    /**
     * Initialize Explore Page
     */
    initExplorePage() {
        if (window.explore && typeof window.explore.init === 'function') {
            window.explore.init();
        }
    }

    /**
     * Setup page routing from URL
     */
    setupPageRouting() {
        window.addEventListener('popstate', () => {
            this.loadInitialPage();
        });
    }

    /**
     * Load initial page based on auth status
     */
    loadInitialPage() {
        const isAuthenticated = window.auth?.isAuthenticated?.();

        if (!isAuthenticated) {
            if (!window.location.pathname.includes('login') && !window.location.pathname.includes('register')) {
                window.auth?.showAuthModal?.();
                this.navigateTo('feed');
            }
            return;
        }

        // Default to feed
        this.navigateTo('feed');
    }

    /**
     * Setup responsive mode detection
     */
    setupResponsiveMode() {
        const updateMode = () => {
            const width = window.innerWidth;
            const isMobile = width <= 600;
            const isTablet = width >= 601 && width <= 1024;
            const isDesktop = width >= 1025;

            document.body.dataset.mode = isMobile ? 'mobile' : (isTablet ? 'tablet' : 'desktop');
        };

        updateMode();
        window.addEventListener('resize', updateMode);
    }

    /**
     * Redirect to page
     */
    redirect(page) {
        this.navigateTo(page);
        this.updateActiveNav();
    }

    /**
     * Show loading state
     */
    showLoading() {
        let loader = document.querySelector('.page-loader');
        if (!loader) {
            loader = document.createElement('div');
            loader.className = 'page-loader';
            loader.innerHTML = '<div class="spinner"></div>';
            document.body.appendChild(loader);
        }
        loader.style.display = 'flex';
    }

    /**
     * Hide loading state
     */
    hideLoading() {
        const loader = document.querySelector('.page-loader');
        if (loader) {
            loader.style.display = 'none';
        }
    }

    /**
     * Show error
     */
    showError(message) {
        if (window.auth?.showToast) {
            window.auth.showToast(message, 'error');
        }
    }

    /**
     * Show success
     */
    showSuccess(message) {
        if (window.auth?.showToast) {
            window.auth.showToast(message, 'success');
        }
    }
}

// Create global instance
window.app = new BlinkApp();

// Export
export default window.app;
