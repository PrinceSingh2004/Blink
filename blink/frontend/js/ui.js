/**
 * ui.js – Blink Platform UI Interactions v6.0
 */

document.addEventListener('DOMContentLoaded', () => {
    initNavbar();
    initSearch();
    initToasts();
    initLogout();
});

function initNavbar() {
    const currentPath = window.location.pathname;
    const pageName = currentPath.split('/').pop() || 'index.html';
    
    const allLinks = document.querySelectorAll('.nav-item');
    allLinks.forEach(link => {
        const href = link.getAttribute('href');
        if (href === pageName) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });
}

function initSearch() {
    const searchInput = document.getElementById('searchInput');
    const searchResults = document.getElementById('searchResults');
    const API = window.BlinkConfig ? window.BlinkConfig.API_BASE : 'http://localhost:5000';

    if (!searchInput || !searchResults) return;

    searchInput.addEventListener('input', async (e) => {
        const query = e.target.value.trim();
        if (query.length < 2) {
            searchResults.innerHTML = '';
            return;
        }

        try {
            const res = await window.BlinkConfig.fetch(`/search?q=${query}`);
            const data = await res.json();
            renderSearchResults(data);
        } catch (err) {
            console.error('Search error:', err);
        }
    });

    function renderSearchResults(data) {
        let html = '';
        if (data.users && data.users.length > 0) {
            html += '<div style="margin-bottom:10px;"><b style="font-size:12px; color:var(--text-muted);">USERS</b>';
            data.users.forEach(u => {
                html += `
                    <a href="profile.html?id=${u.id}" class="nav-item" style="padding:5px 0; font-size:14px;">
                        ${u.username}
                    </a>
                `;
            });
            html += '</div>';
        }
        if (data.videos && data.videos.length > 0) {
            html += '<div><b style="font-size:12px; color:var(--text-muted);">POSTS</b>';
            data.videos.forEach(v => {
                html += `
                    <a href="index.html?v=${v.id}" class="nav-item" style="padding:5px 0; font-size:14px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; display:block;">
                        ${v.username}: ${v.caption}
                    </a>
                `;
            });
            html += '</div>';
        }
        if (!html) html = '<p style="font-size:12px; color:var(--text-muted); padding:10px 0;">No results found.</p>';
        searchResults.innerHTML = html;
    }
}

function initLogout() {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('blink_token');
            localStorage.removeItem('blink_user');
            window.location.href = 'login.html';
        });
    }
}

function initToasts() {
    window.showBlinkToast = (message, type = 'info') => {
        const container = document.getElementById('toastContainer');
        if (!container) return;
        
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        
        const icon = type === 'success' ? 'bi-check-circle-fill' : 
                     type === 'error' ? 'bi-exclamation-circle-fill' : 'bi-info-circle-fill';
                     
        toast.innerHTML = `
            <i class="bi ${icon}"></i>
            <span>${message}</span>
        `;
        
        container.appendChild(toast);
        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 400);
        }, 3000);
    };
    window.showToast = window.showBlinkToast;
}
