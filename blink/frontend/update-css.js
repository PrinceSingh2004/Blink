const fs = require('fs');
const path = require('path');

const dir = 'c:/Users/ps126/OneDrive/Desktop/Project/Infinite_Scroll/blink/frontend/css';

const globalCss = `/**
 * global.css – Blink Modern Design System v7.0
 * Dark Mode Default, 8px Grid, Snap Transitions
 */

@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');

:root {
    /* --- Core Dark Palette --- */
    --primary: #ff2c55;
    --primary-alt: #ff0050;
    --primary-dim: rgba(255, 44, 85, 0.15);
    --bg-dark: #000000;
    --bg-surface: #121212;
    --bg-elevated: #1c1c1e;
    --bg-hover: rgba(255, 255, 255, 0.08);
    --bg-glass: rgba(0, 0, 0, 0.6);
    
    --text-primary: #ffffff;
    --text-secondary: #aaaaaa;
    --text-muted: #666666;
    
    --border-subtle: rgba(255, 255, 255, 0.12);
    --border-low: rgba(255, 255, 255, 0.08);
    
    --accent-gradient: linear-gradient(45deg, #ff2c55, #ff0050);
    
    /* --- Spacing System (8px Grid) --- */
    --space-xxs: 4px;
    --space-xs: 8px;
    --space-sm: 12px;
    --space-md: 16px;
    --space-lg: 24px;
    --space-xl: 32px;
    --space-xxl: 48px;
    
    /* --- Dimensions --- */
    --sidebar-width-desktop: 260px;
    --sidebar-width-tablet: 80px;
    --bottom-nav-height: 64px;
    
    /* --- Border Radius --- */
    --radius-sm: 8px;
    --radius-md: 12px;
    --radius-lg: 16px;
    --radius-full: 9999px;
    
    --shadow-soft: 0 8px 24px rgba(0, 0, 0, 0.4);
    --blur: blur(20px);
    
    --transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    --transition-spring: transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
    -webkit-tap-highlight-color: transparent;
}

html, body {
    height: 100%;
    width: 100%;
    background-color: var(--bg-dark);
    color: var(--text-primary);
    font-family: 'Inter', -apple-system, blinkmacsystemfont, sans-serif;
    overflow-x: hidden;
    scroll-behavior: smooth;
    -webkit-font-smoothing: antialiased;
}

a {
    color: inherit;
    text-decoration: none;
    transition: var(--transition);
}

button {
    border: none;
    background: none;
    cursor: pointer;
    font-family: inherit;
    color: inherit;
    transition: var(--transition);
}
button:active {
    transform: scale(0.96);
}

img, video {
    max-width: 100%;
    display: block;
}

/* --- Layout Structure --- */
.app-container {
    display: flex;
    height: 100vh;
    width: 100vw;
    overflow: hidden;
}

.main-content {
    flex: 1;
    height: 100%;
    overflow-y: auto;
    position: relative;
    background: var(--bg-dark);
}

::-webkit-scrollbar {
    width: 8px;
}
::-webkit-scrollbar-thumb {
    background: var(--border-low);
    border-radius: var(--radius-full);
}
::-webkit-scrollbar-thumb:hover {
    background: var(--text-muted);
}

/* --- Utilities --- */
.flex { display: flex; }
.flex-col { display: flex; flex-direction: column; }
.flex-center { display: flex; align-items: center; justify-content: center; }
.flex-between { display: flex; align-items: center; justify-content: space-between; }
.flex-1 { flex: 1; }
.w-full { width: 100%; }
.h-full { height: 100%; }

.text-gradient {
    background: var(--accent-gradient);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    font-weight: 800;
}

.text-primary { color: var(--text-primary); }
.text-secondary { color: var(--text-secondary); }
.text-muted { color: var(--text-muted); }

.hidden { display: none !important; }

/* Spacing Utils */
.mt-auto { margin-top: auto; }
.mb-xl { margin-bottom: var(--space-xl); }
.py-4 { padding-top: var(--space-lg); padding-bottom: var(--space-lg); }

/* Animations */
@keyframes slideUp {
    from { transform: translateY(30px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
}
@keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
}
.animate-up { animation: slideUp 0.4s cubic-bezier(0.2, 0.8, 0.2, 1) forwards; }
.animate-fade { animation: fadeIn 0.3s ease forwards; }

.modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    backdrop-filter: var(--blur);
    padding: var(--space-md);
}

.btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 12px 24px;
    border-radius: var(--radius-md);
    font-weight: 600;
    font-size: 15px;
    cursor: pointer;
    gap: var(--space-xs);
    white-space: nowrap;
    transition: var(--transition);
}
.btn-primary { background: var(--primary); color: #fff; }
.btn-primary:hover { background: var(--primary-alt); }
.btn-secondary { background: var(--bg-elevated); color: var(--text-primary); border: 1px solid var(--border-subtle); }
.btn-secondary:hover { background: var(--bg-hover); }
.btn-ghost { background: transparent; color: var(--text-primary); }
.btn-ghost:hover { background: var(--bg-hover); }
.btn-circle { width: 44px; height: 44px; border-radius: 50%; padding: 0; }
`;

