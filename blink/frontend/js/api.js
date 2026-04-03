/* ═══════════════════════════════════════════════════════════════════════════════
   BLINK v4.0 - API CLIENT WRAPPER
   Auto-detects environment | JWT token injection | Error handling
   ═══════════════════════════════════════════════════════════════════════════════ */

// GLOBAL API WRAPPER (Production Ready)
window.API = (endpoint, options = {}) => {
  const token = localStorage.getItem("token") || localStorage.getItem("blink_token");
  
  // Smart prefixing: only add /api if it's missing and not an absolute URL
  let url = endpoint;
  if (!endpoint.startsWith('http')) {
      const prefix = endpoint.startsWith('/api') ? '' : '/api';
      url = `${prefix}${endpoint}`;
  }

  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "Authorization": token ? `Bearer ${token}` : "",
      ...options.headers,
    },
  });
};

class BlinkAPI {
    constructor() {
        // Auto-detect environment
        const isProduction = window.location.hostname !== 'localhost';
        this.baseURL = isProduction 
            ? 'https://blink-yzoo.onrender.com/api'
            : 'http://localhost:5000/api';
        
        this.token = localStorage.getItem('token');
        this.timeout = 30000; // 30 seconds
    }

    /**
     * Get Authorization Header
     */
    getHeaders(isFormData = false) {
        const headers = {
            'Accept': 'application/json'
        };

        if (!isFormData) {
            headers['Content-Type'] = 'application/json';
        }

        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }

        return headers;
    }

    /**
     * Make HTTP Request
     */
    async request(endpoint, options = {}) {
        const url = `${this.baseURL}${endpoint}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        try {
            const method = options.method || 'GET';
            const isFormData = options.body instanceof FormData;
            
            const config = {
                method,
                headers: this.getHeaders(isFormData),
                signal: controller.signal,
                ...options
            };

            // Don't set Content-Type for FormData (let browser set it)
            if (isFormData) {
                delete config.headers['Content-Type'];
            }

            const response = await fetch(url, config);

            clearTimeout(timeoutId);

            // Unauthorized - clear token and redirect to login
            if (response.status === 401) {
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                window.location.href = '/login.html';
                return null;
            }

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || `HTTP ${response.status}`);
            }

            return data;
        } catch (error) {
            clearTimeout(timeoutId);
            console.error('API Error:', error);
            throw error;
        }
    }

    /* ─────────────────────────────────────────────────────────────────────────── */
    /* AUTH ENDPOINTS */
    /* ─────────────────────────────────────────────────────────────────────────── */

    async signup(email, password, username) {
        const response = await this.request('/auth/signup', {
            method: 'POST',
            body: JSON.stringify({ email, password, username })
        });

        if (response.token) {
            this.token = response.token;
            localStorage.setItem('token', response.token);
            localStorage.setItem('user', JSON.stringify(response.user));
        }

        return response;
    }

    async login(email, password) {
        const response = await this.request('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });

        if (response.token) {
            this.token = response.token;
            localStorage.setItem('token', response.token);
            localStorage.setItem('user', JSON.stringify(response.user));
        }

        return response;
    }

    logout() {
        this.token = null;
        localStorage.removeItem('token');
        localStorage.removeItem('user');
    }

    /* ─────────────────────────────────────────────────────────────────────────── */
    /* VIDEO ENDPOINTS */
    /* ─────────────────────────────────────────────────────────────────────────── */

    async uploadVideo(videoFile, caption = '') {
        const formData = new FormData();
        formData.append('video', videoFile);
        formData.append('caption', caption);

        return this.request('/upload/video', {
            method: 'POST',
            body: formData
        });
    }

    async getFeed(page = 1, limit = 10) {
        return this.request(`/videos/feed?page=${page}&limit=${limit}`);
    }

    async getVideo(videoId) {
        return this.request(`/videos/${videoId}`);
    }

    async likeVideo(videoId) {
        return this.request(`/videos/${videoId}/like`, { method: 'POST' });
    }

    async unlikeVideo(videoId) {
        return this.request(`/videos/${videoId}/like`, { method: 'DELETE' });
    }

    async addComment(videoId, text) {
        return this.request(`/videos/${videoId}/comments`, {
            method: 'POST',
            body: JSON.stringify({ text })
        });
    }

    async saveVideo(videoId) {
        return this.request(`/videos/${videoId}/save`, { method: 'POST' });
    }

    /* ─────────────────────────────────────────────────────────────────────────── */
    /* USER ENDPOINTS */
    /* ─────────────────────────────────────────────────────────────────────────── */

    async getProfile(userId) {
        return this.request(`/users/${userId}`);
    }

    async updateProfile(updates) {
        return this.request('/users/profile', {
            method: 'PUT',
            body: JSON.stringify(updates)
        });
    }

    async uploadProfilePhoto(photoBase64) {
        return this.request('/upload/profile-photo', {
            method: 'POST',
            body: JSON.stringify({ photo: photoBase64 })
        });
    }

    async uploadCoverPhoto(photoBase64) {
        return this.request('/upload/cover-photo', {
            method: 'POST',
            body: JSON.stringify({ photo: photoBase64 })
        });
    }

    async followUser(userId) {
        return this.request(`/users/${userId}/follow`, { method: 'POST' });
    }

    async unfollowUser(userId) {
        return this.request(`/users/${userId}/follow`, { method: 'DELETE' });
    }

    async searchUsers(query) {
        return this.request(`/users/search?q=${encodeURIComponent(query)}`);
    }

    /* ─────────────────────────────────────────────────────────────────────────── */
    /* MESSAGE ENDPOINTS */
    /* ─────────────────────────────────────────────────────────────────────────── */

    async getMessages(recipientId) {
        return this.request(`/messages/${recipientId}`);
    }

    async getConversations(page = 1) {
        return this.request(`/messages?page=${page}`);
    }

    /* ─────────────────────────────────────────────────────────────────────────── */
    /* LIVE STREAMING ENDPOINTS */
    /* ─────────────────────────────────────────────────────────────────────────── */

    async startLiveStream(title = '') {
        return this.request('/live', {
            method: 'POST',
            body: JSON.stringify({ title })
        });
    }

    async endLiveStream(streamId) {
        return this.request(`/live/${streamId}`, { method: 'DELETE' });
    }

    async getLiveStreams() {
        return this.request('/live');
    }

    async getStream(streamId) {
        return this.request(`/live/${streamId}`);
    }

    /* ─────────────────────────────────────────────────────────────────────────── */
    /* UTILITY METHODS */
    /* ─────────────────────────────────────────────────────────────────────────── */

    isAuthenticated() {
        return !!this.token;
    }

    getCurrentUser() {
        const user = localStorage.getItem('user');
        return user ? JSON.parse(user) : null;
    }

    setToken(token) {
        this.token = token;
        localStorage.setItem('token', token);
    }

    async checkHealth() {
        try {
            return await this.request('/', { 
                method: 'GET',
                headers: { 'Accept': 'application/json' }
            });
        } catch (error) {
            return { status: 'offline' };
        }
    }
}

// Create global instance
window.api = new BlinkAPI();

// Auto-update token from localStorage
window.addEventListener('storage', (e) => {
    if (e.key === 'token') {
        window.api.token = e.newValue;
    }
});

// No export needed for global browser usage
