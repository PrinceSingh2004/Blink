/* ═══════════════════════════════════════════════════════════════════════════════
    BLINK v5.0 - VIDEO UPLOAD ENGINE
    Progress bar | Preview | Dropzone | Transitions
    ═══════════════════════════════════════════════════════════════════════════════ */

class VideoUpload {
    constructor() {
        this.selectedFile = null;
        this.init();
    }

    init() {
        if (!window.api.isAuthenticated()) return;
        
        // Global access
        window.upload = this;

        this.setupDropzone();
    }

    setupDropzone() {
        const dropzone = document.getElementById('uploadDropzone');
        if (!dropzone) return;

        // Click to upload
        dropzone.onclick = () => this.triggerFilePicker();

        // Drag & Drop
        dropzone.ondragover = (e) => {
            e.preventDefault();
            dropzone.classList.add('dragover');
        };
        dropzone.ondragleave = () => {
            dropzone.classList.remove('dragover');
        };
        dropzone.ondrop = (e) => {
            e.preventDefault();
            dropzone.classList.remove('dragover');
            const file = e.dataTransfer.files[0];
            if (file) this.handleFile(file);
        };
    }

    triggerFilePicker() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'video/*';
        input.onchange = (e) => {
            if (e.target.files[0]) this.handleFile(e.target.files[0]);
        };
        input.click();
    }

    handleFile(file) {
        if (!file.type.startsWith('video/')) {
            window.app.showError("Invalid frequency. Only video signals allowed.");
            return;
        }

        this.selectedFile = file;

        // 1. UI Transition
        document.getElementById('uploadDropzone').style.display = 'none';
        document.getElementById('uploadPreviewArea').style.display = 'block';

        // 2. Video Preview
        const videoPreview = document.getElementById('videoPreview');
        const fileURL = URL.createObjectURL(file);
        videoPreview.src = fileURL;
        videoPreview.play();

        // 3. Clear file info
        const fileInfo = document.getElementById('fileInfo');
        if (fileInfo) {
            fileInfo.textContent = `${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB)`;
        }
    }

    async startUpload() {
        if (!this.selectedFile) return;

        const caption = document.getElementById('videoCaption').value || '';
        const progressContainer = document.getElementById('uploadProgressContainer');
        const progressBar = document.getElementById('uploadProgressBar');
        const statusText = document.getElementById('uploadStatusText');

        try {
            // UI Setup
            progressContainer.style.display = 'block';
            document.getElementById('uploadBtn').disabled = true;
            statusText.textContent = "Injecting data into the Blink network...";

            // Create FormData
            const formData = new FormData();
            formData.append('video', this.selectedFile);
            formData.append('caption', caption);

            // Using XMLHttpRequest for progress tracking
            const xhr = new XMLHttpRequest();
            const API_BASE = window.api.baseURL || 'https://blink-yzoo.onrender.com/api';
            
            xhr.open('POST', `${API_BASE}/upload/video`, true);
            xhr.setRequestHeader('Authorization', `Bearer ${window.api.token}`);

            // Progress event
            xhr.upload.onprogress = (e) => {
                if (e.lengthComputable) {
                    const percent = Math.round((e.loaded / e.total) * 100);
                    progressBar.style.width = `${percent}%`;
                    statusText.textContent = `Syncing Frequency: ${percent}%`;
                }
            };

            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    window.app.showSuccess("Data pulse successful! Reel synchronized.");
                    setTimeout(() => {
                        window.app.navigateTo('feed');
                        this.clearUpload();
                    }, 1500);
                } else {
                    window.app.showError("Data pulse failed. Recheck the signal.");
                    this.resetUI();
                }
            };

            xhr.onerror = () => {
                window.app.showError("Link to Blink network severed.");
                this.resetUI();
            };

            xhr.send(formData);

        } catch (err) {
            console.error("Upload error:", err);
            window.app.showError("Universe transmission error.");
            this.resetUI();
        }
    }

    clearUpload() {
        this.selectedFile = null;
        this.resetUI();
    }

    resetUI() {
        document.getElementById('uploadDropzone').style.display = 'flex';
        document.getElementById('uploadPreviewArea').style.display = 'none';
        document.getElementById('uploadProgressContainer').style.display = 'none';
        document.getElementById('uploadBtn').disabled = false;
        
        const videoPreview = document.getElementById('videoPreview');
        if (videoPreview) {
            videoPreview.src = '';
        }
        
        const captionInput = document.getElementById('videoCaption');
        if (captionInput) captionInput.value = '';
    }
}

// Global initialization
window.upload = new VideoUpload();
