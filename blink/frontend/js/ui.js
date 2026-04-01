/**
 * ui.js – Blink Platform UI Interactions v7.0 (IG Upgrade)
 */

document.addEventListener('DOMContentLoaded', () => {
    initNavbar();
    initSearchSystem();
    initToasts();
    initLogout();
    syncUserUniverse();
});

function initNavbar() {
    const page = window.location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.nav-item').forEach(link => {
        const href = link.getAttribute('href');
        if (href === page) link.classList.add('active');
    });

    // Toggle Sidebar Search
    const searchTrigger = document.getElementById('navSearchTrigger');
    const mobileSearchTrigger = document.getElementById('mobileSearchTrigger');
    const wrapper = document.getElementById('sidebarSearchWrapper');
    
    const toggleSearch = () => {
        if (!wrapper) return;
        const isHidden = wrapper.style.display === 'none';
        wrapper.style.display = isHidden ? 'block' : 'none';
        if (isHidden) document.getElementById('searchInput')?.focus();
    };

    if (searchTrigger) searchTrigger.onclick = toggleSearch;
    if (mobileSearchTrigger) mobileSearchTrigger.onclick = toggleSearch;
}

function initSearchSystem() {
    const input = document.getElementById('searchInput');
    const results = document.getElementById('searchResults');
    let timeout;

    if (!input || !results) return;

    input.addEventListener('input', () => {
        clearTimeout(timeout);
        const query = input.value.trim();

        if (!query) {
            results.innerHTML = '';
            results.style.display = 'none';
            return;
        }

        timeout = setTimeout(async () => {
            try {
                const res = await window.BlinkConfig.fetch(`/search?q=${encodeURIComponent(query)}`);
                const data = await res.json();
                renderResults(data);
            } catch (err) {
                console.error('Search fault:', err);
            }
        }, 300);
    });

    function renderResults(data) {
        if (!data || data.length === 0) {
            results.innerHTML = '<div style="padding:10px; font-size:12px; color:#888;">No results for this query.</div>';
            results.style.display = 'block';
            return;
        }

        results.innerHTML = data.map(item => `
            <div class="search-result-item" onclick="goTo('${item.type}', ${item.id})">
                <img src="${item.image || 'https://via.placeholder.com/32'}" class="result-avatar">
                <div class="result-info">
                    <div class="result-title">${item.title}</div>
                    <div class="result-type">${item.type}</div>
                </div>
            </div>
        `).join('');
        results.style.display = 'block';
    }
}

window.goTo = function(type, id) {
    if (type === 'user') {
        window.location.href = `profile.html?id=${id}`;
    } else {
        window.location.href = `index.html?v=${id}`;
    }
};

async function syncUserUniverse() {
    if (!window.BlinkConfig?.getToken()) return;
    try {
        const res = await window.BlinkConfig.fetch('/auth/me');
        const data = await res.json();
        if (data.success) {
            window.BlinkConfig.setUser(data.user);
            console.log("🌌 Universe Synchronized.");
        }
    } catch (e) {
        console.warn("Universe sync failure:", e.message);
    }
}

function initLogout() {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.onclick = () => {
            window.BlinkConfig.logout();
        };
    }
}

function initToasts() {
    window.showToast = (message, type = 'info') => {
        let container = document.getElementById('toastContainer');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toastContainer';
            document.body.appendChild(container);
        }
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `<span>${message}</span>`;
        container.appendChild(toast);
        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 400);
        }, 3000);
    };
}
