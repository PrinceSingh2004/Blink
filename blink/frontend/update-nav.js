const fs = require('fs');
const path = require('path');

const htmlFiles = ['index.html', 'profile.html', 'upload.html', 'live.html', 'messages.html', 'watch.html', 'login.html', 'register.html'];
const dir = 'c:/Users/ps126/OneDrive/Desktop/Project/Infinite_Scroll/blink/frontend';

const sidebarHtml = `        <!-- Sidebar (Desktop) -->
        <aside class="sidebar">
            <div class="logo text-gradient flex-center py-4">Blink</div>
            <nav class="nav-links flex-col flex-1">
                <a href="index.html" class="nav-item" data-page="index">
                    <i class="bi bi-house-door-fill"></i>
                    <span class="nav-text">Home</span>
                </a>
                <div class="nav-item" id="searchTrigger">
                    <i class="bi bi-search"></i>
                    <span class="nav-text">Search</span>
                </div>
                <a href="upload.html" class="nav-item" data-page="upload">
                    <i class="bi bi-plus-square"></i>
                    <span class="nav-text">Create</span>
                </a>
                <a href="live.html" class="nav-item" data-page="live">
                    <i class="bi bi-broadcast"></i>
                    <span class="nav-text">Live</span>
                </a>
                <a href="messages.html" class="nav-item" data-page="messages">
                    <i class="bi bi-chat-dots-fill"></i>
                    <span class="nav-text">Messages</span>
                </a>
                <a href="profile.html" class="nav-item" data-page="profile">
                    <i class="bi bi-person-circle"></i>
                    <span class="nav-text">Profile</span>
                </a>
            </nav>
            <div class="sidebar-footer">
                <button id="logoutBtn" class="nav-item w-full">
                    <i class="bi bi-box-arrow-right"></i>
                    <span class="nav-text">Logout</span>
                </button>
            </div>
        </aside>`;

const mobileNavHtml = `        <!-- Mobile Nav -->
        <nav class="mobile-nav">
            <a href="index.html" class="nav-item" data-page="index">
                <i class="bi bi-house-door-fill"></i>
                <span>Home</span>
            </a>
            <div class="nav-item" id="mobileSearchBtn">
                <i class="bi bi-search"></i>
                <span>Search</span>
            </div>
            <a href="upload.html" class="nav-item" data-page="upload">
                <i class="bi bi-plus-square"></i>
                <span>Create</span>
            </a>
            <a href="live.html" class="nav-item" data-page="live">
                <i class="bi bi-broadcast"></i>
                <span>Live</span>
            </a>
            <a href="messages.html" class="nav-item" data-page="messages">
                <i class="bi bi-chat-dots-fill"></i>
                <span>Messages</span>
            </a>
            <a href="profile.html" class="nav-item" data-page="profile">
                <i class="bi bi-person-circle"></i>
                <span>Profile</span>
            </a>
        </nav>`;

const searchOverlayHtml = `    <!-- Search Overlay -->
    <div id="searchOverlay" class="modal-overlay hidden">
        <div class="search-modal animate-up">
            <div class="search-header flex-between">
                <h2>Search</h2>
                <button id="closeSearch" class="btn-circle btn-ghost"><i class="bi bi-x-lg"></i></button>
            </div>
            <div class="search-bar">
                <i class="bi bi-search"></i>
                <input type="text" id="searchInput" placeholder="Search users or videos..." autocomplete="off">
            </div>
            <div id="searchResults" class="search-results-list"></div>
        </div>
    </div>`;

for (const file of htmlFiles) {
    const filePath = path.join(dir, file);
    if (!fs.existsSync(filePath)) continue;
    
    let content = fs.readFileSync(filePath, 'utf8');

    // Make sure we skip login/register for navbars if they don't have them
    if (file === 'login.html' || file === 'register.html') {
        continue;
    }

    // Replace Sidebar
    content = content.replace(/<!--\s*Sidebar \(Desktop\)\s*-->[\s\S]*?<\/aside>/i, sidebarHtml);
    
    // Replace Mobile Nav
    if (content.match(/<!--\s*Mobile Nav\s*-->/i)) {
        content = content.replace(/<!--\s*Mobile Nav\s*-->[\s\S]*?<\/nav>/i, mobileNavHtml);
    } else {
        content = content.replace(/(<\/div>\s*)(<!--\s*Search Overlay|<!--\s*Edit|<!--\s*Toast|<script)/i, mobileNavHtml + '\n    $1$2');
    }

    // Replace or Inject Search Overlay
    if (content.match(/<!--\s*Search Overlay\s*-->/i)) {
       content = content.replace(/<!--\s*Search Overlay\s*-->[\s\S]*?<\/div>\s*<\/div>\s*(<!--\s*Toast)/i, searchOverlayHtml + '\n\n    $1');
       content = content.replace(/<!--\s*Search Overlay\s*-->[\s\S]*?<\/div>\s*<\/div>\s*(<div id="toastContainer)/i, searchOverlayHtml + '\n\n    $1');
    }

    fs.writeFileSync(filePath, content);
}
console.log("Updated HTML files");
