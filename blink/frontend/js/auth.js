/**
 * frontend/js/auth.js – Blink Auth System v3
 * JWT, API helper, sidebar, toast, search, theme
 */

// ══════════════════════════════════════════════════════════════════
// 0. GLOBAL BLINK NAMESPACE
// ══════════════════════════════════════════════════════════════════
window.Blink = window.Blink || {};

// ── Configuration ─────────────────────────────────────────────────
const _BASE = window.BlinkConfig?.API_BASE || '';
const _API  = _BASE ? `${_BASE}/api` : '/api';

const TOKEN_KEY = 'blink_token';
const USER_KEY  = 'blink_user';

// ── Token helpers ─────────────────────────────────────────────────
function getToken()   { return localStorage.getItem(TOKEN_KEY); }
function getUser()    { try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; } }
function isLoggedIn() { return !!getToken(); }

function setAuth(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
}

// ── Logout ────────────────────────────────────────────────────────
function logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    sessionStorage.clear();
    window.location.href = 'login.html';
}

// ── Page Protection ────────────────────────────────────────────────
function requireAuth() {
    if (!isLoggedIn()) {
        window.location.href = 'login.html';
        return false;
    }
    return true;
}

// ── Universal API request helper ───────────────────────────────────
async function apiRequest(url, options = {}) {
    const headers = {  ...(options.headers || {}) };
    
    // Don't set Content-Type for FormData (let browser set with boundary)
    if (!(options.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
    }
    
    if (getToken()) headers['Authorization'] = `Bearer ${getToken()}`;

    try {
        const res  = await fetch(_API + url, { ...options, headers });
        
        if (res.status === 401) {
            logout();
            return;
        }
        
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        return data;
    } catch (err) {
        throw err;
    }
}

// ── Toast Notification ─────────────────────────────────────────────
function showToast(msg, type = 'info') {
    let container = document.getElementById('toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <span>${msg}</span>
        <button onclick="this.parentElement.remove()" class="toast-close">×</button>
    `;
    container.appendChild(toast);
    
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// ── Sidebar & User info ────────────────────────────────────────────
async function populateSidebar() {
    let user = getUser();

    const renderUser = (u) => {
        if (!u) return;
        const nameEl   = document.getElementById('sidebarUsername');
        const handleEl = document.getElementById('sidebarHandle');
        const avatarEl = document.getElementById('sidebarAvatarImg');
        const topAvEl  = document.getElementById('topNavAvatar');

        if (nameEl)   nameEl.textContent   = u.display_name || u.username || 'User';
        if (handleEl) handleEl.textContent = '@' + (u.username || '');

        const photo   = u.profile_pic || u.avatar_url || u.profile_photo;
        
        if (avatarEl && photo) {
            avatarEl.src = photo;
        }

        if (topAvEl) {
            const initial = (u.username || 'U')[0].toUpperCase();
            topAvEl.innerHTML = photo 
                ? `<img src="${photo}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
                : initial;
        }
        
        // Update notification badge  
        updateNotificationBadge();
    };

    if (user) renderUser(user);

    // Background refresh
    if (getToken()) {
        try {
            const data = await apiRequest('/auth/me');
            if (data?.user) {
                localStorage.setItem(USER_KEY, JSON.stringify(data.user));
                renderUser(data.user);
            }
        } catch (err) {
            console.warn('[Blink] profile refresh failed:', err.message);
        }
    }
}

function initSidebar() {
    const page = window.location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.nav-links a').forEach(link => {
        const href     = link.getAttribute('href');
        const linkPage = (href || '').split('/').pop();
        link.classList.toggle('active', linkPage === page);
    });
}

// ── Notification Badge ─────────────────────────────────────────────
async function updateNotificationBadge() {
    if (!getToken()) return;
    try {
        const data = await apiRequest('/notifications/unread');
        const count = data?.count || 0;
        const badge = document.getElementById('notifBadge');
        if (badge) {
            badge.textContent = count > 9 ? '9+' : String(count);
            badge.style.display = count > 0 ? 'flex' : 'none';
        }
    } catch {}
}

