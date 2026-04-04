/* ═══════════════════════════════════════════════════════════════════════════════
    BLINK v6.2 - PROFESSIONAL FEED ENGINE (V2)
    High Performance | Smart Autoplay | Like Sync | Error Resilient
    ═══════════════════════════════════════════════════════════════════════════════ */

class BlinkFeedV2 {
    constructor() {
        this.container = document.getElementById('reelsContainer');
        this.currentVideo = null;
        this.observer = null;
        this.isMuted = true;
        this.init();
    }

    init() {
        if (!this.container) return;
        window.feed = this;
        this.setupObserver();
    }

    async load() {
        console.log('[BlinkFeed] Initiating feed sync...');
        this.container.innerHTML = '<div class="loader-wrap">Syncing Blinks...</div>';

        try {
            const res = await window.api.request('/videos');
            if (res && res.success && res.data.length > 0) {
                this.renderReels(res.data);
            } else {
                this.renderEmpty();
            }
        } catch (err) {
            console.error('[BlinkFeed] Sync failed:', err);
            this.renderError();
        }
    }

    setupObserver() {
        this.observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                const video = entry.target.querySelector('video');
                if (entry.isIntersecting && entry.intersectionRatio > 0.6) {
                    this.playVideo(video);
                } else {
                    video?.pause();
                }
            });
        }, { threshold: [0.6, 0.8] });
    }

    renderReels(videos) {
        this.container.innerHTML = ''; // Clear loader
        
        videos.forEach(v => {
            const reel = document.createElement('div');
            reel.className = 'reel-card';
            
            reel.innerHTML = `
                <video src="${v.video_url}" class="reel-video" loop playsinline muted="${this.isMuted}"></video>
                
                <!-- Falling Overlay for Broken Assets -->
                <div class="video-error" style="display:none; position:absolute; inset:0; background:rgba(0,0,0,0.9); flex-direction:column; align-items:center; justify-content:center; z-index:100;">
                    <i class="bi bi-broadcast-pin" style="font-size:40px; color:#6366f1;"></i>
                    <span>Frequency Lost (404)</span>
                </div>

                <div class="reel-ui-overlay">
                    <div class="reel-actions">
                        <div class="action-item">
                            <button onclick="window.feed.toggleLike(this, ${v.id})" class="like-btn">
                                <i class="bi bi-heart-fill" style="color: ${v.is_liked ? '#ff2c55' : 'white'};"></i>
                            </button>
                            <span class="count">${v.likes_count || 0}</span>
                        </div>
                        <div class="action-item">
                            <button onclick="window.feed.toggleMute(this)"><i class="bi ${this.isMuted ? 'bi-volume-mute-fill' : 'bi-volume-up-fill'}"></i></button>
                        </div>
                    </div>
                    
                    <div class="reel-info">
                        <div class="user-pill" onclick="window.app.navigateTo('profile', {id: ${v.user_id}})">
                            <img src="${v.profile_pic || 'https://via.placeholder.com/50'}" class="avatar-sm">
                            <span>@${v.username}</span>
                        </div>
                        <p class="caption">${v.caption || 'Live from the Blink Universe'}</p>
                    </div>
                </div>
            `;

            // Error handling (CSP compliant listener approach)
            const video = reel.querySelector('video');
            video.addEventListener('error', () => {
                video.style.setProperty('display', 'none', 'important');
                reel.querySelector('.video-error').style.setProperty('display', 'flex', 'important');
            });

            this.container.appendChild(reel);
            this.observer.observe(reel);
        });
    }

    playVideo(video) {
        if (!video) return;
        if (this.currentVideo && this.currentVideo !== video) this.currentVideo.pause();
        this.currentVideo = video;
        video.play().catch(e => console.warn('Autoplay blocked:', e));
    }

    async toggleLike(btn, videoId) {
        try {
            const icon = btn.querySelector('i');
            const countSpan = btn.nextElementSibling;
            let currentCount = parseInt(countSpan.innerText);

            if (icon.style.color === 'rgb(255, 44, 85)') {
                icon.style.color = 'white';
                countSpan.innerText = currentCount - 1;
            } else {
                icon.style.color = '#ff2c55';
                countSpan.innerText = currentCount + 1;
            }

            await window.api.request(`/videos/${videoId}/like`, { method: 'POST' });
        } catch (err) {
            console.error("Like failed:", err);
        }
    }

    toggleMute() {
        this.isMuted = !this.isMuted;
        document.querySelectorAll('video').forEach(v => v.muted = this.isMuted);
        this.updateMuteIcons();
    }

    updateMuteIcons() {
        document.querySelectorAll('.bi-volume-mute-fill, .bi-volume-up-fill').forEach(i => {
           i.className = `bi ${this.isMuted ? 'bi-volume-mute-fill' : 'bi-volume-up-fill'}`;
        });
    }

    renderEmpty() {
        this.container.innerHTML = '<div class="empty-state">No blinks in range. Be the first!</div>';
    }

    renderError() {
        this.container.innerHTML = '<div class="error-state">Connection Lost. <button onclick="window.feed.load()" class="btn-primary">Retry</button></div>';
    }
}
