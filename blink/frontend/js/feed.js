/**
 * feed.js – Blink Reels Engine
 */

document.addEventListener('DOMContentLoaded', () => {
    const reelsContainer = document.getElementById('reelsContainer');
    if (!reelsContainer) return;

    let allVideosData = [];
    let currentPlaying = null;
    let globalMuted = true;

    // GLOBAL FETCH INTERCEPTOR
    const API = (url, options = {}) => {
        const token = localStorage.getItem("blink_token") || localStorage.getItem("token");
        const baseURL = window.BlinkConfig ? window.BlinkConfig.API_BASE : '';
        const fullUrl = url.startsWith('http') ? url : baseURL + url;

        return fetch(fullUrl, {
            ...options,
            headers: {
                "Content-Type": "application/json",
                "Authorization": token ? `Bearer ${token}` : "",
                ...options.headers,
            },
        });
    };

    // --- Video Observer ---
    const videoObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const reel = entry.target;
            const video = reel.querySelector('video');
            if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
                if (currentPlaying && currentPlaying !== video) {
                    currentPlaying.pause();
                }
                video.muted = globalMuted;
                video.play().catch(() => {});
                currentPlaying = video;
            } else {
                video.pause();
            }
        });
    }, { threshold: 0.6 });

    // --- Load Feed ---
    async function loadFeed() {
        if (reelsContainer) {
            reelsContainer.innerHTML = `
                <div class="video-loader flex-center" style="height: 100vh;">
                    <div class="spinner"></div>
                </div>
            `;
        }

        try {
            const res = await API('/api/videos');
            console.log("STATUS:", res.status);
            
            if (res.status === 401) {
                window.location.href = '/login.html';
                return;
            }

            if (!res.ok) throw new Error("API FAILED");
            
            const data = await res.json();
            console.log("DATA:", data);
            
            allVideosData = data;

            if (!data || data.length === 0) {
                if (reelsContainer) {
                    reelsContainer.innerHTML = `
                        <div class="empty-state" style="color:white;text-align:center;padding:50px;">
                            <h2>No videos available 📭</h2>
                            <p>Follow more users or upload your own!</p>
                        </div>
                    `;
                }
                return;
            }

            renderVideos(data);
        } catch (err) {
            console.error("FETCH ERROR:", err);
            
            const feedEl = document.querySelector(".feed") || document.getElementById('reelsContainer');
            if (feedEl) {
                feedEl.innerHTML = `
                  <div style="height: 100vh; display: flex; align-items: center; justify-content: center;">
                      <h2 style="color:white;text-align:center;">
                        Failed to load feed 🚫
                      </h2>
                  </div>
                `;
            }
        }
    }

    function renderVideos(videos) {
        reelsContainer.innerHTML = '';
        videos.forEach((v, index) => {
            const reel = document.createElement('div');
            reel.className = 'reel-item animate-up';
            reel.dataset.id = v.id;

            reel.innerHTML = `
                <video src="${v.video_url}" class="reel-video" loop playsinline muted></video>
                <div class="reel-overlay"></div>
                <div class="reel-content">
                    <div class="reel-info">
                        <div class="reel-user" onclick="window.location.href='profile.html?id=${v.user_id}'">
                            <img src="${v.profile_pic || 'https://via.placeholder.com/150'}" class="avatar">
                            <span class="username">${v.username}</span>
                        </div>
                        <p class="reel-caption">${v.caption || ''}</p>
                    </div>
                    <div class="reel-actions">
                        <div class="action-btn" onclick="toggleLike(${v.id}, this)">
                            <i class="bi ${v.is_liked ? 'bi-heart-fill liked' : 'bi-heart'}"></i>
                            <span class="count">${v.likes_count || 0}</span>
                        </div>
                        <div class="action-btn" onclick="openComments(${v.id})">
                            <i class="bi bi-chat"></i>
                            <span class="count">${v.comments_count || 0}</span>
                        </div>
                        <div class="action-btn" onclick="shareVideo(${v.id})">
                            <i class="bi bi-send"></i>
                        </div>
                    </div>
                </div>
                <div class="video-loader flex-center" style="position:absolute; inset:0; z-index:0;">
                    <div class="spinner"></div>
                </div>
            `;

            // Interaction: Tap to pause/play & Double tap to like
            let lastTap = 0;
            reel.onclick = (e) => {
                const now = Date.now();
                const video = reel.querySelector('video');
                if (now - lastTap < 300) {
                    // Double tap logic
                    handleDoubleTap(reel, v.id);
                } else {
                    // Single tap logic
                    if (video.paused) video.play();
                    else video.pause();
                }
                lastTap = now;
            };

            reelsContainer.appendChild(reel);
            videoObserver.observe(reel);
        });
    }

    function handleDoubleTap(reel, videoId) {
        const heart = document.createElement('i');
        heart.className = 'bi bi-heart-fill double-tap-heart';
        reel.appendChild(heart);
        setTimeout(() => heart.remove(), 800);
        
        const likeBtn = reel.querySelector('.bi-heart, .bi-heart-fill');
        if (!likeBtn.classList.contains('bi-heart-fill')) {
            toggleLike(videoId, likeBtn.parentElement);
        }
    }

    window.toggleLike = async (videoId, el) => {
        const icon = el.querySelector('i');
        const count = el.querySelector('.count');
        
        const isLiked = icon.classList.contains('bi-heart-fill');
        
        // Optimistic UI
        icon.classList.toggle('bi-heart-fill');
        icon.classList.toggle('bi-heart');
        icon.classList.toggle('liked');
        count.innerText = parseInt(count.innerText) + (isLiked ? -1 : 1);

        try {
            await API('/api/like', {
                method: 'POST',
                body: JSON.stringify({ video_id: videoId, user_id: window.BlinkConfig?.getUser()?.id || 1 })
            });
        } catch (err) {
            console.error("Like error:", err);
        }
    };

    window.openComments = async (videoId) => {
        // Simple comment logic for now
        window.showToast("Comments functionality coming soon!");
    };

    window.shareVideo = (videoId) => {
        const url = `${window.location.origin}/index.html?v=${videoId}`;
        navigator.clipboard.writeText(url);
        window.showToast("Link copied to clipboard!");
    };

    loadFeed();
});
