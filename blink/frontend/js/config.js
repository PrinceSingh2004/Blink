/**
 * frontend/js/config.js - Blink Global Configuration
 * Auto-detects environment and configures API endpoints
 */

// Auto-detect environment: local vs production
const isProduction = !window.location.hostname.includes('localhost') && !window.location.hostname.includes('127.0.0.1');
const API_BASE_URL = isProduction ? 'https://blink-yzoo.onrender.com' : 'http://localhost:5000';

window.BlinkConfig = {
    API_BASE: API_BASE_URL,
    SOCKET_URL: API_BASE_URL,
    
    // ════════════════════════════════════════════════════════════════════════════
    // TOKEN & AUTH MANAGEMENT
    // ════════════════════════════════════════════════════════════════════════════
    
    getToken: () => localStorage.getItem('blink_token'),
    setToken: (token) => localStorage.setItem('blink_token', token),
    removeToken: () => localStorage.removeItem('blink_token'),
    
    getUser: () => {
        const user = localStorage.getItem('blink_user');
        return user ? JSON.parse(user) : null;
    },
    setUser: (user) => localStorage.setItem('blink_user', JSON.stringify(user)),
    removeUser: () => localStorage.removeItem('blink_user'),
    
    isAuthenticated: () => !!localStorage.getItem('blink_token'),
    
    logout: () => {
        localStorage.removeItem('blink_token');
        localStorage.removeItem('blink_user');
        window.location.href = '/login.html';
    },
    
    // ════════════════════════════════════════════════════════════════════════════
    // API FETCH HELPER
    // ════════════════════════════════════════════════════════════════════════════
    
    fetch: async (endpoint, options = {}) => {
        const token = window.BlinkConfig.getToken();
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers
        };
        
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        
        const url = endpoint.startsWith('http') ? endpoint : `${window.BlinkConfig.API_BASE}/api${endpoint}`;
        const response = await fetch(url, {
            ...options,
            headers
        });
        
        if (response.status === 401) {
            window.BlinkConfig.logout();
        }
        
        return response;
    }
};

// ════════════════════════════════════════════════════════════════════════════════
// UTILITIES
// ════════════════════════════════════════════════════════════════════════════════

window.formatDate = (date) => {
    if (!date) return '';
    const d = new Date(date);
    const now = new Date();
    const diff = now - d;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (seconds < 60) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString();
};

window.formatNumber = (num) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
};

window.showError = (msg) => {
    const el = document.getElementById('error-message') || document.getElementById('loginAlert');
    if (el) {
        el.textContent = msg;
        el.style.display = 'block';
        setTimeout(() => el.style.display = 'none', 5000);
    }
};

window.requireAuth = () => {
    if (!window.BlinkConfig.isAuthenticated()) window.location.href = '/login.html';
};

window.requireGuest = () => {
    if (window.BlinkConfig.isAuthenticated()) window.location.href = '/index.html';
};