const componentsCss = `/**
 * components.css – Blink Modern Components
 */

/* --- Sidebar (Desktop) --- */
.sidebar {
    width: var(--sidebar-width-desktop);
    height: 100vh;
    border-right: 1px solid var(--border-low);
    background: var(--bg-dark);
    display: flex;
    flex-direction: column;
    padding: var(--space-md) var(--space-md);
    z-index: 1000;
    transition: width 0.3s ease;
}

.sidebar .logo {
    font-size: 32px;
    letter-spacing: -1px;
}

.nav-links {
    gap: var(--space-xs);
}

.nav-item {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-md);
    border-radius: var(--radius-md);
    color: var(--text-primary);
    font-size: 16px;
    font-weight: 500;
    cursor: pointer;
}

.nav-item i {
    font-size: 24px;
    transition: var(--transition-spring);
}

.nav-item:hover {
    background: var(--bg-hover);
}

.nav-item:hover i {
    transform: scale(1.1);
}

.nav-item.active {
    font-weight: 700;
    color: var(--primary);
    background: var(--primary-dim);
}
.nav-item.active i {
    color: var(--primary);
}

.sidebar-footer {
    padding-top: var(--space-lg);
    border-top: 1px solid var(--border-low);
}

/* --- Mobile Bottom Nav --- */
.mobile-nav {
    position: fixed;
    bottom: 0;
    left: 0;
    width: 100%;
    height: calc(var(--bottom-nav-height) + env(safe-area-inset-bottom));
    padding-bottom: env(safe-area-inset-bottom);
    background: rgba(0,0,0,0.85);
    backdrop-filter: blur(15px);
    border-top: 1px solid var(--border-low);
    display: none; /* hidden on desktop by default */
    justify-content: space-around;
    align-items: center;
    z-index: 9000;
}

.mobile-nav .nav-item {
    flex-direction: column;
    gap: 4px;
    font-size: 11px;
    padding: 8px 0;
    flex: 1;
    justify-content: center;
    border-radius: 0;
}
.mobile-nav .nav-item:hover { background: transparent; }
.mobile-nav .nav-item i { font-size: 24px; }
.mobile-nav .nav-item.active { background: transparent; color: var(--primary); }

/* --- Forms & Inputs --- */
.input-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    width: 100%;
}
.input-group label {
    font-size: 14px;
    font-weight: 500;
    color: var(--text-secondary);
}
.input-field {
    width: 100%;
    background: var(--bg-elevated);
    border: 1px solid var(--border-subtle);
    padding: 14px 16px;
    border-radius: var(--radius-md);
    color: var(--text-primary);
    font-size: 15px;
    outline: none;
    transition: var(--transition);
}
.input-field:focus {
    border-color: var(--primary);
    background: #252529;
}

/* --- Search Modal --- */
.search-modal {
    background: var(--bg-surface);
    width: 100%;
    max-width: 500px;
    border-radius: var(--radius-lg);
    padding: var(--space-lg);
    border: 1px solid var(--border-low);
    box-shadow: var(--shadow-soft);
}
.search-bar {
    display: flex;
    align-items: center;
    background: var(--bg-elevated);
    border-radius: var(--radius-md);
    padding: 12px 16px;
    gap: 12px;
    margin-top: var(--space-md);
    border: 1px solid var(--border-subtle);
}
.search-bar:focus-within { border-color: var(--primary); }
.search-bar input {
    background: none; border: none; color: #fff; flex: 1; outline: none; font-size: 16px;
}
.search-results-list {
    margin-top: var(--space-md);
    max-height: 400px;
    overflow-y: auto;
}
.search-item {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: 12px;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: var(--transition);
}
.search-item:hover { background: var(--bg-hover); }
.search-item .avatar {
    width: 44px; height: 44px; border-radius: 50%; object-fit: cover;
}

/* --- Loaders --- */
.spinner {
    width: 32px;
    height: 32px;
    border: 3px solid var(--primary-dim);
    border-top-color: var(--primary);
    border-radius: 50%;
    animation: spin 1s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.skeleton {
    background: linear-gradient(90deg, var(--bg-elevated) 25%, #2a2a2a 50%, var(--bg-elevated) 75%);
    background-size: 200% 100%;
    animation: loading 1.5s infinite;
    border-radius: var(--radius-md);
}
@keyframes loading { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

/* Profile Modals */
.modal-content {
    background: var(--bg-surface);
    width: 100%;
    max-width: 450px;
    border-radius: var(--radius-lg);
    padding: var(--space-lg);
    border: 1px solid var(--border-subtle);
}
.modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-lg);
}
.modal-header h3 { font-size: 20px; font-weight: 700; }
`;

