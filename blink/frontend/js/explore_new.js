/* ═══════════════════════════════════════════════════════════════════════════════
   BLINK v4.0 - EXPLORE MODULE
   Search users, discover creators, trending
   ═══════════════════════════════════════════════════════════════════════════════ */

class ExploreView {
    constructor() {
        this.searchResults = [];
        this.trendingUsers = [];
    }

    /**
     * Initialize explore page
     */
    init() {
        this.setupSearch();
        this.loadTrendingUsers();
    }

    /**
     * Setup search input
     */
    setupSearch() {
        const searchInput = document.querySelector('.explore-search input');
        if (!searchInput) return;

        let debounceTimer;
        searchInput.addEventListener('input', (e) => {
            clearTimeout(debounceTimer);
            const query = e.target.value.trim();

            debounceTimer = setTimeout(() => {
                if (query.length > 0) {
                    this.search(query);
                } else {
                    this.loadTrendingUsers();
                }
            }, 300);
        });
    }

    /**
     * Search users
     */
    async search(query) {
        try {
            const response = await window.api?.searchUsers?.(query);
            if (response?.users) {
                this.searchResults = response.users;
                this.displayResults();
            }
        } catch (error) {
            console.error('Search error:', error);
            window.app?.showError?.('Search failed');
        }
    }

    /**
     * Load trending users
     */
    async loadTrendingUsers() {
        try {
            const response = await window.api?.searchUsers?.('');
            if (response?.users) {
                this.trendingUsers = response.users;
                this.displayTrending();
            }
        } catch (error) {
            console.error('Failed to load trending:', error);
        }
    }

    /**
     * Display search results
     */
    displayResults() {
        const container = document.querySelector('.explore-results');
        if (!container) return;

        if (this.searchResults.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="bi bi-search"></i>
                    <p>No creators found</p>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1rem; padding: 1rem;">
                ${this.searchResults.map(user => this.createUserCard(user)).join('')}
            </div>
        `;
    }

    /**
     * Display trending users
     */
    displayTrending() {
        const container = document.querySelector('.explore-results');
        if (!container) return;

        container.innerHTML = `
            <div style="padding: 1rem;">
                <h2 style="margin-bottom: 1rem;">Trending Creators</h2>
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1rem;">
                    ${this.trendingUsers.map(user => this.createUserCard(user)).join('')}
                </div>
            </div>
        `;
    }

    /**
     * Create user card
     */
    createUserCard(user) {
        const isOwnProfile = user.id === window.auth?.getUser?.()?.id;

        return `
            <div style="
                background: var(--surface);
                border: 1px solid var(--border);
                border-radius: 1rem;
                padding: 1.5rem;
                text-align: center;
                cursor: pointer;
                transition: 0.3s;
            "
            onclick="window.profile.load('${user.id}'); window.app.redirect('profile')"
            >
                <div style="
                    width: 80px;
                    height: 80px;
                    border-radius: 50%;
                    background: var(--primary);
                    margin: 0 auto 1rem;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    overflow: hidden;
                ">
                    ${user.profile_photo 
                        ? `<img src="${user.profile_photo}" style="width:100%; height:100%; object-fit:cover;">`
                        : `<span style="font-size: 2rem; font-weight: bold;">${user.username[0].toUpperCase()}</span>`
                    }
                </div>
                
                <h3 style="margin: 0.5rem 0;">@${user.username}</h3>
                <p style="color: var(--text-secondary); margin: 0.5rem 0;">${user.display_name || 'Creator'}</p>
                
                <div style="
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 1rem;
                    margin: 1rem 0;
                    font-size: 0.9rem;
                ">
                    <div>
                        <div style="font-weight: bold;">${user.videos_count || 0}</div>
                        <div style="color: var(--text-secondary);">Videos</div>
                    </div>
                    <div>
                        <div style="font-weight: bold;">${user.followers_count || 0}</div>
                        <div style="color: var(--text-secondary);">Followers</div>
                    </div>
                </div>

                ${isOwnProfile ? '' : `
                    <button 
                        class="btn-primary"
                        style="width: 100%;"
                        onclick="event.stopPropagation(); window.profile.toggleFollow();"
                    >
                        ${user.isFollowing ? 'Following' : 'Follow'}
                    </button>
                `}
            </div>
        `;
    }
}

// Create global instance
window.explore = new ExploreView();

export default window.explore;
