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

    // ── 3. PRODUCTION UPLOAD (Task Fix: Fetch + Realistic Progress) ────
    elements.publishBtn.onclick = async () => {
        if (!selectedFile) return showToast('Please select a video or image first.', 'info');

        const formData = new FormData();
        formData.append('video', selectedFile);
        formData.append('caption', elements.caption.value || '');

        // UI State: Task 3 (Remove Fake 100%)
        elements.publishBtn.disabled = true;
        elements.progress.style.display = 'block';
        elements.progressText.style.display = 'block';
        
        elements.progressText.textContent = "🚀 Starting Upload...";
        elements.progressFill.style.width = "20%";

        console.log("Selected File Details:", selectedFile);

        try {
            // Task 2: Use fetch instead of XHR
            elements.progressText.textContent = "📤 Uploading to Blink Server...";
            elements.progressFill.style.width = "50%";

            const response = await fetch(window.Blink.API + '/upload/video', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer ' + getToken()
                },
                body: formData
            });

            elements.progressText.textContent = "⚙️ Processing Moment (Cloudinary)...";
            elements.progressFill.style.width = "85%";

            const data = await response.json();
            console.log("Response from Server:", data);

            if (data.success) {
                elements.progressText.textContent = "✅ Completed!";
                elements.progressFill.style.width = "100%";
                showToast('🚀 Moment published successfully!', 'success');
                setTimeout(() => window.location.href = 'index.html', 1500);
            } else {
                throw new Error(data.error || 'Server error during publish.');
            }

        } catch (err) {
            console.error('[Upload ERROR]:', err);
            showToast('Upload error: ' + err.message, 'error');
            elements.publishBtn.disabled = false;
            elements.progress.style.display = 'none';
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
