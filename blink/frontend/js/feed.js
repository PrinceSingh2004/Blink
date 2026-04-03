/**
 * feed.js – Blink Reels Engine (Production Ready)
 */

document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById("reelsContainer");
    if (!container) return;

    let page = 1;
    let loading = false;
    let hasMore = true;

    // --- Intersection Observer for Autoplay (STABLE) ---
    const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            const video = entry.target;
            if (entry.isIntersecting) {
                console.log("▶️ Playing video:", video.src);
                video.play().catch(err => console.log("Autoplay blocked:", err));
            } else {
                video.pause();
            }
        });
    }, { threshold: 0.7 });

    // --- Load Videos ---
    async function loadVideos(isInitial = true) {
        if (loading || (!hasMore && !isInitial)) return;
        loading = true;

        console.log(`🎬 Loading videos (Page: ${page})...`);

        try {
            // Use the global API wrapper
            const res = await window.API(`/api/videos?page=${page}`);
            const videos = await res.json();
            
            console.log("✅ VIDEOS RECEIVED:", videos);

            if (isInitial) container.innerHTML = "";

            if (!videos || videos.length === 0) {
                if (isInitial) {
                    container.innerHTML = "<div class='empty-state'><h2>No videos yet 📭</h2><p>Be the first to upload!</p></div>";
                }
                hasMore = false;
                return;
            }

            renderVideos(videos);
            
            // If we got fewer than 10 videos, assume no more pages (simple logic)
            if (videos.length < 10) hasMore = false;

        } catch (err) {
            console.error("❌ FEED ERROR:", err);
            if (isInitial) {
                container.innerHTML = "<div class='error-state'><h2>Failed to load feed 🚫</h2><p>Check your connection or login again.</p></div>";
            }
        } finally {
            loading = false;
        }
    }

    // --- Render Videos (User's Requested Structure) ---
    function renderVideos(videos) {
        videos.forEach(video => {
            const div = document.createElement("div");
            div.className = "reel-item video-card animate-up"; // Keep reel-item for CSS, add video-card per request
            div.dataset.id = video.id;

            div.innerHTML = `
                <video 
                    src="${video.video_url}" 
                    class="reel-video"
                    loop 
                    muted 
                    autoplay 
                    playsinline
                    style="width:100%; height:100%; object-fit:cover;">
                </video>
                <div class="reel-overlay"></div>
                <div class="reel-content">
                    <div class="reel-info">
                        <div class="reel-user" onclick="window.location.href='profile.html?id=${video.user_id}'">
                            <img src="${video.profile_pic || 'https://via.placeholder.com/150'}" class="avatar">
                            <span class="username">${video.username}</span>
                        </div>
                        <p class="reel-caption">${video.caption || ""}</p>
                    </div>
                    <div class="reel-actions">
                        <div class="action-btn" onclick="handleLike(${video.id}, this)">
                            <i class="bi bi-heart"></i>
                            <span class="count">${video.likes_count || 0}</span>
                        </div>
                        <div class="action-btn">
                            <i class="bi bi-chat"></i>
                            <span class="count">0</span>
                        </div>
                    </div>
                </div>
            `;

            container.appendChild(div);
            
            // Observe the video element for autoplay
            const videoEl = div.querySelector("video");
            observer.observe(videoEl);
        });
    }

    // --- Infinite Scroll (Basic) ---
    container.addEventListener("scroll", () => {
        if (container.innerHeight + container.scrollTop >= container.scrollHeight - 200) {
            if (!loading && hasMore) {
                page++;
                loadVideos(false);
            }
        }
    });

    // Also support window scroll if layout changes
    window.addEventListener("scroll", () => {
        if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 200) {
            if (!loading && hasMore) {
                page++;
                loadVideos(false);
            }
        }
    });

    // Handle Like
    window.handleLike = async (videoId, el) => {
        const icon = el.querySelector('i');
        const count = el.querySelector('.count');
        
        icon.classList.toggle('bi-heart-fill');
        icon.classList.toggle('bi-heart');
        icon.classList.toggle('liked');
        
        try {
            await window.API('/api/like', {
                method: 'POST',
                body: JSON.stringify({ video_id: videoId })
            });
        } catch (err) {
            console.error("Like error:", err);
        }
    };

    // Initial Load
    loadVideos();
});
