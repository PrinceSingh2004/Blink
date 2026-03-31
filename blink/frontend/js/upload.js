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

    // ── 3. PRODUCTION UPLOAD (Real Progress Tracking) ────
    elements.publishBtn.onclick = async () => {
        if (!selectedFile) return showToast('Please select a video or image first.', 'info');

        const formData = new FormData();
        formData.append('video', selectedFile);
        formData.append('caption', elements.caption.value || '');

        elements.publishBtn.disabled = true;
        elements.progress.style.display = 'block';
        elements.progressText.style.display = 'block';
        elements.progressFill.style.width = "0%";
        
        console.log("🚀 Starting upload for:", selectedFile.name);

        const xhr = new XMLHttpRequest();
        xhr.open('POST', window.Blink.API + '/upload/video', true);
        xhr.setRequestHeader('Authorization', 'Bearer ' + getToken());

        // Tracking Upload Progress
        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
                const percent = Math.round((e.loaded / e.total) * 90); // 90% is upload
                elements.progressFill.style.width = percent + "%";
                elements.progressText.textContent = `📤 Uploading... ${percent}%`;
            }
        };

        xhr.onload = () => {
            try {
                const data = JSON.parse(xhr.responseText);
                if (xhr.status >= 200 && xhr.status < 300) {
                    elements.progressFill.style.width = "100%";
                    elements.progressText.textContent = "✅ Upload Successful!";
                    showToast('🚀 Moment published successfully!', 'success');
                    
                    // Immediately redirect to feed to see the new video
                    setTimeout(() => window.location.href = 'index.html', 1200);
                } else {
                    throw new Error(data.error || 'Server error during publish.');
                }
            } catch (err) {
                console.error('Upload Parse Error:', err);
                showToast('Upload failed: ' + err.message, 'error');
                elements.publishBtn.disabled = false;
            }
        };

        xhr.onerror = () => {
            console.error('XHR Error');
            showToast('Network error during upload.', 'error');
            elements.publishBtn.disabled = false;
        };

        xhr.send(formData);
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
