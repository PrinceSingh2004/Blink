/* upload.js – Multi-Type Media Upload Page */
document.addEventListener('DOMContentLoaded', async () => {
    const { getToken, requireAuth, showToast, populateSidebar } = window.Blink;

    if (!requireAuth()) return;
    await populateSidebar();

    const uploadZone    = document.getElementById('uploadZone');
    const fileInput     = document.getElementById('videoFileInput');
    const previewWrap   = document.getElementById('previewWrap');
    const previewVideo  = document.getElementById('videoPreview');
    const uploadForm    = document.getElementById('uploadForm');
    const submitBtn     = document.getElementById('submitUploadBtn');
    const progressWrap  = document.getElementById('uploadProgress');
    const progressFill  = document.getElementById('progressFill');
    const progressText  = document.getElementById('progressText');
    const typeSelect    = document.getElementById('uploadType');
    const moodGroup      = document.getElementById('moodGroup');

    // Toggle mood visibility based on type
    typeSelect?.addEventListener('change', () => {
        if (typeSelect.value === 'story') moodGroup.style.display = 'none';
        else moodGroup.style.display = 'block';
    });

    // Select file
    fileInput?.addEventListener('change', handleFile);

    function handleFile(e) {
        const file = e.target.files?.[0] || (e.dataTransfer?.files?.[0]);
        if (!file) return;
        
        const isVid = file.type.startsWith('video/');
        const isImg = file.type.startsWith('image/');

        if (!isVid && !isImg) { 
            showToast('Unsupported format (MP4, WebM, JPG, PNG only)', 'error'); 
            return; 
        }

        const url = URL.createObjectURL(file);
        previewVideo.src = url;
        previewWrap.style.display = '';
        uploadZone.style.display  = 'none';
        document.getElementById('fileNameLabel').textContent = file.name;
        document.getElementById('fileNameLabel').style.display = 'block';
    }

    // Submit upload
    uploadForm?.addEventListener('submit', async e => {
        e.preventDefault();
        const file = fileInput?.files?.[0];
        if (!file) return showToast('Please select a file first', 'error');

        const type = typeSelect.value; // 'reel' or 'story'
        const endpoint = type === 'story' ? '/api/stories/upload' : '/api/videos/upload';
        const fieldName = type === 'story' ? 'story' : 'video';

        const formData = new FormData();
        formData.append(fieldName, file);
        formData.append('caption', document.getElementById('captionInput').value.trim());
        if (type === 'reel') formData.append('mood', document.getElementById('moodSelect').value);

        submitBtn.disabled = true;
        progressWrap.style.display = '';

        const xhr = new XMLHttpRequest();
        xhr.open('POST', endpoint, true);
        xhr.setRequestHeader('Authorization', `Bearer ${getToken()}`);

        xhr.upload.onprogress = e => {
            if (e.lengthComputable) {
                const pct = Math.round((e.loaded / e.total) * 100);
                progressFill.style.width = pct + '%';
                progressText.textContent = `Uploading… ${pct}%`;
            }
        };

        xhr.onload = () => {
            const res = JSON.parse(xhr.responseText);
            if (xhr.status >= 200 && xhr.status < 300) {
                showToast(`${type.charAt(0).toUpperCase() + type.slice(1)} posted!`, 'success');
                setTimeout(() => { window.location.href = '/index.html'; }, 1000);
            } else {
                showToast(res.error || 'Upload failed', 'error');
                submitBtn.disabled = false;
            }
        };

        xhr.send(formData);
    });

    // Change video button
    document.getElementById('changeVideoBtn')?.addEventListener('click', () => {
        previewWrap.style.display = 'none';
        uploadZone.style.display  = '';
        fileInput.value  = '';
    });
});
