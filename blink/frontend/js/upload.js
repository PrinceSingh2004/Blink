/**
 * upload.js – Blink Creator Studio v4.0 (Production Optimized)
 * Task: Progress Tracking, Compression Backgrounding, Unified Media Handling
 */

document.addEventListener('DOMContentLoaded', () => {
    // ── 1. HELPERS & AUTH ───────────────────────────────────────
    if (!window.Blink) return console.error('[Blink] auth.js not loaded');
    const { getToken, getUser, requireAuth, showToast, apiRequest } = window.Blink;
    
    if (!requireAuth()) return;

    const me = getUser();
    const elements = {
        dropzone:    document.getElementById('dropzone'),
        mediaInput:  document.getElementById('mediaInput'),
        vidPreview:  document.getElementById('videoPreview'),
        imgPreview:  document.getElementById('imagePreview'),
        caption:     document.getElementById('captionInput'),
        publishBtn:  document.getElementById('publishBtn'),
        progress:    document.getElementById('uploadProgress'),
        progressFill:document.getElementById('progressFill'),
        progressText:document.getElementById('progressText')
    };

    let selectedFile = null;

    // ── 2. SELECTION & PREVIEW ──────────────────────────────────
    elements.dropzone.onclick = () => elements.mediaInput.click();

    elements.mediaInput.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Validation (Task 1: Accept only mp4, jpg, png)
        const allowed = ['video/mp4', 'image/jpeg', 'image/png'];
        if (!allowed.includes(file.type)) {
            showToast('Invalid format: Only mp4, jpg, and png allowed.', 'error');
            return;
        }

        selectedFile = file;
        renderPreview(file);
    };

    function renderPreview(file) {
        const url = URL.createObjectURL(file);
        if (file.type.startsWith('video')) {
            elements.vidPreview.src = url;
            elements.vidPreview.style.display = 'block';
            elements.imgPreview.style.display = 'none';
        } else {
            elements.imgPreview.src = url;
            elements.imgPreview.style.display = 'block';
            elements.vidPreview.style.display = 'none';
        }
        document.getElementById('dropzoneContent').style.display = 'none';
    }

    // ── 3. PRODUCTION UPLOAD (Task 1) ───────────────────────────
    elements.publishBtn.onclick = async () => {
        if (!selectedFile) return showToast('Please select a video or image first.', 'info');

        const formData = new FormData();
        formData.append('media',   selectedFile);
        formData.append('user_id', me.id);
        formData.append('caption', elements.caption.value || '');

        // UI State
        elements.publishBtn.disabled = true;
        elements.publishBtn.innerHTML = '<div class="loader" style="width:16px;height:16px;"></div> Publishing...';
        elements.progress.style.display     = 'block';
        elements.progressText.style.display = 'block';

        try {
            // Task: Progress-based XHR for large media
            const xhr = new XMLHttpRequest();
            xhr.open('POST', window.Blink.API + '/posts/upload');
            xhr.setRequestHeader('Authorization', 'Bearer ' + getToken());

            xhr.upload.onprogress = (e) => {
                if (e.lengthComputable) {
                    const percent = Math.round((e.loaded / e.total) * 100);
                    elements.progressFill.style.width = percent + '%';
                    elements.progressText.textContent = `Uploading ${percent}% (Compressing on server)`;
                }
            };

            xhr.onload = () => {
                const res = JSON.parse(xhr.responseText);
                if (xhr.status >= 200 && xhr.status < 300) {
                    showToast('🚀 Moment published successfully!', 'success');
                    setTimeout(() => window.location.href = 'index.html', 1500);
                } else {
                    throw new Error(res.error || 'Server error during publish.');
                }
            };

            xhr.onerror = () => { throw new Error('Network error during upload.'); };
            xhr.send(formData);

        } catch (err) {
            console.error('[Upload]', err);
            showToast(err.message, 'error');
            elements.publishBtn.disabled = false;
            elements.publishBtn.textContent = 'Publish to Blink';
        }
    };

    // --- Drag & Drop Decorators ---
    elements.dropzone.ondragover = (e) => {
        e.preventDefault();
        elements.dropzone.classList.add('dragover');
    };
    elements.dropzone.ondragleave = () => elements.dropzone.classList.remove('dragover');
    elements.dropzone.ondrop = (e) => {
        e.preventDefault();
        elements.dropzone.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file) {
            elements.mediaInput.files = e.dataTransfer.files;
            elements.mediaInput.onchange({ target: elements.mediaInput });
        }
    };
});
