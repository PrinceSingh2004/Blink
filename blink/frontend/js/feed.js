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

    // --- Skeleton Loader ---
    function showSkeletons() {
        if (!container) return;
        const skeletonCount = 3;
        for (let i = 0; i < skeletonCount; i++) {
            const div = document.createElement("div");
            div.className = "reel-item skeleton-card";
            div.innerHTML = `
                <div class="skeleton-video"></div>
                <div class="skeleton-info">
                    <div class="skeleton-avatar"></div>
                    <div class="skeleton-text"></div>
                </div>
            `;
            container.appendChild(div);
        }
    }

    function removeSkeletons() {
        const skeletons = container.querySelectorAll(".skeleton-card");
        skeletons.forEach(s => s.remove());
    }

    // --- Load Videos ---
    async function loadVideos(isInitial = true) {
        if (loading || (!hasMore && !isInitial)) return;
        loading = true;

        console.log(`🎬 [PRODUCTION FEED] Loading Page ${page}...`);
        if (!isInitial) showSkeletons();

        try {
            const res = await window.API(`/api/videos?page=${page}&limit=10`);
            const data = await res.json();
            
            removeSkeletons();

            if (isInitial) container.innerHTML = "";

            if (!data.videos || data.videos.length === 0) {
                if (isInitial) {
                    container.innerHTML = "<div class='empty-state'><h2>No videos yet 📭</h2><p>Be the first to upload!</p></div>";
                }
                hasMore = false;
                return;
            }

            renderVideos(data.videos);
            
            if (data.videos.length < 10) hasMore = false;

        } catch (err) {
            console.error("❌ FEED Engine Error:", err);
            removeSkeletons();
            if (isInitial) {
                container.innerHTML = "<div class='error-state'><h2>Failed to load feed 🚫</h2><p>The universe is currently unstable. Refresh or log in.</p></div>";
            }
        } finally {
            loading = false;
        }
    }

    // --- Render & Preload Logic ---
    function renderVideos(videos) {
        videos.forEach(video => {
            const div = document.createElement("div");
            div.className = "reel-item video-card animate-up";
            div.dataset.id = video.id;

            div.innerHTML = `
                <video 
                    src="${video.video_url}" 
                    class="reel-video"
                    loop 
                    muted 
                    autoplay 
                    playsinline
                    preload="auto"
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
            
            const videoEl = div.querySelector("video");
            observer.observe(videoEl);
        });
    }

    // --- Infinite Scroll (Enhanced) ---
    // Listen for scroll events on the container (for desktop Reels layout) or window (mobile)
    const scrollTarget = container.scrollHeight > window.innerHeight ? container : window;
    
    const handleScroll = () => {
        const threshold = 300;
        const currentScroll = scrollTarget === window ? window.innerHeight + window.scrollY : container.offsetHeight + container.scrollTop;
        const totalHeight = scrollTarget === window ? document.body.offsetHeight : container.scrollHeight;

        if (currentScroll >= totalHeight - threshold) {
            if (!loading && hasMore) {
                page++;
                loadVideos(false);
            }
        }
    };

    scrollTarget.addEventListener("scroll", handleScroll);

    // --- Action Handlers ---
    window.handleLike = async (videoId, el) => {
        const icon = el.querySelector('i');
        const countEl = el.querySelector('.count');
        
        const isLiked = icon.classList.contains('bi-heart-fill');
        icon.classList.toggle('bi-heart-fill');
        icon.classList.toggle('bi-heart');
        icon.classList.toggle('liked');
        
        let currentCount = parseInt(countEl.textContent);
        countEl.textContent = isLiked ? currentCount - 1 : currentCount + 1;
        
        try {
            await window.API('/api/like', {
                method: 'POST',
                body: JSON.stringify({ video_id: videoId })
            });
        } catch (err) {
            console.error("Like transmission failed:", err);
        }
    };

    // Initial Load
    loadVideos(true);
});
