/**
 * ui.js – Blink UI Interactions
 */

document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

function initApp() {
    initNavbar();
    initSearch();
    initToasts();
    initLogout();
}

function initNavbar() {
    let currentPath = window.location.pathname.split('/').pop();
    if (!currentPath || currentPath === '') currentPath = 'index.html';
    
    document.querySelectorAll('.nav-item').forEach(item => {
        const href = item.getAttribute('href');
        if (href && href === currentPath) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
}

function initSearch() {
    const searchTrigger = document.getElementById('searchTrigger');
    const mobileSearchBtn = document.getElementById('mobileSearchBtn');
    const searchOverlay = document.getElementById('searchOverlay');
    const closeSearch = document.getElementById('closeSearch');
    const searchInput = document.getElementById('searchInput');
    const searchResults = document.getElementById('searchResults');

    if (!searchOverlay) return;

    const openSearch = () => {
        searchOverlay.classList.remove('hidden');
        searchInput.focus();
    };

    const hideSearch = () => {
        searchOverlay.classList.add('hidden');
    };

    if (searchTrigger) searchTrigger.onclick = openSearch;
    if (mobileSearchBtn) mobileSearchBtn.onclick = openSearch;
    if (closeSearch) closeSearch.onclick = hideSearch;

    // Close on click outside modal
    searchOverlay.onclick = (e) => {
        if (e.target === searchOverlay) hideSearch();
    };

    // Live search logic
    let debounceTimer;
    searchInput.oninput = () => {
        clearTimeout(debounceTimer);
        const query = searchInput.value.trim();
        
        if (!query) {
            searchResults.innerHTML = '';
            return;
        }

        debounceTimer = setTimeout(async () => {
            try {
                const res = await window.BlinkConfig.fetch(`/search?q=${encodeURIComponent(query)}`);
                const data = await res.json();
                renderSearchResults(data);
            } catch (err) {
                console.error("Search error:", err);
            }
        }, 300);
    };
}

function renderSearchResults(data) {
    const resultsContainer = document.getElementById('searchResults');
    if (!data.users?.length && !data.videos?.length) {
        resultsContainer.innerHTML = '<div class="flex-center p-4 text-secondary">No results found</div>';
        return;
    }

    let html = '';

    if (data.users?.length) {
        html += '<h4 class="px-4 py-2 text-secondary">Users</h4>';
        html += data.users.map(user => `
            <div class="search-item" onclick="window.location.href='profile.html?id=${user.id}'">
                <img src="${user.profile_pic || 'https://via.placeholder.com/150'}" class="avatar">
                <div class="user-info">
                    <div class="username">${user.username}</div>
                </div>
            </div>
        `).join('');
    }

    if (data.videos?.length) {
        html += '<h4 class="px-4 py-2 text-secondary">Videos</h4>';
        html += data.videos.map(video => `
            <div class="search-item" onclick="window.location.href='index.html?v=${video.id}'">
                <img src="${video.thumbnail_url || 'https://via.placeholder.com/150'}" class="avatar" style="border-radius: 4px;">
                <div class="user-info">
                    <div class="username">${video.caption || "Untitled Reel"}</div>
                </div>
            </div>
        `).join('');
    }

    resultsContainer.innerHTML = html;
}

function initLogout() {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.onclick = (e) => {
            e.preventDefault();
            window.BlinkConfig.logout();
        };
    }
}

function initToasts() {
    window.showToast = (message, type = 'success') => {
        const container = document.getElementById('toastContainer') || document.body;
        const toast = document.createElement('div');
        toast.className = `toast toast-${type} animate-up`;
        toast.innerText = message;
        
        // Custom styling for toast since we removed it from global/components partly
        Object.assign(toast.style, {
            position: 'fixed',
            top: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--bg-elevated)',
            color: '#fff',
            padding: '12px 24px',
            borderRadius: 'var(--radius-full)',
            boxShadow: 'var(--shadow-soft)',
            zIndex: '9999',
            border: '1px solid var(--border-subtle)',
            fontSize: '14px',
            fontWeight: '600'
        });

        container.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translate(-50%, -20px)';
            toast.style.transition = 'all 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    };
}
