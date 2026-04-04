/**
 * feed.js – Blink Reels Engine v8.0
 * Performance-optimized video handling with Intersection Observer
 */
document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById("reelsContainer") || document.getElementById("feed");
    if (!container) return;

    let page = 1;
    let loading = false;
    let hasMore = true;
    let currentPlayingVideo = null;
    let globalMuted = true; // Default muted like Instagram/TikTok

    // --- Intersection Observer for Smart Autoplay ---
    const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            const video = entry.target;
            if (entry.isIntersecting) {
                // Only autoplay if it's the most visible one
                if (entry.intersectionRatio > 0.7) {
                    playVideo(video);
                }
            } else {
                video.pause();
                if (currentPlayingVideo === video) currentPlayingVideo = null;
            }
        });
    }, { threshold: [0.7] });

    // --- Video Core Actions ---
    async function playVideo(video) {
        // Pause current video if different
        if (currentPlayingVideo && currentPlayingVideo !== video) {
            currentPlayingVideo.pause();
            const overlay = currentPlayingVideo.parentElement.querySelector('.video-status-icon');
            if (overlay) overlay.classList.remove('active');
        }

        try {
            video.muted = globalMuted;
            await video.play();
            currentPlayingVideo = video;
            
            // Sync UI muted state
            updateMuteIcons();
        } catch (err) {
            console.warn("Autoplay interaction required", err);
        }
    }

    function updateMuteIcons() {
        const icons = document.querySelectorAll('.reel-mute-btn i');
        icons.forEach(i => {
            i.className = globalMuted ? 'bi bi-volume-mute-fill' : 'bi bi-volume-up-fill';
        });
    }

    // --- Data Fetching ---
    async function loadVideos(isInitial = true) {
        if (loading || (!hasMore && !isInitial)) return;
        loading = true;

        if (isInitial) {
            container.innerHTML = '';
            showSkeletons();
        }

        try {
            // Using consolidated window.api wrapper
            const data = await window.api.request(`/videos/feed?page=${page}&limit=10`);
            const videos = data.videos || [];
            
            removeSkeletons();

            if (videos.length === 0) {
                if (isInitial) renderEmptyState();
                hasMore = false;
                return;
            }

            renderVideos(videos);
            if (videos.length < 10) hasMore = false;

        } catch (err) {
            console.error("Feed Error:", err);
            removeSkeletons();
            if (isInitial) renderErrorState();
        } finally {
            loading = false;
        }
    }

    function renderVideos(videos) {
        videos.forEach(video => {
            const reel = document.createElement("div");
            reel.className = "reel-item animate-fade";
            reel.dataset.id = video.id;

            reel.innerHTML = `
                <video 
                    src="${video.video_url}" 
                    class="reel-video"
                    loop 
                    playsinline
                    preload="metadata">
                </video>
                
                <div class="reel-overlay" onclick="window.feed.handleVideoToggle(this)">
                    <div class="video-status-icon">
                        <i class="bi bi-play-fill"></i>
                    </div>
                </div>

                <div class="reel-mute-btn" onclick="window.feed.toggleGlobalMute(event)">
                    <i class="bi ${globalMuted ? 'bi-volume-mute-fill' : 'bi-volume-up-fill'}"></i>
                </div>

                <div class="reel-content">
                    <div class="reel-info">
                        <div class="reel-user" onclick="window.app.navigateTo('profile', {id: ${video.user_id}})">
                            <img src="${video.profile_pic || 'https://via.placeholder.com/150'}" class="avatar">
                            <span class="username">${video.username}</span>
                        </div>
                        <p class="reel-caption">${video.caption || ""}</p>
                    </div>
                </div>

                <div class="reel-actions">
                    <div class="action-btn ${video.liked_by_me ? 'liked' : ''}" onclick="window.feed.handleLike(${video.id}, this)">
                        <i class="bi ${video.liked_by_me ? 'bi-heart-fill' : 'bi-heart'}"></i>
                        <span class="count">${video.likes_count || 0}</span>
                    </div>
                    <div class="action-btn">
                        <i class="bi bi-chat-text"></i>
                        <span class="count">${video.comments_count || 0}</span>
                    </div>
                    <div class="action-btn">
                        <i class="bi bi-share"></i>
                    </div>
                </div>
            `;

            container.appendChild(reel);
            const videoEl = reel.querySelector("video");
            observer.observe(videoEl);
        });
    }

    // --- Global Exposed Handlers ---
    window.feed = {
        handleVideoToggle: (overlay) => {
            const video = overlay.parentElement.querySelector('video');
            const icon = overlay.querySelector('.video-status-icon');
            
            if (video.paused) {
                video.play();
                icon.classList.remove('active');
            } else {
                video.pause();
                icon.classList.add('active');
            }
        },

        toggleGlobalMute: (event) => {
            event.stopPropagation();
            globalMuted = !globalMuted;
            
            document.querySelectorAll('video').forEach(v => {
                v.muted = globalMuted;
            });
            
            updateMuteIcons();
        },

        handleLike: async (videoId, el) => {
            const icon = el.querySelector('i');
            const countEl = el.querySelector('.count');
            const isLiked = el.classList.toggle('liked');
            
            icon.className = isLiked ? 'bi bi-heart-fill' : 'bi bi-heart';
            let count = parseInt(countEl.textContent);
            countEl.textContent = isLiked ? count + 1 : Math.max(0, count - 1);

            try {
                // Optimistic UI, but sync with server
                await window.api.request(`/videos/${videoId}/like`, { 
                    method: isLiked ? 'POST' : 'DELETE' 
                });
            } catch (err) {
                console.error("Like failed", err);
            }
        }
    };

    // --- Infinite Scroll ---
    container.addEventListener('scroll', () => {
        if (container.scrollTop + container.clientHeight >= container.scrollHeight - 500) {
            if (!loading && hasMore) {
                page++;
                loadVideos(false);
            }
        }
    });

    // --- UI State Helpers ---
    function showSkeletons() { /* Implementation same as before */ }
    function removeSkeletons() { /* Implementation same as before */ }
    function renderEmptyState() {
        container.innerHTML = `
            <div class="empty-state">
                <i class="bi bi-camera-video"></i>
                <h2>Fresh feed coming soon</h2>
                <p>Follow more users to see their reels here.</p>
            </div>
        `;
    }

    function renderErrorState() {
        container.innerHTML = `
            <div class="empty-state">
                <i class="bi bi-exclamation-triangle"></i>
                <h2>Connection unstable</h2>
                <p>Failed to sync with the Blink universe. Try again.</p>
                <button class="btn btn-primary" onclick="location.reload()">Refresh</button>
            </div>
        `;
    }

    // Initialize
    loadVideos(true);
});

function showSkeletons() {
    const container = document.getElementById("reelsContainer") || document.getElementById("feed");
    for(let i=0; i<3; i++) {
        const s = document.createElement('div');
        s.className = 'reel-item skeleton-card';
        s.innerHTML = `<div class="skeleton-video"></div>`;
        container.appendChild(s);
    }
}

function removeSkeletons() {
    const skeletons = document.querySelectorAll('.skeleton-card');
    skeletons.forEach(s => s.remove());
}
