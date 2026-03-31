/**
 * upload.js – Blink Creator Studio v6.0
 * Real Progress Tracking, Preview Logic, Robust Validation
 */

document.addEventListener('DOMContentLoaded', () => {
    // ── 1. HELPERS & AUTH ───────────────────────────────────────
    if (!window.Blink) return console.error('[Blink] auth.js not loaded');
    const { getToken, getUser, requireAuth, showToast, API } = window.Blink;
    
    if (!requireAuth()) return;

    const elements = {
        dropzone:    document.getElementById('dropzone'),
        mediaInput:  document.getElementById('mediaInput'),
        vidPreview:  document.getElementById('videoPreview'),
        caption:     document.getElementById('captionInput'),
        publishBtn:  document.getElementById('publishBtn'),
        progress:    document.getElementById('uploadProgress'),
        progressFill:document.getElementById('progressFill'),
        progressText:document.getElementById('progressText'),
        dropContent: document.getElementById('dropzoneContent')
    };

    let selectedFile = null;

    // ── 2. SELECTION & PREVIEW ──────────────────────────────────
    elements.dropzone.onclick = () => elements.mediaInput.click();

    elements.mediaInput.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Validation (Task Requirement: Performance & Type)
        const allowed = ['video/mp4', 'video/quicktime', 'video/webm', 'image/jpeg', 'image/png'];
        if (!allowed.includes(file.type)) {
            showToast('Invalid format. Use high-quality MP4/MOV or JPG/PNG.', 'error');
            return;
        }

        selectedFile = file;
        const url = URL.createObjectURL(file);
        
        if (file.type.startsWith('video')) {
            elements.vidPreview.src = url;
            elements.vidPreview.style.display = 'block';
        } else {
            // For future image support in Reels if needed, though Reels are usually videos
            elements.vidPreview.style.display = 'none';
        }
        
        elements.dropContent.style.display = 'none';
        showToast('Scene synchronized!', 'success');
    };

    // ── 3. PRODUCTION UPLOAD EXECUTION ──────────────────────────
    elements.publishBtn.onclick = async () => {
        if (!selectedFile) return showToast('Please select a video first.', 'info');

        const formData = new FormData();
        formData.append('video', selectedFile);
        formData.append('caption', (elements.caption.value || '').trim());

        // UI State: Performance Feedback
        elements.publishBtn.disabled = true;
        elements.progress.classList.remove('hidden');
        elements.progressFill.style.width = "4%";
        elements.progressText.textContent = "🚀 Launching scene...";
        
        console.log("🚀 Starting upload for:", selectedFile.name);

        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${API}/upload/video`, true);
        xhr.setRequestHeader('Authorization', `Bearer ${getToken()}`);

        // Tracking Native Progress
        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
                const percent = Math.round((e.loaded / e.total) * 90); // 90% is upload
                elements.progressFill.style.width = percent + "%";
                elements.progressText.textContent = `📤 Uploading vision... ${percent}%`;
            }
        };

        xhr.onload = () => {
            try {
                const data = JSON.parse(xhr.responseText);
                if (xhr.status >= 200 && xhr.status < 300) {
                    elements.progressFill.style.width = "100%";
                    elements.progressText.textContent = "✅ Upload Successful!";
                    showToast('🚀 Moment published to the universe!', 'success');
                    
                    // Immediately redirect to witness the bloom
                    setTimeout(() => window.location.href = 'index.html', 1500);
                } else {
                    throw new Error(data.error || 'Synchronization failed.');
                }
            } catch (err) {
                console.error('Upload Parse Failure:', err);
                resetUI(err.message || 'Server error during publish.');
            }
        };

        xhr.onerror = () => resetUI('Network connectivity failure.');
        xhr.send(formData);
    };

    function resetUI(error) {
        showToast(error, 'error');
        elements.publishBtn.disabled = false;
        elements.progress.classList.add('hidden');
    }

    // Drag & Drop Decorative Interactions
    elements.dropzone.ondragover = (e) => {
        e.preventDefault();
        elements.dropzone.style.borderColor = 'var(--primary)';
        elements.dropzone.style.background = 'rgba(255, 0, 80, 0.05)';
    };
    elements.dropzone.ondragleave = () => {
        elements.dropzone.style.borderColor = 'var(--border-low)';
        elements.dropzone.style.background = 'none';
    };
    elements.dropzone.ondrop = (e) => {
        e.preventDefault();
        elements.dropzone.style.borderColor = 'var(--border-low)';
        elements.dropzone.style.background = 'none';
        const file = e.dataTransfer.files[0];
        if (file) {
            elements.mediaInput.files = e.dataTransfer.files;
            elements.mediaInput.onchange({ target: elements.mediaInput });
        }
    };
});
