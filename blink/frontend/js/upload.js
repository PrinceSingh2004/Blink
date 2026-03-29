/**
 * upload.js – Blink Content Creation v3
 * ═══════════════════════════════════════════════════════════
 * Handles: Drag & Drop, Preview, Progress, Multi-Type Uploads
 * ═══════════════════════════════════════════════════════════
 */

document.addEventListener('DOMContentLoaded', async () => {
    // ── 1. HELPERS & AUTH ───────────────────────────────────────
    if (!window.Blink) return console.error('[Blink] auth.js not loaded');
    const { getToken, requireAuth, showToast } = window.Blink;
    
    if (!requireAuth()) return;

    const form          = document.getElementById('uploadForm');
    const dropZone      = document.getElementById('uploadDropZone');
    const fileInput     = document.getElementById('fileInput');
    const previewArea   = document.getElementById('previewArea');
    const mediaPlaceholder = document.getElementById('mediaPlaceholder');
    const removePreview = document.getElementById('removePreview');
    const submitBtn     = document.getElementById('submitBtn');
    const progressBar   = document.getElementById('progressBar');
    const progressFill  = document.getElementById('progressFill');
    const progressText  = document.getElementById('progressText');
    const typeSelect    = document.getElementById('uploadType');
    const moodGroup      = document.getElementById('moodGroup');

    let selectedFile    = null;

    // ── 2. PREVIEW LOGIC ───────────────────────────────────────
    const showPreview = (file) => {
        selectedFile = file;
        const isVid = file.type.startsWith('video/');
        const url = URL.createObjectURL(file);
        
        mediaPlaceholder.innerHTML = isVid 
            ? `<video src="${url}" controls autoplay muted playsinline loop style="width:100%; border-radius:16px;"></video>`
            : `<img src="${url}" alt="Preview" style="width:100%; border-radius:16px;">`;
            
        dropZone.classList.add('hidden');
        previewArea.style.display = 'block';
    };

    const clearPreview = () => {
        selectedFile = null;
        mediaPlaceholder.innerHTML = '';
        dropZone.classList.remove('hidden');
        previewArea.style.display = 'none';
        fileInput.value = '';
    };

    dropZone.onclick = () => fileInput.click();
    fileInput.onchange = (e) => { if (e.target.files[0]) showPreview(e.target.files[0]); };
    removePreview.onclick = clearPreview;

    // Drag & Drop
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, e => {
            e.preventDefault();
            e.stopPropagation();
        });
    });

    dropZone.addEventListener('dragover', () => dropZone.classList.add('drag-active'));
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-active'));
    dropZone.addEventListener('drop', (e) => {
        dropZone.classList.remove('drag-active');
        if (e.dataTransfer.files[0]) showPreview(e.dataTransfer.files[0]);
    });

    // ── 3. FORM LOGIC ──────────────────────────────────────────
    typeSelect.onchange = () => {
        if (typeSelect.value === 'story') {
            moodGroup.classList.add('hidden');
            moodGroup.style.display = 'none';
        } else {
            moodGroup.classList.remove('hidden');
            moodGroup.style.display = 'block';
        }
    };

    form.onsubmit = async (e) => {
        e.preventDefault();
        if (!selectedFile) return showToast('Please select a media file', 'error');

        const type    = typeSelect.value;
        const caption = document.getElementById('captionInput').value.trim();
        const mood    = document.getElementById('moodSelect').value;

        // Choose endpoint and field name based on type
        // v3 Backend:
        // /api/videos/upload (video filed: 'video') -> Reels
        // /api/posts/ (media field: 'media') -> Normal posts
        // /api/stories/upload (story field: 'story') -> Stories
        
        let endpoint = '/api/videos/upload';
        let fieldName = 'video';

        if (type === 'post') {
            endpoint = '/api/posts';
            fieldName = 'media';
        } else if (type === 'story') {
            endpoint = '/api/stories/upload';
            fieldName = 'story';
        }

        const formData = new FormData();
        formData.append(fieldName, selectedFile);
        formData.append('caption', caption);
        formData.append('mood_category', mood);
        formData.append('hashtags', caption.match(/#[a-z0-9]+/gi)?.join(' ') || '');

        // Use XHR for progress tracking
        submitBtn.disabled = true;
        progressBar.style.display = 'block';
        progressText.style.display = 'block';

        const xhr = new XMLHttpRequest();
        xhr.open('POST', window.Blink.API + endpoint, true);
        xhr.setRequestHeader('Authorization', `Bearer ${getToken()}`);

        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
                const pct = Math.round((e.loaded / e.total) * 100);
                progressFill.style.width = pct + '%';
                progressText.textContent = `Uploading ${pct}%...`;
            }
        };

        xhr.onload = () => {
            let res;
            try { res = JSON.parse(xhr.responseText); } catch { res = {}; }

            if (xhr.status >= 200 && xhr.status < 300) {
                showToast('✨ Upload complete!', 'success');
                setTimeout(() => { window.location.href = 'index.html'; }, 1000);
            } else {
                showToast(res.error || 'Upload failed. Try a smaller file.', 'error');
                submitBtn.disabled = false;
                progressBar.style.display = 'none';
                progressText.style.display = 'none';
            }
        };

        xhr.onerror = () => {
            showToast('Network error during upload.', 'error');
            submitBtn.disabled = false;
        };

        xhr.send(formData);
    };
});
