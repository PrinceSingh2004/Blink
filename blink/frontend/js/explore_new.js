/* ═══════════════════════════════════════════════════════════════════════════════
    BLINK v5.0 - EXPLORE & SEARCH MODULE
    Dynamic user search and discovery
    ═══════════════════════════════════════════════════════════════════════════════ */

class BlinkExplore {
    constructor() {
        this.searchInput = document.getElementById('search-input');
        this.exploreGrid = document.getElementById('explore-grid');
        this.debounceTimeout = null;
        this.init();
    }

    init() {
        if (!this.searchInput) return;

        this.searchInput.addEventListener('input', () => {
            clearTimeout(this.debounceTimeout);
            this.debounceTimeout = setTimeout(() => this.handleSearch(), 500);
        });

        // Load initial explore content
        this.loadExplore();
    }

    async handleSearch() {
        const query = this.searchInput.value.trim();
        if (query.length < 2) {
            this.loadExplore();
            return;
        }

        try {
            const results = await window.api.request(`/search?q=${encodeURIComponent(query)}`);
            if (results && results.users) {
                this.renderUsers(results.users);
            }
        } catch (err) {
            console.error('[Explore] Search failed:', err);
        }
    }

    async loadExplore() {
        try {
            // Fetch popular users or random discovery
            const results = await window.api.request('/users/discover');
            if (results && results.users) {
                this.renderUsers(results.users);
            }
        } catch (err) {
            console.error('[Explore] Load failed:', err);
        }
    }

    renderUsers(users) {
        if (!this.exploreGrid) return;

        if (users.length === 0) {
            this.exploreGrid.innerHTML = `
                <div class="empty-state">
                    <p>No creators found matching your search</p>
                </div>`;
            return;
        }

        this.exploreGrid.innerHTML = users.map(user => `
            <div class="user-card" onclick="window.app.navigateTo('profile', {id: ${user.id}})">
                <img src="${user.profile_photo || 'https://via.placeholder.com/150'}" class="user-avatar">
                <div class="user-info">
                    <h3>${user.username}</h3>
                    <p>${user.bio || 'Blink Creator'}</p>
                </div>
                <button class="btn-primary-sm">View Profile</button>
            </div>
        `).join('');
    }
}

// Global initialization
window.explore = new BlinkExplore();
