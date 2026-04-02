/**
 * profile.js – Blink Profile Management
 */

document.addEventListener('DOMContentLoaded', () => {
    initProfile();
});

async function initProfile() {
    const urlParams = new URLSearchParams(window.location.search);
    const targetUserId = urlParams.get('id');
    const isSelf = !targetUserId;

    await loadProfileData(targetUserId, isSelf);
    await loadUserPosts(targetUserId, isSelf);
    initEditModal();
}

async function loadProfileData(userId, isSelf) {
    try {
        const endpoint = isSelf ? '/users/me' : `/users/${userId}`;
        const res = await window.BlinkConfig.fetch(endpoint);
        const data = await res.json();

        if (data.success) {
            renderProfile(data.user, isSelf);
        }
    } catch (err) {
        console.error("Profile load error:", err);
    }
}

function renderProfile(user, isSelf) {
    document.getElementById('profileUsername').innerText = user.username;
    document.getElementById('profileAvatarImg').src = user.profile_pic || 'https://via.placeholder.com/150';
    document.getElementById('profileBio').innerText = user.bio || 'Experience the universe through Blink.';
    
    document.getElementById('postCount').innerText = user.posts_count || 0;
    document.getElementById('followerCount').innerText = user.followers_count || 0;
    document.getElementById('followingCount').innerText = user.following_count || 0;

    const editBtn = document.getElementById('editProfileBtn');
    if (!isSelf && editBtn) {
        editBtn.innerText = user.is_following ? 'Following' : 'Follow';
        editBtn.className = user.is_following ? 'btn btn-secondary' : 'btn btn-primary';
        editBtn.onclick = () => toggleFollow(user.id, editBtn);
    }
}

async function loadUserPosts(userId, isSelf) {
    try {
        const endpoint = isSelf ? '/posts/my' : `/posts/user/${userId}`;
        const res = await window.BlinkConfig.fetch(endpoint);
        const data = await res.json();

        if (data.success) {
            renderGrid(data.posts);
        }
    } catch (err) {
        console.error("Posts load error:", err);
    }
}

function renderGrid(posts) {
    const grid = document.getElementById('videoGrid');
    if (!posts || posts.length === 0) {
        grid.innerHTML = '<div class="flex-center w-full p-8 text-secondary">No posts yet</div>';
        return;
    }

    grid.innerHTML = posts.map(post => `
        <div class="grid-item" onclick="window.location.href='index.html?v=${post.id}'">
            <video src="${post.video_url}#t=0.1" muted></video>
            <div class="grid-item-overlay">
                <span><i class="bi bi-heart-fill"></i> ${post.likes_count || 0}</span>
                <span><i class="bi bi-chat-fill"></i> ${post.comments_count || 0}</span>
            </div>
        </div>
    `).join('');
}

function initEditModal() {
    const modal = document.getElementById('editProfileModal');
    const openBtn = document.getElementById('editProfileBtn');
    const closeBtn = document.getElementById('closeEditModal');
    const form = document.getElementById('editProfileForm');

    if (!modal || !openBtn) return;

    // Only enable modal if it's the user's own profile (checked in renderProfile)
    openBtn.addEventListener('click', () => {
        if (openBtn.innerText === 'Edit Profile') {
            modal.classList.remove('hidden');
            // Pre-fill
            document.getElementById('editUsername').value = document.getElementById('profileUsername').innerText;
            document.getElementById('editBio').value = document.getElementById('profileBio').innerText;
            document.getElementById('editAvatar').value = document.getElementById('profileAvatarImg').src;
        }
    });

    closeBtn.onclick = () => modal.classList.add('hidden');
    
    form.onsubmit = async (e) => {
        e.preventDefault();
        const username = document.getElementById('editUsername').value;
        const bio = document.getElementById('editBio').value;
        const profile_pic = document.getElementById('editAvatar').value;

        try {
            const res = await window.BlinkConfig.fetch('/users/update', {
                method: 'POST',
                body: JSON.stringify({ username, bio, profile_pic })
            });
            const data = await res.json();
            if (data.success) {
                window.showToast("Profile Updated!");
                modal.classList.add('hidden');
                // Instant UI update
                document.getElementById('profileUsername').innerText = username;
                document.getElementById('profileBio').innerText = bio;
                document.getElementById('profileAvatarImg').src = profile_pic;
            }
        } catch (err) {
            window.showToast("Update failed", "error");
        }
    };
}

async function toggleFollow(userId, btn) {
    try {
        const res = await window.BlinkConfig.fetch('/social/follow', {
            method: 'POST',
            body: JSON.stringify({ target_id: userId })
        });
        const data = await res.json();
        if (data.success) {
            btn.innerText = data.is_following ? 'Following' : 'Follow';
            btn.className = data.is_following ? 'btn btn-secondary' : 'btn btn-primary';
            // Update follower count (simplified)
            const countEl = document.getElementById('followerCount');
            countEl.innerText = parseInt(countEl.innerText) + (data.is_following ? 1 : -1);
        }
    } catch (err) {
        console.error("Follow error:", err);
    }
}
