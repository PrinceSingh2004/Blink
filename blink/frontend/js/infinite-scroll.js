/* infinite-scroll.js – Reusable IntersectionObserver-based infinite scroll */

class InfiniteScroll {
    constructor(container, opts = {}) {
        this.container  = container;
        this.onMore     = opts.onMore     || (() => {});
        this.threshold  = opts.threshold  || 0.1;
        this.sentinel   = null;
        this.obs        = null;
        this._setup();
    }
    _setup() {
        if (this.sentinel) this.sentinel.remove();
        this.sentinel = document.createElement('div');
        this.sentinel.className = 'scroll-sentinel';
        this.container.appendChild(this.sentinel);

        if (this.obs) this.obs.disconnect();
        this.obs = new IntersectionObserver(entries => {
            if (entries[0].isIntersecting) this.onMore();
        }, { root: this.container, threshold: this.threshold });
        this.obs.observe(this.sentinel);
    }
    refresh() { this._setup(); }
    destroy() {
        if (this.obs) this.obs.disconnect();
        if (this.sentinel) this.sentinel.remove();
    }
}

window.InfiniteScroll = InfiniteScroll;
