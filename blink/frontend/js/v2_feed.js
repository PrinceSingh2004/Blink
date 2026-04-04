/* ═══════════════════════════════════════════════════════════════════════════════
    BLINK v6.0 - PROFESSIONAL FEED ENGINE (V2)
    High Performance | Smart Autoplay | Error Resilient
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
                
                <div class="video-error" style="display:none; position:absolute; inset:0; background:rgba(0,0,0,0.9); flex-direction:column; align-items:center; justify-content:center;">
                    <i class="bi bi-broadcast-pin" style="font-size:40px; color:#6366f1;"></i>
                    <span>Frequency Lost</span>
                </div>

                <div class="reel-ui-overlay">
                    <div class="reel-actions">
                        <button onclick="window.feed.toggleMute(this)"><i class="bi ${this.isMuted ? 'bi-volume-mute-fill' : 'bi-volume-up-fill'}"></i></button>
                        <button onclick="window.feed.togglePlay(this)"><i class="bi bi-play-fill" style="display:none;"></i></button>
                    </div>
                    
                    <div class="reel-info">
                        <div class="user-pill" onclick="window.app.navigateTo('profile', {id: ${v.user_id}})">
                            <img src="${v.profile_pic || 'https://via.placeholder.com/50'}" class="avatar-sm">
                            <span>@${v.username}</span>
                        </div>
                        <p class="caption">${v.caption || ''}</p>
                    </div>
                </div>
            `;

            // Error handling (CSP compliant)
            const video = reel.querySelector('video');
            video.onerror = () => {
                video.style.display = 'none';
                reel.querySelector('.video-error').style.display = 'flex';
            };

            this.container.appendChild(reel);
            this.observer.observe(reel);
        });
    }

    playVideo(video) {
        if (!video) return;
        
        // Pause current
        if (this.currentVideo && this.currentVideo !== video) {
            this.currentVideo.pause();
        }

        // Play target
        this.currentVideo = video;
        video.play().catch(e => console.warn('Autoplay blocked:', e));
    }

    toggleMute() {
        this.isMuted = !this.isMuted;
        document.querySelectorAll('video').forEach(v => {
            v.muted = this.isMuted;
        });
        this.updateMuteIcons();
    }

    updateMuteIcons() {
        const icons = document.querySelectorAll('.reel-actions i');
        icons.forEach(i => {
           if(i.classList.contains('bi-volume-mute-fill') || i.classList.contains('bi-volume-up-fill')) {
               i.className = `bi ${this.isMuted ? 'bi-volume-mute-fill' : 'bi-volume-up-fill'}`;
           }
        });
    }

    renderEmpty() {
        this.container.innerHTML = '<div class="empty-state">No blinks yet. Be the first!</div>';
    }

    renderError() {
        this.container.innerHTML = '<div class="error-state">Connection Lost. <button onclick="window.feed.load()">Retry</button></div>';
    }
}
