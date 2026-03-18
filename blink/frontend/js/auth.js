/* auth.js – Shared auth utilities + login/register logic */

const API   = '/api';
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
function clearAuth() {
    localStorage.removeItem(TOKEN);
    localStorage.removeItem(USER);
}
function logout() {
    clearAuth();
    window.location.href = '/pages/login.html';
}
function requireAuth() {
    if (!isLoggedIn()) { window.location.href = '/pages/login.html'; return false; }
    return true;
}
function redirectIfLoggedIn() {
    if (isLoggedIn()) { window.location.href = '/pages/index.html'; }
}

// ── API helper ────────────────────────────────────────────────
async function apiRequest(url, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (getToken()) headers['Authorization'] = `Bearer ${getToken()}`;
    const res  = await fetch(API + url, { ...options, headers });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
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
    setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateY(-10px)'; toast.style.transition = 'all .25s'; setTimeout(() => toast.remove(), 300); }, 3000);
}

// ── Sidebar user info ─────────────────────────────────────────
async function populateSidebar() {
    let user = getUser();
    // Refresh from server if username is missing
    if (getToken() && (!user || !user.username)) {
        try {
            const r = await fetch('/api/auth/me', { headers: { 'Authorization': `Bearer ${getToken()}` } });
            const d = await r.json();
            if (d.user) { user = d.user; setAuth(getToken(), user); }
        } catch {}
    }
    if (!user) return;
    const nameEl   = document.getElementById('sidebarName');
    const handleEl = document.getElementById('sidebarHandle');
    const avatarEl = document.getElementById('sidebarAvatar');
    if (nameEl)   nameEl.textContent   = user.username || 'User';
    if (handleEl) handleEl.textContent = '@' + (user.username || '');
    if (avatarEl) {
        if (user.profile_picture) {
            avatarEl.innerHTML = `<img src="${user.profile_picture}" alt="${user.username}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
        } else {
            avatarEl.textContent = (user.username || 'U')[0].toUpperCase();
        }
    }
    const lBtn = document.getElementById('logoutBtn');
    if (lBtn) lBtn.onclick = (e) => {
        e.stopPropagation();
        // Show a non-blocking toast with undo option
        let container = document.getElementById('toastContainer');
        if (!container) { container = document.createElement('div'); container.id='toastContainer'; document.body.appendChild(container); }
        container.innerHTML = '';
        const t = document.createElement('div');
        t.className = 'toast info';
        t.innerHTML = `Signing out… <button onclick="this.closest('.toast').dataset.cancel='1'" style="margin-left:8px;background:transparent;border:1px solid rgba(255,255,255,.4);color:#fff;border-radius:4px;padding:2px 8px;cursor:pointer;font-size:11px">Cancel</button>`;
        container.appendChild(t);
        const timer = setTimeout(() => { if (!t.dataset.cancel) { t.remove(); logout(); } }, 2000);
        t.querySelector('button').addEventListener('click', () => { clearTimeout(timer); t.remove(); });
    };

    // Update sidebar UI state
    initSidebar();
}

// ── Sidebar state management ──────────────────────────────────
function initSidebar() {
    const pathname = window.location.pathname;
    const page = pathname.split('/').pop() || 'index.html';
    
    // Set active link highlight based on current page
    const navLinks = document.querySelectorAll('.nav-links a');
    navLinks.forEach(link => {
        const href = link.getAttribute('href');
        if (!href) return;
        
        const linkPage = href.split('/').pop();
        let isActive = false;

        if (linkPage === page) {
            isActive = true;
        } else if ((page === 'index.html' || pathname === '/' || pathname.endsWith('/pages/')) && linkPage === 'index.html') {
             isActive = true;
        }

        if (isActive) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });
}

// ── Login Form ────────────────────────────────────────────────
const loginForm = document.getElementById('loginForm');
if (loginForm) {
    redirectIfLoggedIn();

    const alertEl = document.getElementById('loginAlert');
    const btn     = document.getElementById('loginBtn');

    // Toggle password visibility
    document.getElementById('pwToggle')?.addEventListener('click', function () {
        const input = document.getElementById('passwordInput');
        const isText = input.type === 'text';
        input.type = isText ? 'password' : 'text';
        this.innerHTML = isText ? '<i class="bi bi-eye"></i>' : '<i class="bi bi-eye-slash"></i>';
    });

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const identifier = loginForm.identifier.value.trim();
        const password   = loginForm.password.value;

        if (!identifier || !password) {
            alertEl.textContent = 'Please fill in all fields.';
            alertEl.className   = 'auth-alert error show';
            return;
        }

        btn.classList.add('loading');
        btn.disabled = true;
        alertEl.className = 'auth-alert';

        try {
            const data = await apiRequest('/auth/login', {
                method: 'POST',
                body:   JSON.stringify({ identifier, password })
            });
            setAuth(data.token, data.user);
            alertEl.textContent = 'Welcome back, @' + data.user.username;
            alertEl.className   = 'auth-alert success show';
            setTimeout(() => { window.location.href = '/pages/index.html'; }, 600);
        } catch (err) {
            alertEl.textContent = err.message;
            alertEl.className   = 'auth-alert error show';
            btn.classList.remove('loading');
            btn.disabled = false;
        }
    });
}

// ── Register Form ─────────────────────────────────────────────
const registerForm = document.getElementById('registerForm');
if (registerForm) {
    redirectIfLoggedIn();

    const alertEl = document.getElementById('registerAlert');
    const btn     = document.getElementById('registerBtn');
    const pwInput = document.getElementById('passwordInput');
    const bars    = document.querySelectorAll('.pw-bar');
    const pwLabel = document.getElementById('pwLabel');

    // Password strength meter
    pwInput?.addEventListener('input', function () {
        const v = this.value;
        let strength = 0;
        if (v.length >= 6)  strength++;
        if (v.length >= 10) strength++;
        if (/[A-Z]/.test(v) && /[0-9]/.test(v)) strength++;
        bars.forEach((bar, i) => {
            bar.className = 'pw-bar';
            if (i < strength) bar.classList.add(strength === 1 ? 'weak' : strength === 2 ? 'medium' : 'strong');
        });
        if (pwLabel) pwLabel.textContent = ['', 'Weak password', 'Medium password', 'Strong password!'][strength];
    });

    // Toggle password visibility
    document.getElementById('pwToggle')?.addEventListener('click', function () {
        const input = document.getElementById('passwordInput');
        const isText = input.type === 'text';
        input.type = isText ? 'password' : 'text';
        this.innerHTML = isText ? '<i class="bi bi-eye"></i>' : '<i class="bi bi-eye-slash"></i>';
    });

    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = registerForm.username.value.trim();
        const email    = registerForm.email.value.trim();
        const password = registerForm.password.value;
        const confirm  = registerForm.confirmPassword.value;

        if (!username || !email || !password) {
            alertEl.textContent = 'Please fill in all fields.';
            alertEl.className   = 'auth-alert error show';
            return;
        }
        if (password !== confirm) {
            alertEl.textContent = 'Passwords do not match.';
            alertEl.className   = 'auth-alert error show';
            return;
        }
        if (password.length < 6) {
            alertEl.textContent = 'Password must be at least 6 characters.';
            alertEl.className   = 'auth-alert error show';
            return;
        }

        btn.classList.add('loading');
        btn.disabled = true;
        alertEl.className = 'auth-alert';

        try {
            const data = await apiRequest('/auth/register', {
                method: 'POST',
                body:   JSON.stringify({ username, email, password })
            });
            setAuth(data.token, data.user);
            alertEl.textContent = 'Account created! Redirecting...';
            alertEl.className   = 'auth-alert success show';
            setTimeout(() => { window.location.href = '/pages/index.html'; }, 700);
        } catch (err) {
            alertEl.textContent = err.message;
            alertEl.className   = 'auth-alert error show';
            btn.classList.remove('loading');
            btn.disabled = false;
        }
    });
}

// ─── GLOBAL SEARCH ──────────────────────────────────────────
async function initGlobalSearch() {
    const searchInput = document.getElementById('globalSearchInput');
    if (!searchInput) return;

    // Create overlay if not exists
    let overlay = document.getElementById('searchResultsOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'searchResultsOverlay';
        overlay.className = 'search-results-overlay';
        overlay.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:32px">
                <h2 style="font-size:24px;font-weight:900"><i class="bi bi-search icon-inline"></i>Found Creators</h2>
                <button class="btn btn-secondary btn-sm" id="closeSearchBtn">Close <i class="bi bi-x-lg"></i></button>
            </div>
            <div class="search-grid" id="searchGrid"></div>
        `;
        document.body.appendChild(overlay);
        document.getElementById('closeSearchBtn').onclick = () => overlay.classList.remove('active');
    }

    const grid = document.getElementById('searchGrid');
    let debounce;

    searchInput.addEventListener('input', () => {
        clearTimeout(debounce);
        const q = searchInput.value.trim();
        if (!q) { overlay.classList.remove('active'); return; }

        debounce = setTimeout(async () => {
            try {
                overlay.classList.add('active');
                grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:100px"><div class="spinner"></div></div>';
                
                const data = await window.Blink.apiRequest(`/users/search?q=${encodeURIComponent(q)}`);
                const users = data.users || [];

                if (!users.length) {
                    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:100px;color:var(--text-muted)">No creators found with that name.</div>';
                    return;
                }

                grid.innerHTML = users.map(u => {
                    const av = u.profile_picture 
                        ? `<img src="${u.profile_picture}" alt="">` 
                        : `<span>${(u.username || 'U')[0].toUpperCase()}</span>`;
                    const liveBadge = u.is_live ? `<div style="position:absolute; top:10px; right:10px; background:var(--red); color:white; font-size:10px; font-weight:900; padding:2px 6px; border-radius:4px; z-index:5">LIVE</div>` : '';
                    return `
                        <div class="search-user-card" style="position:relative">
                            ${liveBadge}
                            <div class="search-user-avatar">${av}</div>
                            <div class="search-user-name">${u.username}</div>
                            <div class="search-user-handle">@${u.username}</div>
                            <button class="btn btn-primary btn-sm" style="width:100%" onclick="window.location.href='profile.html?id=${u.id}'">View Profile</button>
                        </div>
                    `;
                }).join('');
            } catch (err) {
                window.Blink.showToast('Search failed', 'error');
            }
        }, 400);
    });

    document.addEventListener('keydown', e => { if (e.key === 'Escape') overlay.classList.remove('active'); });
}


// ── Socket.io & Online Status ─────────────────────────────────
async function initSocket() {
    const user = getUser();
    if (!user || !user.id) return;

    // Load socket.io client if not present
    if (typeof io === 'undefined') {
        await new Promise((resolve) => {
            const s = document.createElement('script');
            s.src = '/socket.io/socket.io.js';
            s.onload = resolve;
            s.onerror = () => { console.error('Failed to load socket.io'); resolve(); };
            document.head.appendChild(s);
        });
    }

    if (typeof io === 'undefined') return;

    try {
        const socket = io({ timeout: 5000 });
        window.Blink.socket = socket;

        socket.on('connect', () => {
            socket.emit('identify', user.id);
            console.log('[Socket] Connected and identified');
        });

        socket.on('user_status', (data) => {
            // Globally update any element with data-online-user-id
            const elements = document.querySelectorAll(`[data-online-user-id="${data.userId}"]`);
            elements.forEach(el => {
                if (data.status === 'online') {
                    el.classList.add('online');
                    el.classList.remove('offline');
                    if (el.tagName === 'SPAN' || el.classList.contains('status-text')) {
                        el.innerHTML = '<i class="bi bi-circle-fill" style="margin-right:6px;color:var(--green)"></i>Online';
                    }
                } else {
                    el.classList.add('offline');
                    el.classList.remove('online');
                    if (el.tagName === 'SPAN' || el.classList.contains('status-text')) {
                        el.innerHTML = '<i class="bi bi-circle-fill" style="margin-right:6px;color:var(--text-muted)"></i>Offline';
                    }
                }
            });
        });

        // Handle reconnection
        socket.on('reconnect', () => {
            socket.emit('identify', user.id);
        });

    } catch (err) {
        console.error('[Socket] initialization failed:', err);
    }
}

// Expose globally
window.Blink = { getToken, getUser, isLoggedIn, setAuth, clearAuth, logout, requireAuth, apiRequest, showToast, populateSidebar, initSidebar, initSocket };

// Initialize search and sidebar when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    initGlobalSearch();
    initSidebar();
    if (isLoggedIn()) {
        initSocket();
    }
});

