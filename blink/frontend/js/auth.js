/* auth.js – Robust shared auth utilities */
window.Blink = window.Blink || {};

// Automatically adopt the current host origin (e.g., https://blink-api.onrender.com)
const API = window.location.origin + '/api';
const TOKEN = 'blink_token';
const USER  = 'blink_user';

// ── Token helpers ─────────────────────────────────────────────
function getToken()    { return localStorage.getItem(TOKEN); }
function getUser()     { try { return JSON.parse(localStorage.getItem(USER)); } catch { return null; } }
function isLoggedIn()  { return !!getToken(); }

function setAuth(token, user) {
    localStorage.setItem(TOKEN, token);
    localStorage.setItem(USER, JSON.stringify(user));
}

// ── Logout Functionality ──────────────────────────────────────
function logout() {
    console.log('[Auth] Logging out...');
    localStorage.removeItem(TOKEN);
    localStorage.removeItem(USER);
    sessionStorage.clear();
    window.location.href = '/pages/login.html';
}

// ── Page Protection ───────────────────────────────────────────
function requireAuth() {
    if (!isLoggedIn()) {
        console.warn('[Auth] Access denied. Redirecting to login...');
        window.location.href = '/pages/login.html';
        return false;
    }
    return true;
}

// ── API helper ────────────────────────────────────────────────
async function apiRequest(url, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (getToken()) headers['Authorization'] = `Bearer ${getToken()}`;
    
    try {
        const res  = await fetch(API + url, { ...options, headers });
        if (res.status === 401) {
            logout(); // Auto-logout if token is expired/invalid
            return;
        }
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        return data;
    } catch (err) {
        if (err.message.includes('401')) logout();
        throw err;
    }
}

