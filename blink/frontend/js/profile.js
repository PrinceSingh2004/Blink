/**
 * profile.js – Blink Profile Management v6.0
 * Responsive Grid Rendering, Identity Sync, Stats
 */

document.addEventListener('DOMContentLoaded', async () => {
    const { getToken, getUser, requireAuth, apiRequest, showToast } = window.Blink;
    if (!requireAuth()) return;

    const me = getUser();
    const urlParams = new URLSearchParams(window.location.search);
    const targetUserId = urlParams.get('id') || me.id;
    const isOwner = parseInt(targetUserId) === parseInt(me.id);

    const elements = {
        username:    document.getElementById('profileUsername'),
        bio:         document.getElementById('profileBio'),
        avatar:      document.getElementById('profileAvatarImg'),
        postCount:   document.getElementById('postCount'),
        followerCount: document.getElementById('followerCount'),
        followingCount: document.getElementById('followingCount'),
        videoGrid:   document.getElementById('videoGrid'),
        editBtn:     document.getElementById('editProfileBtn')
    };

    async function loadIdentity() {
        try {
            const data = await apiRequest(`/users/${targetUserId}`);
            if (data.data) {
                renderIdentity(data.data);
            }
        } catch (err) {
            console.error('[Profile] Identity fail:', err);
            showToast('Unable to synchronize profile universe.', 'error');
        }
    }

    function renderIdentity(u) {
        document.title = `Blink | @${u.username}`;
        if (elements.username) elements.username.textContent = u.display_name || u.username;
        if (elements.bio) elements.bio.textContent = u.bio || 'Share your story with the world.';
        
        // Update Stats
        elements.postCount.textContent = formatStat(u.posts_count || 0);
        elements.followerCount.textContent = formatStat(u.followers_count || 0);
        elements.followingCount.textContent = formatStat(u.followingCount || 0);

        const photo = u.profile_pic || u.avatar_url || u.profile_photo;
        if (photo && elements.avatar) {
            elements.avatar.src = photo;
        }
        
        if (!isOwner && elements.editBtn) {
            elements.editBtn.innerHTML = 'Follow Artist';
            elements.editBtn.className = 'btn btn-primary btn-sm';
            elements.editBtn.onclick = () => followUser(u.id);
        }
    }

    function formatStat(num) {
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
        return num.toString();
    }

    async function loadGrid() {
        elements.videoGrid.innerHTML = `
            <div style="grid-column: 1 / -1; min-height:300px;" class="flex-center flex-col gap-2">
                <div class="loader"></div>
                <p style="color:var(--text-muted); font-size:14px;">Syncing your vision universe...</p>
            </div>
        `;
        try {
            const data = await apiRequest(`/videos/user/${targetUserId}`);
            const items = data.videos || [];
            renderGrid(items);
        } catch (err) {
            console.error('[Profile] Grid load fail:', err);
            elements.videoGrid.innerHTML = `
                <div class="grid-placeholder">
                    <i class="bi bi-cloud-slash"></i>
                    <p>Connectivity failure with the vision universe.</p>
                </div>
            `;
        }
    }

    function renderGrid(videos) {
        if (!videos.length) {
            elements.videoGrid.innerHTML = `
                <div class="grid-placeholder">
                    <i class="bi bi-camera-reels"></i>
                    <p>No moments posted to this universe yet.</p>
                </div>
            `;
            return;
        }

        elements.videoGrid.className = 'profile-grid';
        elements.videoGrid.innerHTML = videos.map(v => `
            <div class="grid-item" onclick="window.location.href='index.html?v=${v.id}'">
                <video src="${v.url}" muted></video>
                <div class="flex-center" style="position:absolute; inset:0; opacity:0; hover:opacity:1; background:rgba(0,0,0,0.4); color:white; transition:all 0.2s;">
                    <i class="bi bi-play-fill" style="font-size:24px;"></i>
                </div>
            </div>
        `).join('');
    }

    const followUser = async (id) => {
        try {
            elements.editBtn.disabled = true;
            elements.editBtn.textContent = 'Processing...';
            const res = await apiRequest(`/users/follow/${id}`, { method: 'POST' });
            showToast(res.following ? 'Joined vision universe!' : 'Left vision universe.', 'info');
            loadIdentity();
        } catch (err) {
            showToast('Vision sync failure.', 'error');
        } finally {
            elements.editBtn.disabled = false;
        }
    };

    // Initial load
    await loadIdentity();
    await loadGrid();
});
