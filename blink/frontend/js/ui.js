/* 
 * ui.js – Blink Platform UI Interactions v5.0
 * Handles Navbar states, smooth scrolling, and mobile toggles.
 */

document.addEventListener('DOMContentLoaded', () => {
    initNavbar();
    initScrollDynamics();
    initToasts();
});

/**
 * Syncs active states for both Side & Bottom navbars
 */
function initNavbar() {
    const currentPath = window.location.pathname;
    const pageName = currentPath.split('/').pop() || 'index.html';
    
    // Select all nav links
    const allLinks = document.querySelectorAll('.nav-link, .bottom-link');
    
    allLinks.forEach(link => {
        const href = link.getAttribute('href');
        if (href === pageName) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
        
        // Add click animation
        link.addEventListener('click', () => {
            allLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
        });
    });
}

/**
 * Handles smooth layout transitions on scroll
 */
function initScrollDynamics() {
    let lastScroll = 0;
    const bottomNav = document.querySelector('.bottom-nav');
    
    if (!bottomNav) return;

    window.addEventListener('scroll', () => {
        const currentScroll = window.pageYOffset;
        
        if (currentScroll <= 0) {
            bottomNav.style.transform = 'translateY(0)';
            return;
        }
        
        if (currentScroll > lastScroll && currentScroll > 100) {
            // Scrolling down - hide bottom nav for focus (optional/Instagram style)
            // bottomNav.style.transform = 'translateY(100%)';
        } else {
            // Scrolling up - show bottom nav
            bottomNav.style.transform = 'translateY(0)';
        }
        lastScroll = currentScroll;
    }, { passive: true });
}

/**
 * Global Toast System Replacement
 */
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
    
    // Trigger animation
    setTimeout(() => toast.classList.add('show'), 10);
    
    // Remove after 3s
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400);
    }, 3000);
};

// Expose to window for legacy support
window.showToast = window.showBlinkToast;