// ── Socket initialization ──────────────────────────────────────────
function initSocket() {
    const user = getUser();
    if (!user || typeof io === 'undefined') return;
    try {
        const socketUrl = window.BlinkConfig?.SOCKET_URL || window.location.origin;
        const socket    = io(socketUrl, {
            auth:              { token: getToken() },
            reconnection:      true,
            reconnectionDelay: 1000,
            timeout:           10000
        });

        window.Blink.socket = socket;

        socket.on('connect', () => {
            socket.emit('identify', user.id);
        });

        socket.on('notification', (notif) => {
            showToast(`🔔 ${notif.message}`, 'info');
            updateNotificationBadge();
        });

        socket.on('connect_error', (err) => {
            console.warn('[Socket] Connection error:', err.message);
        });
    } catch (e) {
        console.error('[Socket] init error:', e);
    }
}

// ── Search ────────────────────────────────────────────────────────
async function handleSearch(query) {
    const results = document.getElementById('globalSearchResults');
    if (!query) {
        if (results) results.style.display = 'none';
        return;
    }

    try {
        const data = await apiRequest(`/users/search?q=${encodeURIComponent(query)}&limit=8`);
        displaySearchResults(data.users || []);
    } catch (err) {
        console.warn('[Search] Error:', err.message);
    }
}

function displaySearchResults(users) {
    let container = document.getElementById('globalSearchResults');
    if (!container) {
        const parent = document.querySelector('.sidebar-search');
        if (!parent) return;
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

    container.innerHTML = users.map(u => `
        <div class="search-item" onclick="window.location.href='profile.html?id=${u.id}'" tabindex="0">
            <div class="search-avatar">
                ${u.profile_photo
                    ? `<img src="${u.profile_photo}" alt="${u.username}">`
                    : u.username[0].toUpperCase()
                }
            </div>
            <div class="search-info">
                <div class="search-username">
                    @${u.username}
                    ${u.is_verified ? '<i class="bi bi-patch-check-fill" style="color:var(--accent-primary);font-size:11px"></i>' : ''}
                </div>
                <div class="search-meta">${u.followers_count || 0} followers</div>
            </div>
            ${u.is_live ? '<span class="search-live-badge">LIVE</span>' : ''}
        </div>
    `).join('');
}

// ── Password toggle ────────────────────────────────────────────────
function initPasswordToggles() {
    document.querySelectorAll('.pw-toggle').forEach(btn => {
        btn.onclick = (e) => {
            e.preventDefault();
            const input = btn.closest('.input-wrap')?.querySelector('input');
            if (!input) return;
            const icon = btn.querySelector('i');
            if (input.type === 'password') {
                input.type = 'text';
                if (icon) icon.className = 'bi bi-eye-slash-fill';
                btn.classList.add('active');
            } else {
                input.type = 'password';
                if (icon) icon.className = 'bi bi-eye-fill';
                btn.classList.remove('active');
            }
        };
    });
}

// ══════════════════════════════════════════════════════════════════
// EXPOSE GLOBALLY
// ══════════════════════════════════════════════════════════════════
Object.assign(window.Blink, {
    API: _API,
    getToken, getUser, isLoggedIn, setAuth, logout, requireAuth,
    apiRequest, showToast, populateSidebar, initSidebar, initSocket,
    handleSearch, updateNotificationBadge, initPasswordToggles
});

// ══════════════════════════════════════════════════════════════════
// DOM READY
// ══════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
    const path = window.location.pathname;
    const publicPages = ['login.html', 'register.html', 'forgot-password.html'];
    const isPublicPage = publicPages.some(p => path.includes(p));

    // Auto-protect non-public pages
    if (!isPublicPage && !requireAuth()) return;

    initPasswordToggles();
    initSidebar();

    if (isLoggedIn()) {
        populateSidebar();
        initSocket();
    }

    // Global search
    const searchInput = document.getElementById('globalSearchInput');
    if (searchInput) {
        let debounceTimer;
        searchInput.addEventListener('input', (e) => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => handleSearch(e.target.value.trim()), 300);
        });
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.sidebar-search')) {
                const res = document.getElementById('globalSearchResults');
                if (res) res.style.display = 'none';
            }
        });
    }

    // Theme toggle
    const themeToggle = document.getElementById('themeToggle');
    const root        = document.documentElement;

    const setTheme = (theme) => {
        root.setAttribute('data-theme', theme);
        localStorage.setItem('blink_theme', theme);
        if (themeToggle) themeToggle.textContent = theme === 'dark' ? '☀️' : '🌙';
    };

    const savedTheme = localStorage.getItem('blink_theme');
    if (savedTheme) {
        setTheme(savedTheme);
    } else {
        setTheme(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    }

    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            setTheme(root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
        });
    }

    // Logout
    document.getElementById('logoutBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        logout();
    });
});

