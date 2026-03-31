/**
 * profile.js – Blink Universe Fix v6.0
 * Fixes Error 1 (Profile Data) and Error 2 (Posts/Blinks Grid)
 */

// ── CONSTANTS ───────────────────────────────────────────
const API_BASE = window.location.origin; // auto-detects
// e.g. https://blink-yzoo.onrender.com

// ── GET TOKEN HELPER ────────────────────────────────────
function getToken() {
  // Try multiple storage locations
  return localStorage.getItem('blink_token')
    || localStorage.getItem('token')
    || localStorage.getItem('authToken')
    || localStorage.getItem('jwt')
    || sessionStorage.getItem('token')
    || null;
}

// ── AUTH HEADERS HELPER ─────────────────────────────────
function authHeaders() {
  const token = getToken();
  return {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    ...(token ? { 'Authorization': 'Bearer ' + token } : {})
  };
}

// ── FETCH WITH TIMEOUT ──────────────────────────────────
async function fetchWithTimeout(url, options = {}, ms = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

// ── LOAD PROFILE (FIX ERROR 1) ──────────────────────────
async function loadProfile() {
  const token = getToken();

  // If no token — redirect to login immediately
  if (!token) {
    console.warn('No token found — redirecting to login');
    window.location.href = 'login.html';
    return;
  }

  try {
    // Show skeleton loading state
    showProfileSkeleton();

    // Try multiple possible API endpoints
    const endpoints = [
      `${API_BASE}/api/users/me`,
      `${API_BASE}/api/users/profile`,
      `${API_BASE}/api/auth/me`
    ];

    let data = null;
    let lastError = null;

    for (const endpoint of endpoints) {
      try {
        console.log('🔄 Attempting sync with profile universe:', endpoint);
        const res = await fetchWithTimeout(endpoint, {
          method: 'GET',
          headers: authHeaders()
        }, 12000);

        if (res.status === 401) {
          // Token invalid or expired
          localStorage.removeItem('blink_token');
          window.location.href = 'login.html';
          return;
        }

        if (res.ok) {
          const json = await res.json();
          data = json.data || json.user || json;
          console.log('✅ Profile loaded from:', endpoint);
          break;
        } else {
            console.warn(`⚠️ Endpoint ${endpoint} returned status ${res.status}`);
        }
      } catch (err) {
        lastError = err;
        console.warn(`⛔ Endpoint ${endpoint} failed:`, err.message);
        continue; // try next endpoint
      }
    }

    if (!data) {
      throw new Error(lastError?.message || 'All endpoints failed synchronization');
    }

    // Render profile with data
    renderProfile(data);
    hideProfileSkeleton();

  } catch (err) {
    console.error('Profile load failed:', err.message);
    hideProfileSkeleton();
    showProfileError(err.message);
  }
}

// ── RENDER PROFILE ──────────────────────────────────────
function renderProfile(user) {
  if (!user) return;

  // Avatar
  const avatarEl = document.querySelector(
    '#profileAvatarImg, .profile-avatar, [data-profile-pic]'
  );
  if (avatarEl) {
    avatarEl.src = user.profile_pic
      || user.avatar
      || user.avatar_url
      || 'https://via.placeholder.com/150';
    avatarEl.onerror = () => {
      avatarEl.src = 'https://via.placeholder.com/150';
    };
  }

  // Username
  setEl('#profileUsername, .profile-username, [data-username]',
    '@' + (user.username || 'unknown'));

  // Bio
  setEl('#profileBio, .profile-bio, [data-bio]',
    user.bio || 'Experience the universe through Blink.');

  // Stats
  setEl('#postCount, [data-blinks]',
    formatCount(user.posts_count || user.blinks_count || 0));
  setEl('#followerCount, [data-followers]',
    formatCount(user.followers_count || 0));
  setEl('#followingCount, [data-following]',
    formatCount(user.following_count || 0));

  // Update page title
  document.title = `@${user.username} | Blink`;
}

// ── HELPER: SET ELEMENT TEXT ────────────────────────────
function setEl(selector, value) {
  const els = document.querySelectorAll(selector);
  els.forEach(el => { el.textContent = value; });
}

// ── LOAD BLINKS/POSTS (FIX ERROR 2) ────────────────────
async function loadMyBlinks() {
  const token = getToken();
  if (!token) return;

  try {
    showBlinksLoading();

    const endpoints = [
      `${API_BASE}/api/posts/my`,
      `${API_BASE}/api/posts/user/me`,
      `${API_BASE}/api/videos/user/${getUserID()}`
    ];

    let blinks = null;
    for (const endpoint of endpoints) {
      try {
        console.log('🔄 Syncing blinks grid:', endpoint);
        const res = await fetchWithTimeout(endpoint, {
          method: 'GET',
          headers: authHeaders()
        }, 12000);

        if (res.ok) {
          const json = await res.json();
          // Handle all possible response shapes
          blinks = json.posts
            || json.blinks
            || json.data
            || json.videos
            || json
            || [];
          console.log('✅ Blinks loaded from:', endpoint,
            '→', blinks.length, 'items');
          break;
        }
      } catch { continue; }
    }

    hideBlinksLoading();

    if (!blinks || blinks.length === 0) {
      // Empty is NOT an error — show empty state
      showEmptyBlinks();
      return;
    }

    renderBlinks(blinks);

  } catch (err) {
    console.error('Blinks load failed:', err.message);
    hideBlinksLoading();
    showBlinksError(err.message);
  }
}

function getUserID() {
    try {
        const user = JSON.parse(localStorage.getItem('blink_user'));
        return user?.id || '';
    } catch(e) { return ''; }
}

// ── RENDER BLINKS GRID ──────────────────────────────────
function renderBlinks(blinks) {
  const grid = document.querySelector(
    '#videoGrid, .blinks-grid, .posts-grid, [data-blinks-grid]'
  );
  if (!grid) return;

  grid.innerHTML = blinks.map(blink => `
    <div class="grid-item zoom-in" 
         onclick="window.location.href='index.html?v=${blink.id || blink._id}'">
      ${blink.video_url || blink.thumbnail_url
        ? `<video src="${blink.video_url || blink.url}"
               class="grid-video"
               loading="lazy"
               muted
               onmouseover="this.play()"
               onmouseout="this.pause()"
               ></video>`
        : `<div class="grid-placeholder"><i class="bi bi-play-circle"></i></div>`
      }
      <div class="grid-overlay">
        <span><i class="bi bi-play-fill"></i> ${formatCount(blink.views || 0)}</span>
      </div>
    </div>
  `).join('');
}

// ── EMPTY STATE (not an error) ──────────────────────────
function showEmptyBlinks() {
  const container = document.querySelector(
    '#videoGrid, .blinks-grid, .posts-grid'
  );
  if (container) {
    container.innerHTML = `
      <div class="grid-placeholder" style="grid-column: 1 / -1; height: 300px; opacity: 0.6;">
        <i class="bi bi-camera-reels" style="font-size: 48px;"></i>
        <h3>No Blinks Yet</h3>
        <p>Your creative universe is waiting for its first spark.</p>
        <a href="upload.html" class="btn btn-primary btn-sm" style="margin-top: 16px;">
          Create Momentum
        </a>
      </div>
    `;
  }
}

// ── ERROR DISPLAYS ──────────────────────────────────────
function showProfileError(message) {
  const container = document.getElementById('profileHeader');
  if (container) {
     container.innerHTML = `
        <div class="profile-error animate-fade">
            <i class="bi bi-exclamation-triangle-fill"></i>
            <h3>Synchronization failure</h3>
            <p>${message}</p>
            <button class="btn btn-secondary btn-sm" onclick="location.reload()">Re-establish Link</button>
        </div>
     `;
  }
}

function showBlinksError(message) {
  const grid = document.querySelector('#videoGrid');
  if (grid) {
    grid.innerHTML = `
      <div class="connectivity-error animate-fade" style="grid-column: 1 / -1; text-align: center; padding: 60px;">
        <i class="bi bi-cloud-slash" style="font-size: 48px; color: var(--text-muted);"></i>
        <p>Connectivity failure with the vision universe.</p>
        <button class="btn btn-secondary btn-sm" onclick="loadMyBlinks()">Try Again</button>
      </div>
    `;
  }
}

// ── SKELETON / LOADING HELPERS ──────────────────────────
function showProfileSkeleton() {
  const avatar = document.querySelector('#profileAvatarImg');
  if (avatar) avatar.classList.add('skeleton-shimmer');
}

function hideProfileSkeleton() {
  const avatar = document.querySelector('#profileAvatarImg');
  if (avatar) avatar.classList.remove('skeleton-shimmer');
}

function showBlinksLoading() {
  const grid = document.querySelector('#videoGrid');
  if (grid && !grid.querySelector('.skeleton-grid')) {
    grid.innerHTML = '<div class="loader" style="grid-column: 1 / -1; margin: 40px auto;"></div>';
  }
}

function hideBlinksLoading() {}

// ── FORMAT HELPERS ──────────────────────────────────────
function formatCount(n) {
  n = parseInt(n) || 0;
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000)    return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

// ── INIT ON PAGE LOAD ───────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadProfile();
  loadMyBlinks();
});

// Retry when tab becomes visible (handles Render cold start)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    if (document.querySelector('.profile-error')) loadProfile();
  }
});