// ── Toast ─────────────────────────────────────────────────────
function showToast(msg, type = 'info') {
    let container = document.getElementById('toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

// ── Sidebar & Header user info ─────────────────────────────────
async function populateSidebar() {
    let user = getUser();
    
    // Fallback renderer for instant UI
    const renderUser = (u) => {
        if (!u) return;
        const nameEl   = document.getElementById('sidebarName');
        const handleEl = document.getElementById('sidebarHandle');
        const avatarEl = document.getElementById('sidebarAvatar');
        const topAvEl  = document.getElementById('topNavAvatar');
        
        if (nameEl)   nameEl.textContent   = u.username;
        if (handleEl) handleEl.textContent = '@' + u.username;

        const imgHtml = u.profile_pic || u.profile_photo 
            ? `<img src="${u.profile_pic || u.profile_photo}" alt="${u.username}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
            : (u.username || 'U')[0].toUpperCase();

        if (avatarEl) avatarEl.innerHTML = imgHtml;
        if (topAvEl)  topAvEl.innerHTML  = imgHtml;
    };
    
    // Instant paint
    if (user) renderUser(user);

    // Refresh Fix: Always aggressively fetch from backend to bypass stale localstates
    if (getToken()) {
        try {
            // Using /auth/me to get the freshest user data (including new Cloudinary profile_photo)
            const data = await apiRequest('/auth/me');
            if (data?.user) { 
                user = data.user; 
                localStorage.setItem(USER, JSON.stringify(user)); 
                renderUser(user); // Repaint with refreshed data
            }
        } catch (err) {
            console.warn('[Blink] background profile refresh failed:', err.message);
        }
    }
}

function initSidebar() {
    const pathname = window.location.pathname;
    const page = pathname.split('/').pop() || 'index.html';
    const navLinks = document.querySelectorAll('.nav-links a');
    navLinks.forEach(link => {
        const href = link.getAttribute('href');
        if (!href) return;
        const linkPage = href.split('/').pop();
        if (linkPage === page) link.classList.add('active');
        else link.classList.remove('active');
    });
}

function initSocket() {
    const user = getUser();
    if (!user || typeof io === 'undefined') return;
    try {
        const socket = io();
        window.Blink.socket = socket;
        socket.on('connect', () => {
            socket.emit('identify', user.id);
        });
    } catch (e) { console.error('[Socket] init fail', e); }
}

// ── Creator Search ──────────────────────────────────────────────
async function handleSearch(query) {
    const resultsContainer = document.getElementById('globalSearchResults');
    if (!query) {
        if (resultsContainer) resultsContainer.style.display = 'none';
        return;
    }

    try {
        const data = await apiRequest(`/users/search?q=${encodeURIComponent(query)}`);
        displaySearchResults(data.users || []);
    } catch (err) {
        console.error('[Search] Error:', err.message);
    }
}

function displaySearchResults(users) {
    let container = document.getElementById('globalSearchResults');
    if (!container) {
        const parent = document.querySelector('.sidebar-search');
        container = document.createElement('div');
        container.id = 'globalSearchResults';
        container.className = 'search-results-dropdown';
        parent.appendChild(container);
    }

    container.style.display = 'block';
    if (users.length === 0) {
        container.innerHTML = '<div class="search-item empty">No creators found</div>';
        return;
    }

    container.innerHTML = users.map(user => `
        <div class="search-item" onclick="window.location.href='/pages/profile.html?id=${user.id}'">
            <div class="search-avatar">
                ${user.profile_photo ? `<img src="${user.profile_photo}">` : user.username[0].toUpperCase()}
            </div>
            <div class="search-info">
                <div class="search-username">@${user.username}</div>
                <div class="search-meta">${user.followers_count || 0} followers</div>
            </div>
            ${user.is_live ? '<span class="search-live-dot"></span>' : ''}
        </div>
    `).join('');
}

// ─── Shared UI Helpers ─────────────────────────────────────────
function initPasswordToggles() {
    document.querySelectorAll('.pw-toggle').forEach(btn => {
        btn.onclick = (e) => {
            e.preventDefault();
            const input = btn.parentElement.querySelector('input');
            const icon  = btn.querySelector('i');
            if (input.type === 'password') {
                input.type = 'text';
                icon.className = 'bi bi-eye-slash-fill';
                btn.classList.add('active');
            } else {
                input.type = 'password';
                icon.className = 'bi bi-eye-fill';
                btn.classList.remove('active');
            }
        };
    });
}

// Expose globally
Object.assign(window.Blink, { 
    getToken, getUser, isLoggedIn, setAuth, logout, requireAuth, 
    apiRequest, showToast, populateSidebar, initSidebar, initSocket, handleSearch,
    initPasswordToggles
});

// ── DOM Initialization ────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const path = window.location.pathname;
    
    // Auto-protect pages starting with /pages/ or known protected paths
    const publicPages = ['login.html', 'register.html', 'forgot-password.html', 'contact.html'];
    const isPublic = publicPages.some(p => path.includes(p));

    if (path.includes('/pages/') && !isPublic) {
        if (!requireAuth()) return;
    }

    initPasswordToggles();
    initSidebar();
    if (isLoggedIn()) {
        populateSidebar();
        initSocket();
    }

    // Attach Search Listener
    const searchInput = document.getElementById('globalSearchInput');
    if (searchInput) {
        let debounceTimer;
        searchInput.addEventListener('input', (e) => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => handleSearch(e.target.value.trim()), 300);
        });
        
        // Hide results when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.sidebar-search')) {
                const results = document.getElementById('globalSearchResults');
                if (results) results.style.display = 'none';
            }
        });
    }

    // ── Theme Toggle ──────────────────────────────────────────
    const themeToggle = document.getElementById('themeToggle');
    const root = document.documentElement;

    const updateThemeIcon = (theme) => {
        if (!themeToggle) return;
        themeToggle.textContent = theme === 'dark' ? '☀️' : '🌙';
    };

    const setTheme = (theme) => {
        root.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
        updateThemeIcon(theme);
    };

    // Load saved theme or detect system pref
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
        setTheme(savedTheme);
    } else {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        setTheme(prefersDark ? 'dark' : 'light');
    }

    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const currentTheme = root.getAttribute('data-theme');
            setTheme(currentTheme === 'dark' ? 'light' : 'dark');
        });
    }

    // Attach Logout Listener
    document.getElementById('logoutBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        logout();
    });
});

// ── Login / Register Forms ───────────────────────────────────
const loginForm = document.getElementById('loginForm');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const identifier = loginForm.identifier.value.trim();
        const password   = loginForm.password.value;
        const btn        = document.getElementById('loginBtn');
        try {
            btn.disabled = true;
            btn.textContent = 'Signing in...';
            const data = await apiRequest('/auth/login', { method: 'POST', body: JSON.stringify({ identifier, password }) });
            if (data?.token) {
                setAuth(data.token, data.user);
                window.location.href = '/pages/index.html';
            }
        } catch (err) {
            showToast(err.message, 'error');
            btn.disabled = false;
            btn.textContent = 'Sign In';
        }
    });
}

const registerForm = document.getElementById('registerForm');
if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = registerForm.username.value.trim();
        const email    = registerForm.email.value.trim();
        const password = registerForm.password.value;
        const confirm  = registerForm.confirmPassword.value;
        const btn      = document.getElementById('registerBtn');

        if (password !== confirm) return showToast("Passwords do not match", "error");

        // ONLY GMAIL VALIDATION
        const gmailPattern = /^[a-zA-Z0-9._%+-]+@gmail\.com$/;
        if (!gmailPattern.test(email)) {
            showToast("Please enter a valid Gmail address", "error");
            return;
        }

        try {
            btn.disabled = true;
            btn.textContent = 'Creating account...';
            const data = await apiRequest('/auth/register', { 
                method: 'POST', 
                body: JSON.stringify({ username, email, password }) 
            });
            if (data?.token) {
                setAuth(data.token, data.user);
                window.location.href = '/pages/index.html';
            }
        } catch (err) {
            showToast(err.message, 'error');
            btn.disabled = false;
            btn.textContent = 'Create Account';
        }
    });
}

// ══════════════════════════════════════════════════════════════
// ── Native Mobile Back Button Handler ─────────────────────────
// ══════════════════════════════════════════════════════════════
(function initMobileBackButton() {
    // 1. Only execute on mobile platforms (especially Android for back button)
    const isMobile = /android|iphone|ipad|ipod/i.test(navigator.userAgent.toLowerCase());
    if (!isMobile) return;

    let exitTimeout = null;
    let backPressCount = 0;

    // Detect if we are currently on the Home Page
    const pathname = window.location.pathname.toLowerCase();
    const isHomePage = pathname.endsWith('index.html') || pathname.endsWith('pages/') || pathname === '/' || pathname.endsWith('blink/');

    // To intercept the hardware back button cleanly, we must push a trap state into the window's history
    history.pushState({ intercept: true }, '', window.location.href);

    window.addEventListener('popstate', (e) => {
        if (!isHomePage) {
            // Not on Home -> Force redirect to Home seamlessly
            window.location.replace('/pages/index.html');
            return;
        }

        // We ARE on the Home Page
        backPressCount++;
        
        if (backPressCount === 1) {
            // First press -> warn user and restore trap state to prevent closed app
            history.pushState({ intercept: true }, '', window.location.href);
            
            if (window.Blink && typeof window.Blink.showToast === 'function') {
                window.Blink.showToast('Press again to exit', 'info');
            } else if (typeof showToast === 'function') {
                showToast('Press again to exit', 'info');
            } else {
                console.warn('Press again to exit');
            }

            // Reset threshold after 2 seconds
            exitTimeout = setTimeout(() => {
                backPressCount = 0;
            }, 2000);
        } else {
            // Second press within 2s threshold -> Execute native exit / history escape
            clearTimeout(exitTimeout);
            history.back();
        }
    });
})();