const feedCss = `/**
 * feed.css – Reels & Video Feed UI
 */
.reels-container {
    height: 100vh;
    width: 100%;
    overflow-y: scroll;
    scroll-snap-type: y mandatory;
    scroll-behavior: smooth;
}

.reel-item {
    height: 100vh;
    width: 100%;
    position: relative;
    scroll-snap-align: start;
    scroll-snap-stop: always;
    display: flex;
    justify-content: center;
    align-items: center;
    background: #000;
    overflow: hidden;
}

.reel-video {
    width: 100%;
    height: 100%;
    object-fit: cover; /* Fill entirely */
    z-index: 1;
}

/* --- Overlays --- */
.reel-overlay {
    position: absolute;
    inset: 0;
    z-index: 2;
    background: linear-gradient(0deg, rgba(0,0,0,0.8) 0%, transparent 40%, transparent 70%, rgba(0,0,0,0.3) 100%);
    pointer-events: none;
}

.reel-content {
    position: absolute;
    bottom: 0px;
    left: 0;
    right: 0;
    padding: var(--space-lg);
    z-index: 3;
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    pointer-events: none;
}

.reel-info {
    flex: 1;
    max-width: 75%;
    pointer-events: auto;
}

.reel-user {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    margin-bottom: var(--space-sm);
}
.reel-user .avatar {
    width: 40px; height: 40px; border-radius: 50%;
    border: 2px solid var(--primary);
    object-fit: cover;
}
.reel-user .username { font-weight: 700; font-size: 16px; text-shadow: 0 1px 3px rgba(0,0,0,0.8); }

.reel-caption {
    font-size: 15px;
    line-height: 1.5;
    color: #fff;
    text-shadow: 0 1px 3px rgba(0,0,0,0.8);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
}

/* --- Actions --- */
.reel-actions {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
    align-items: center;
    pointer-events: auto;
    margin-bottom: var(--space-sm);
}

.action-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    color: #fff;
}
.action-btn i {
    font-size: 32px;
    filter: drop-shadow(0 2px 4px rgba(0,0,0,0.6));
    transition: var(--transition-spring);
}
.action-btn:hover i { transform: scale(1.15); }
.action-btn:active i { transform: scale(0.9); }
.action-btn .count { font-size: 13px; font-weight: 600; text-shadow: 0 1px 3px rgba(0,0,0,0.8); }

.action-btn.liked i { color: var(--primary); }

/* --- Interactions --- */
.double-tap-heart {
    position: absolute;
    top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    font-size: 120px;
    color: var(--primary);
    z-index: 10;
    pointer-events: none;
    opacity: 0;
}
.double-tap-heart.animate {
    animation: heartPop 0.8s ease-out forwards;
}

@keyframes heartPop {
    0% { transform: translate(-50%, -50%) scale(0); opacity: 0; }
    20% { transform: translate(-50%, -50%) scale(1.2); opacity: 0.9; }
    100% { transform: translate(-50%, -50%) scale(1); opacity: 0; }
}

/* Tablet/Desktop Video Confinement */
@media (min-width: 768px) {
    .reel-item {
        max-width: 450px;
        height: 90vh; /* Don't stretch to full vh to look like a phone */
        margin: var(--space-lg) auto;
        border-radius: var(--radius-lg);
        box-shadow: var(--shadow-soft);
    }
}
`;

const responsiveCss = `/* 
 * responsive.css – Adaptive Layouts Ensure Cross-Device Consistency
 */

/* --- TABLET --- */
@media (max-width: 1024px) {
    .sidebar { width: var(--sidebar-width-tablet); padding-left: var(--space-xs); padding-right: var(--space-xs); }
    .sidebar .logo { font-size: 20px; text-align: center; }
    .sidebar .nav-text { display: none; }
    .sidebar .nav-item { justify-content: center; padding: 12px; }
}

/* --- MOBILE --- */
@media (max-width: 768px) {
    .sidebar { display: none !important; }
    
    .mobile-nav { display: flex; }
    
    .main-content {
        /* Add padding on pages that scroll, but for feed it might overlap, 
           we need to make sure feed isn't constrained by padding */
    }
    
    body:not(.is-reels-page) .main-content {
        padding-bottom: calc(var(--bottom-nav-height) + env(safe-area-inset-bottom));
    }

    .reel-content {
        padding-bottom: calc(var(--space-lg) + var(--bottom-nav-height) + env(safe-area-inset-bottom));
    }
    .reel-actions {
        margin-bottom: calc(var(--bottom-nav-height) + env(safe-area-inset-bottom) - 20px);
    }

    .profile-container {
        padding-bottom: calc(var(--bottom-nav-height) + var(--space-lg));
    }
}
`;


fs.writeFileSync(path.join(dir, 'global.css'), globalCss);
fs.writeFileSync(path.join(dir, 'components.css'), componentsCss);
fs.writeFileSync(path.join(dir, 'feed.css'), feedCss);
fs.writeFileSync(path.join(dir, 'responsive.css'), responsiveCss);

console.log("CSS files updated successfully");
