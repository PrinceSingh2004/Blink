/**
 * profile.js – Blink Universe Pro v6.0
 * Features: View Other Profiles, Follow System, Dynamic Stats, Grid Interaction
 */

document.addEventListener('DOMContentLoaded', () => {
    const { getToken, requireAuth, showToast, API } = window.Blink;
    if (!requireAuth()) return;

    const urlParams = new URLSearchParams(window.location.search);
    const targetUserId = urlParams.get('id'); // null if self-profile
    const isSelf = !targetUserId;

    // ── 1. LOAD PROFILE DATA ──────────────────────────────────
    async function loadProfile() {
        try {
            const endpoint = isSelf ? `${API}/users` : `${API}/users/${targetUserId}`;
            console.log(`🔄 Syncing Profile Universe: ${endpoint}`);
            
            const res = await fetch(endpoint, {
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            const data = await res.json();

            if (data.success) {
                renderProfileData(data.data || data.user);
            } else {
                showToast("Universe inhabitant not found.", "error");
                if (!isSelf) setTimeout(() => window.location.href = 'index.html', 2000);
            }
        } catch (err) {
            console.error("Profile Load Error:", err);
            showToast("Failed to synchronize user universe.", "error");
        }
    }

    function renderProfileData(user) {
        if (!user) return;
        
        // Header Info
        document.getElementById('profileUsername').textContent = `@${user.username}`;
        document.getElementById('profileAvatarImg').src = user.profile_pic || 'https://via.placeholder.com/150';
        document.getElementById('profileBio').textContent = user.bio || 'Member of the Blink universe.';
        
        // Stats
        document.getElementById('postCount').textContent = formatCount(user.posts_count);
        document.getElementById('followerCount').textContent = formatCount(user.followers_count);
        document.getElementById('followingCount').textContent = formatCount(user.following_count);
        
        // Action Buttons
        const actionArea = document.getElementById('profileActionArea');
        if (isSelf) {
            actionArea.innerHTML = `<button class="btn btn-secondary btn-sm" id="editProfileBtn">Edit Profile</button>`;
            initEditProfile(user);
        } else {
            actionArea.innerHTML = `
                <button class="btn btn-primary btn-sm" id="followBtn" data-id="${user.id}">Follow</button>
                <button class="btn btn-secondary btn-sm">Message</button>
            `;
            initFollowLogic();
        }
    }

    // ── 2. FOLLOW SYSTEM ──────────────────────────────────────
    function initFollowLogic() {
        const followBtn = document.getElementById('followBtn');
        if (!followBtn) return;

        followBtn.onclick = async () => {
            const userId = followBtn.dataset.id;
            try {
                const res = await fetch(`${API}/social/follow`, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${getToken()}`
                    },
                    body: JSON.stringify({ userId })
                });
                const data = await res.json();
                if (data.success) {
                    followBtn.classList.toggle('btn-primary');
                    followBtn.classList.toggle('btn-secondary');
                    followBtn.textContent = followBtn.classList.contains('btn-primary') ? 'Follow' : 'Following';
                    showToast(data.message, "success");
                    loadProfile(); // Refresh stats
                }
            } catch (err) {
                showToast("Failed to pulsate social link.", "error");
            }
        };
    }

    // ── 3. LOAD VIDEOS GRID ───────────────────────────────────
    async function loadVideos() {
        try {
            // Updated to use standardized identity-based endpoint
            const res = await fetch(`${API}/posts/my`, {
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            const data = await res.json();

            if (data.success) {
                renderVideoGrid(data.posts || data.videos || []);
            }
        } catch (err) {
            console.error("Video Grid Error:", err);
        }
    }

    function renderVideoGrid(videos) {
        const grid = document.getElementById('videoGrid');
        if (!grid) return;

        if (videos.length === 0) {
            grid.innerHTML = `<div class="grid-placeholder"><p>The universe is quiet here.</p></div>`;
            return;
        }

        grid.innerHTML = videos.map(v => `
            <div class="grid-item zoom-in" onclick="window.location.href='index.html?v=${v.id}'">
                <video src="${v.video_url}" muted class="grid-video"></video>
                <div class="grid-overlay">
                    <span><i class="bi bi-play-fill"></i> ${formatCount(v.views_count)}</span>
                </div>
            </div>
        `).join('');
    }

    function formatCount(n) {
        n = parseInt(n) || 0;
        if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
        if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
        return String(n);
    }

    // ── 4. IDENTITY PULSE SYNC (Edit Profile) ──────────────────
    function initEditProfile(user) {
        const editBtn = document.getElementById('editProfileBtn');
        const modal = document.getElementById('editProfileModal');
        const form = document.getElementById('editProfileForm');

        if (!editBtn || !modal || !form) return;

        editBtn.onclick = () => {
            document.getElementById('editUsername').value = user.username;
            document.getElementById('editBio').value = user.bio || '';
            document.getElementById('editAvatar').value = user.profile_pic || '';
            modal.style.display = 'flex';
        };

        form.onsubmit = async (e) => {
            e.preventDefault();
            const username = document.getElementById('editUsername').value;
            const bio = document.getElementById('editBio').value;
            const profile_pic = document.getElementById('editAvatar').value;

            try {
                const res = await fetch(`${API}/users/update-profile`, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${getToken()}`
                    },
                    body: JSON.stringify({ username, bio, profile_pic })
                });
                const data = await res.json();
                if (data.success) {
                    showToast("Universe identity synchronized.", "success");
                    modal.style.display = 'none';
                    loadProfile(); // Refresh UI
                } else {
                    showToast(data.error || "Sync failure.", "error");
                }
            } catch (err) {
                showToast("Failed to pulse identity.", "error");
            }
        };

        // Close modal on outside click
        window.onclick = (e) => { if (e.target == modal) modal.style.display = 'none'; };
    }

    loadProfile();
    loadVideos();
});
