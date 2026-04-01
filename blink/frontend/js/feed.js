/**
 * feed.js – Blink Feed Engine Pro v7.0 (TikTok-Level Optimization)
 * Features: Smart Preloading, Memory Buffering, Snap-Scroll Detection, iOS-Safe Autoplay
 */

document.addEventListener('DOMContentLoaded', () => {
    const { getToken, requireAuth, showToast, API } = window.Blink;
    if (!requireAuth()) return;

    const reelsContainer = document.getElementById('reelsContainer');
    let globalMuted = true;
    let allVideosData = [];
    const videoObserver = initVideoObserver();

    // ── 1. SMART PRELOADING SYSTEM ───────────────────────
    function manageVideoBuffering(currentIndex) {
        const reels = document.querySelectorAll('.reel-item');
        
        reels.forEach((reel, i) => {
            const video = reel.querySelector('video');
            if (!video) return;

            // Maintain max 3 videos loaded (i-1, i, i+1)
            if (i >= currentIndex - 1 && i <= currentIndex + 1) {
                if (video.getAttribute('preload') !== 'auto') {
                    console.log(`🧠 Preloading Buffer: Video ${i}`);
                    video.preload = 'auto';
                    // Re-assign src if it was removed for memory
                    if (!video.getAttribute('src') && allVideosData[i] && allVideosData[i].video_url) {
                        video.src = allVideosData[i].video_url;
                    }
                }
            } else {
                // Unload distant videos to save memory/data
                video.preload = 'none';
                video.pause();
                video.removeAttribute('src'); // Atomic unload
                video.load();   // Force clear buffer
            }
        });
    }

    // ── 2. VIDEO ELEMENT FACTORY ──────────────────────────
    function createVideoElement(videoData, index) {
        const video = document.createElement('video');
        
        // High-Performance standard attributes
        video.autoplay = true;
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        video.preload = index <= 1 ? 'auto' : 'none'; // Only preload first two
        video.className = 'reel-video';
        
        if (index <= 1 && videoData.video_url) video.src = videoData.video_url;
        if (videoData.thumbnail_url) video.poster = videoData.thumbnail_url;

        // Visual Feedback
        video.onplaying = () => hideLoader(video);
        video.oncanplay = () => hideLoader(video);
        video.onwaiting = () => showLoader(video);
        video.onerror = () => {
            console.log("Video failed:", video.src || videoData.video_url);
            handleVideoError(video);
        };

        return video;
    }

    // ── 3. SNAP-SCROLL OBSERVER ───────────────────────────
    function initVideoObserver() {
        return new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                const reel = entry.target;
                const video = reel.querySelector('video');
                const index = parseInt(reel.dataset.index);

                if (entry.isIntersecting && entry.intersectionRatio >= 0.7) {
                    console.log(`🎬 Active Reel: ${index}`);
                    
                    // Sync buffering
                    manageVideoBuffering(index);
                    
                    // Instant Play Pulse
                    if (!video.getAttribute('src') && allVideosData[index] && allVideosData[index].video_url) {
                        video.src = allVideosData[index].video_url;
                    }
                    
                    video.muted = globalMuted;
                    video.play().catch(err => {
                        if (err.name === 'NotAllowedError') showPlayOverlay(reel, video);
                    });
                    
                    trackView(reel.dataset.id);
                } else {
                    if (video) {
                        video.pause();
                        video.currentTime = 0;
                    }
                }
            });
        }, { threshold: 0.7 });
    }

    // ── 4. ANALYTICS & SOCIAL ────────────────────────────
    async function trackView(videoId) {
        try {
            await fetch(`${API}/posts/view`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${getToken()}` 
                },
                body: JSON.stringify({ id: videoId })
            });
        } catch (e) {}
    }

    // ── 5. FEED ARCHITECTURE ─────────────────────────────
    async function loadFeed() {
        try {
            const user = JSON.parse(localStorage.getItem('blink_user'));
            const userId = user ? user.id : '';
            const res = await fetch(`${API}/videos?userId=${userId}`, {
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            const data = await res.json();
            if (data.success) {
                allVideosData = data.videos || [];
                renderFeed(allVideosData);
            }
        } catch (err) {
            showToast("Universe pulse failed.", "error");
        }
    }

    function renderFeed(videos) {
        reelsContainer.innerHTML = '';
        videos.forEach((v, index) => {
            const reel = document.createElement('div');
            reel.className = 'reel-item';
            reel.dataset.id = v.id;
            reel.dataset.index = index;

            const video = createVideoElement(v, index);
            const videoWrap = document.createElement('div');
            videoWrap.className = 'video-wrapper';
            videoWrap.appendChild(video);

            const avatarHtml = v.profile_pic
                ? `<img src="${v.profile_pic}" alt="@${v.username}" class="avatar">`
                : `<div class="avatar flex-center" style="background:var(--bg-elevated);">${v.username[0].toUpperCase()}</div>`;

            reel.innerHTML = `
                <div class="video-loading"><div class="loader"></div></div>
                <div class="mute-btn-global"><i class="bi bi-volume-mute-fill"></i></div>
                
                <div class="reel-actions">
                    <div class="action-item" onclick="window.location.href='profile.html?id=${v.user_id}'">
                        ${avatarHtml}
                    </div>
                    <div class="action-item">
                        <button class="action-btn like-btn ${v.is_liked ? 'liked' : ''}" id="like-btn-${v.id}" onclick="window.toggleLike(${v.id})">
                            <i class="bi bi-heart-fill"></i>
                        </button>
                        <span class="action-count" id="like-count-${v.id}">${v.likes_count || 0}</span>
                    </div>
                    <div class="action-item"><button class="action-btn comment-btn" onclick="window.openComments(${v.id})"><i class="bi bi-chat-fill"></i></button></div>
                    <div class="action-item"><button class="action-btn share-btn" onclick="window.shareVideo(${v.id})"><i class="bi bi-send-fill"></i></button></div>
                </div>

                <div class="reel-info">
                    <div class="reel-user" onclick="window.location.href='profile.html?id=${v.user_id}'">
                        <span class="reel-username">@${v.username}</span>
                    </div>
                    <p class="reel-caption">${v.caption || ''}</p>
                    <div class="reel-hashtags">${v.hashtags || ''}</div>
                </div>
                <div class="tap-overlay"></div>
            `;

            reel.prepend(videoWrap);
            reelsContainer.appendChild(reel);

            // Interaction Listeners
            const tapOverlay = reel.querySelector('.tap-overlay');
            tapOverlay.onclick = () => {
                if (video.paused) video.play(); else video.pause();
            };

            const muteBtn = reel.querySelector('.mute-btn-global');
            muteBtn.onclick = () => {
                globalMuted = !globalMuted;
                document.querySelectorAll('video').forEach(vid => vid.muted = globalMuted);
                document.querySelectorAll('.mute-btn-global i').forEach(i => {
                    i.className = `bi ${globalMuted ? 'bi-volume-mute-fill' : 'bi-volume-up-fill'}`;
                });
            };

            videoObserver.observe(reel);
        });

        // Trigger first video manually for zero-lag start
        setTimeout(() => {
            const first = reelsContainer.querySelector('video');
            if (first) {
                first.muted = globalMuted;
                first.play().catch(() => {});
            }
        }, 100);
    }

    // ── 6. UI UTILITIES ──────────────────────────────────
    function showLoader(v) { 
        const loader = v.closest('.reel-item').querySelector('.video-loading');
        if (loader) loader.style.display = 'flex'; 
    }
    function hideLoader(v) { 
        const loader = v.closest('.reel-item').querySelector('.video-loading');
        if (loader) loader.style.display = 'none'; 
    }
    function handleVideoError(v) {
        const item = v.closest('.reel-item');
        item.style.background = '#f5f5f5';
        item.querySelector('.video-loading').innerHTML = `
            <div class="error-container flex-center" style="flex-direction:column; z-index: 10;">
                <i class="bi bi-exclamation-octagon-fill" style="font-size:2rem; color:#ff2e63; margin-bottom:10px;"></i>
                <p style="color:#333; font-weight:600; margin-bottom:15px;">Universe Content Offline</p>
                <button class="retry-btn" style="background:var(--primary); color:#fff; border:none; padding:8px 20px; border-radius:20px; font-weight:bold; cursor:pointer;">
                    <i class="bi bi-arrow-clockwise"></i> Retry Connection
                </button>
            </div>
        `;
        item.querySelector('.video-loading').style.display = 'flex';
        
        const retryBtn = item.querySelector('.retry-btn');
        if (retryBtn) {
            retryBtn.onclick = (e) => {
                e.stopPropagation(); // prevent tap-overlay
                item.querySelector('.video-loading').innerHTML = '<div class="loader"></div>';
                v.load();
                v.play().catch(()=>{});
            };
        }
    }
    function showPlayOverlay(reel, video) {
        if (reel.querySelector('.play-overlay')) return;
        const o = document.createElement('div');
        o.className = 'play-overlay flex-center';
        o.innerHTML = '<i class="bi bi-play-fill"></i>';
        o.onclick = () => { o.remove(); video.play(); };
        reel.appendChild(o);
    }

    // ── 7. INTERACTION HANDLERS ───────────────────────────
    window.toggleLike = async function(videoId) {
        // Optimistic UI update
        const btn = document.getElementById(`like-btn-${videoId}`);
        const countSpan = document.getElementById(`like-count-${videoId}`);
        if (!btn || !countSpan) return;

        const isCurrentlyLiked = btn.classList.contains('liked');
        let currentCount = parseInt(countSpan.innerText) || 0;

        if (isCurrentlyLiked) {
            btn.classList.remove('liked');
            countSpan.innerText = Math.max(0, currentCount - 1);
        } else {
            btn.classList.add('liked');
            countSpan.innerText = currentCount + 1;
        }

        try {
            const user = JSON.parse(localStorage.getItem('blink_user'));
            const res = await fetch(`${API}/like`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${getToken()}`
                },
                body: JSON.stringify({ user_id: user.id, video_id: videoId })
            });
            const data = await res.json();
            
            // Sync with server state
            if (data.liked !== undefined) {
                if (data.liked) btn.classList.add('liked');
                else btn.classList.remove('liked');
                countSpan.innerText = data.totalLikes;
            }
        } catch (err) {
            console.error('Like failed', err);
            // Revert optimistic update on failure
            if (isCurrentlyLiked) {
                btn.classList.add('liked');
                countSpan.innerText = currentCount;
            } else {
                btn.classList.remove('liked');
                countSpan.innerText = currentCount;
            }
        }
    };

    window.openComments = async function(videoId) {
        try {
            const res = await fetch(`${API}/comments/${videoId}`);
            const comments = await res.json();
            
            const commentDrawer = document.getElementById('commentDrawer');
            const commentList = document.getElementById('commentList');
            const postBtn = document.getElementById('postCommentBtn');
            const commentInput = document.getElementById('commentInput');

            if (!commentDrawer || !commentList) return;

            commentList.innerHTML = comments.length ? comments.map(c => `
                <div class="comment-item" style="display:flex; gap:10px; margin-bottom:15px;">
                    <img src="${c.profile_pic || 'https://via.placeholder.com/32'}" style="width:32px; height:32px; border-radius:50%;">
                    <div>
                        <b style="font-size:13px;">${c.username}</b>
                        <p style="margin:2px 0; font-size:14px;">${c.text}</p>
                        <small style="color:var(--text-muted); font-size:11px;">${new Date(c.created_at).toLocaleString()}</small>
                    </div>
                </div>
            `).join('') : '<p style="text-align:center; color:var(--text-muted); padding:20px;">No comments yet. Be the first!</p>';

            commentDrawer.classList.add('active');

            // Setup post button
            postBtn.onclick = async () => {
                const text = commentInput.value.trim();
                if (!text) return;

                postBtn.disabled = true;
                try {
                    const user = JSON.parse(localStorage.getItem('blink_user'));
                    const pRes = await fetch(`${API}/comment`, {
                        method: 'POST',
                        headers: { 
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${getToken()}`
                        },
                        body: JSON.stringify({ user_id: user.id, video_id: videoId, text })
                    });
                    const pData = await pRes.json();
                    if (pData.success) {
                        commentInput.value = '';
                        window.openComments(videoId); // reload comments
                    }
                } catch (e) {
                    showToast('Failed to post comment', 'error');
                }
                postBtn.disabled = false;
            };
        } catch (err) {
            showToast('Failed to load comments', 'error');
        }
    };

    // Close comment drawer logic (click outside)
    document.addEventListener('click', (e) => {
        const drawer = document.getElementById('commentDrawer');
        if (drawer && drawer.classList.contains('active')) {
            if (!drawer.contains(e.target) && !e.target.closest('.comment-btn')) {
                drawer.classList.remove('active');
            }
        }
    });

    window.shareVideo = function(videoId) {
        const url = `${window.location.origin}/video.html?id=${videoId}`;
        
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url).then(() => {
                showToast("Link copied!", "success");
            }).catch(err => {
                showToast("Failed to copy", "error");
            });
        } else {
            // Fallback
            const textArea = document.createElement("textarea");
            textArea.value = url;
            document.body.appendChild(textArea);
            textArea.select();
            try {
                document.execCommand('copy');
                showToast("Link copied!", "success");
            } catch (err) {
                showToast("Failed to copy", "error");
            }
            document.body.removeChild(textArea);
        }
    };

    loadFeed();
});
