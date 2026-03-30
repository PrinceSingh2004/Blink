/* ═══════════════════════════════════════════════════════════════════════════════
   BLINK v4.0 - UPLOAD MODULE
   Video upload with compression, drag & drop, progress tracking
   ═══════════════════════════════════════════════════════════════════════════════ */

class VideoUploader {
    constructor() {
        this.selectedFile = null;
        this.isUploading = false;
    }

    /**
     * Initialize upload page
     */
    init() {
        if (!window.auth?.requireAuth?.()) return;

        this.setupDropZone();
        this.setupFileInput();
        this.setupUploadButtons();
    }

    /**
     * Setup drag & drop zone
     */
    setupDropZone() {
        const dropzone = document.querySelector('.dropzone');
        if (!dropzone) return;

        dropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropzone.classList.add('dragover');
        });

        dropzone.addEventListener('dragleave', () => {
            dropzone.classList.remove('dragover');
        });

        dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropzone.classList.remove('dragover');

            const files = e.dataTransfer.files;
            if (files.length > 0) {
                this.handleFileSelect(files[0]);
            }
        });

        dropzone.addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'video/*';
            input.onchange = (e) => {
                if (e.target.files.length > 0) {
                    this.handleFileSelect(e.target.files[0]);
                }
            };
            input.click();
        });
    }

    /**
     * Setup file input
     */
    setupFileInput() {
        const input = document.querySelector('input[type="file"][accept="video/*"]');
        if (input) {
            input.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    this.handleFileSelect(e.target.files[0]);
                }
            });
        }
    }

    /**
     * Handle file selection
     */
    async handleFileSelect(file) {
        if (!file.type.startsWith('video/')) {
            window.app?.showError?.('Please select a video file');
            return;
        }

        if (file.size > 500 * 1024 * 1024) {
            window.app?.showError?.('File size must be less than 500MB');
            return;
        }

        this.selectedFile = file;
        this.showPreview(file);
    }

    /**
     * Show video preview
     */
    showPreview(file) {
        const preview = document.querySelector('.preview-area video');
        if (!preview) return;

        const url = URL.createObjectURL(file);
        preview.src = url;

        const duration = document.querySelector('.preview-info');
        if (duration) {
            preview.addEventListener('loadedmetadata', () => {
                const minutes = Math.floor(preview.duration / 60);
                const seconds = Math.floor(preview.duration % 60);
                duration.innerHTML = `
                    <div>
                        <strong>Duration:</strong> ${minutes}:${String(seconds).padStart(2, '0')}
                    </div>
                    <div>
                        <strong>Size:</strong> ${(file.size / (1024 * 1024)).toFixed(2)} MB
                    </div>
                `;
            });
        }
    }

    /**
     * Setup upload buttons
     */
    setupUploadButtons() {
        const uploadBtn = document.querySelector('.upload-buttons .btn-primary');
        const discardBtn = document.querySelector('.upload-buttons .btn-secondary');

        if (uploadBtn) {
            uploadBtn.addEventListener('click', () => this.uploadVideo());
        }

        if (discardBtn) {
            discardBtn.addEventListener('click', () => {
                this.selectedFile = null;
                const preview = document.querySelector('.preview-area video');
                if (preview) preview.src = '';
                window.app?.showSuccess?.('Upload cancelled');
            });
        }
    }

    /**
     * Convert file to base64
     */
    fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    /**
     * Upload video
     */
    async uploadVideo() {
        if (!this.selectedFile) {
            window.app?.showError?.('Please select a video');
            return;
        }

        if (this.isUploading) return;

        const captionInput = document.querySelector('textarea[name="caption"]');
        const caption = captionInput?.value?.trim() || '';

        this.isUploading = true;

        try {
            window.app?.showLoading?.();

            // Direct upload using File object (No Base64 - Optimized)
            const response = await window.api?.uploadVideo?.(this.selectedFile, caption);

            window.app?.hideLoading?.();

            if (response?.video) {
                window.app?.showSuccess?.('🎉 Video uploaded successfully!');

                // Reset form
                setTimeout(() => {
                    this.selectedFile = null;
                    const preview = document.querySelector('.preview-area video');
                    if (preview) preview.src = '';
                    if (captionInput) captionInput.value = '';

                    // Redirect to feed
                    window.app?.redirect?.('feed');
                }, 1500);
            }
        } catch (error) {
            window.app?.hideLoading?.();
            window.app?.showError?.('Failed to upload video: ' + error.message);
        } finally {
            this.isUploading = false;
        }
    }
}

// Create global instance
window.upload = new VideoUploader();

export default window.upload;