// ══════════════════════════════════════════════════════════════════
// LOGIN FORM
// ══════════════════════════════════════════════════════════════════
const loginForm = document.getElementById('loginForm');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const identifier = (loginForm.identifier?.value || loginForm.email?.value || '').trim();
        const password   = loginForm.password.value;
        const btn        = document.getElementById('loginBtn');
        const alert      = document.getElementById('loginAlert');

        if (!identifier || !password) {
            showToast('Please fill in all fields', 'error');
            return;
        }

        try {
            console.log("🚀 Login process started for identifier:", identifier);
            
            btn.disabled  = true;
            if (btn.querySelector?.('.btn-label')) btn.querySelector('.btn-label').textContent = 'Authenticating...';
            else btn.textContent = 'Authenticating...';
            
            if (alert) { alert.textContent = ''; alert.className = 'auth-alert'; }

            const data = await apiRequest('/auth/login', {
                method: 'POST',
                body: JSON.stringify({ identifier, password })
            });

            console.log("📦 Login Result:", data);

            if (data?.token) {
                console.log("✅ Identity verified. Initializing universe sync...");
                setAuth(data.token, data.user);
                
                showToast(`Welcome back, ${data.user.username}!`, 'success');
                
                // Small delay for toast visibility
                setTimeout(() => {
                    window.location.href = 'index.html';
                }, 800);
            } else {
                throw new Error("Invalid response from server");
            }
        } catch (err) {
            console.error("❌ Login Failure:", err.message);
            showToast(err.message || 'Login failed', 'error');
            
            if (alert) {
                alert.textContent = err.message || 'Verification failed. Please check your credentials.';
                alert.className   = 'auth-alert error';
            }
            
            btn.disabled = false;
            if (btn.querySelector?.('.btn-label')) btn.querySelector('.btn-label').innerHTML = 'Sign in to Blink';
            else btn.textContent = 'Sign in to Blink';
        }
    });
}

// ══════════════════════════════════════════════════════════════════
// REGISTER FORM
// ══════════════════════════════════════════════════════════════════
const registerForm = document.getElementById('registerForm');
if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = (registerForm.username?.value || '').trim();
        const email    = (registerForm.email?.value || '').trim();
        const password = registerForm.password?.value || '';
        const confirm  = registerForm.confirmPassword?.value || '';
        const btn      = document.getElementById('registerBtn');

        if (!username || !email || !password)
            return showToast('All fields are required', 'error');
        if (password !== confirm)
            return showToast('Passwords do not match', 'error');
        if (password.length < 6)
            return showToast('Password must be at least 6 characters', 'error');
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
            return showToast('Please enter a valid email address', 'error');

        try {
            btn.disabled  = true;
            btn.textContent = 'Creating account...';

            const data = await apiRequest('/auth/register', {
                method: 'POST',
                body: JSON.stringify({ username, email, password })
            });

            if (data?.success) {
                showToast('🎉 Account created! Redirecting to sign in...', 'success');
                setTimeout(() => { window.location.href = 'login.html'; }, 1500);
            }
        } catch (err) {
            console.error('[Blink] Registration failed:', err.message);
            showToast(err.message || 'Registration failed', 'error');
            btn.disabled  = false;
            btn.textContent = 'Create Account';
        }
    });
}


// ══════════════════════════════════════════════════════════════════
// Mobile Back Button (Android / PWA)
// ══════════════════════════════════════════════════════════════════
(function initMobileBack() {
    if (!/android|iphone|ipad|ipod/i.test(navigator.userAgent)) return;
    
    const isHome = ['index.html', '', '/'].some(p =>
        window.location.pathname.endsWith(p)
    );

    history.pushState({ blink: true }, '', window.location.href);

    let backCount = 0, exitTimer;
    window.addEventListener('popstate', () => {
        if (!isHome) {
            window.location.replace('index.html');
            return;
        }
        backCount++;
        if (backCount === 1) {
            history.pushState({ blink: true }, '', window.location.href);
            showToast('Press back again to exit', 'info');
            exitTimer = setTimeout(() => { backCount = 0; }, 2000);
        } else {
            clearTimeout(exitTimer);
            history.back();
        }
    });
})();
