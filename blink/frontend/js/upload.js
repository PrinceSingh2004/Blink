/* upload.js – Video Upload Page */
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

// Select file
fileInput?.addEventListener('change', handleFile);

function handleFile(e) {
    const file = e.target.files?.[0] || (e.dataTransfer?.files?.[0]);
    if (!file) return;
    
    const allowedTypes = ['video/mp4', 'video/quicktime'];
    if (!allowedTypes.includes(file.type)) { 
        showToast('Only MP4 and MOV allowed', 'error'); 
        return; 
    }
    if (file.size > 1024 * 1024 * 1024) { 
        showToast('File too large (max 1GB)', 'error'); 
        return; 
    }

    const url = URL.createObjectURL(file);
    
    // Validate duration, resolution, and aspect ratio
    const tempVideo = document.createElement('video');
    tempVideo.preload = 'metadata';
    tempVideo.onloadedmetadata = () => {
        URL.revokeObjectURL(tempVideo.src);
        const duration = tempVideo.duration;
        const width = tempVideo.videoWidth;
        const height = tempVideo.videoHeight;
        
        if (duration < 3 || duration > 90) {
            return showToast('Duration must be between 3 and 90 seconds', 'error');
        }
        
        // Removed strict 720x1280 and 9:16 limitations here to support any aspect ratio!
        if (width < 320 || height < 320) {
            return showToast('Resolution is too low (minimum 320px)', 'error');
        }

        previewVideo.src = url;
        previewWrap.style.display = '';
        uploadZone.style.display  = 'none';
        document.getElementById('fileNameLabel').textContent = file.name;
    };
    tempVideo.src = url;
}

// Drag-and-drop
uploadZone?.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('dragover'); });
uploadZone?.addEventListener('dragleave', ()  => uploadZone.classList.remove('dragover'));
uploadZone?.addEventListener('drop', e => {
    e.preventDefault();
    uploadZone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) { fileInput.files = e.dataTransfer.files; handleFile(e); }
});

// Change video button
document.getElementById('changeVideoBtn')?.addEventListener('click', () => {
    previewWrap.style.display = 'none';
    uploadZone.style.display  = '';
    previewVideo.src = '';
    fileInput.value  = '';
    recordedFile = null;
});

// ── CAMERA RECORDING ──────────────────────────────────────────
let mediaRecorder;
let recordedChunks = [];
let stream;
let recordedFile = null;
let startTime;
let timerInterval;

const startCameraBtn = document.getElementById('startCameraBtn');
const stopCameraBtn  = document.getElementById('stopCameraBtn');
const cameraWrap     = document.getElementById('cameraWrap');
const cameraPreview  = document.getElementById('cameraPreview');
const recordBtn      = document.getElementById('recordBtn');
const recordIcon     = document.getElementById('recordIcon');
const recordTimer    = document.getElementById('recordTimer');

startCameraBtn?.addEventListener('click', async () => {
    try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        cameraPreview.srcObject = stream;
        uploadZone.style.display = 'none';
        cameraWrap.style.display = 'block';
    } catch (err) {
        showToast('Camera access denied or not available', 'error');
    }
});

stopCameraBtn?.addEventListener('click', () => {
    stopStream();
    cameraWrap.style.display = 'none';
    uploadZone.style.display = 'block';
});

function stopStream() {
    if (stream) stream.getTracks().forEach(track => track.stop());
    clearInterval(timerInterval);
    recordTimer.style.display = 'none';
}

recordBtn?.addEventListener('click', () => {
    if (!mediaRecorder || mediaRecorder.state === 'inactive') {
        startRecording();
    } else {
        stopRecording();
    }
});

function startRecording() {
    recordedChunks = [];
    let mimeType = 'video/webm';
    if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/mp4';
    }
    mediaRecorder = new MediaRecorder(stream, { mimeType: mimeType });


    mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
        const blob = new Blob(recordedChunks, { type: 'video/webm' });
        recordedFile = new File([blob], 'recorded_video.webm', { type: 'video/webm' });

        const url = URL.createObjectURL(blob);
        previewVideo.src = url;
        previewWrap.style.display = 'block';
        cameraWrap.style.display = 'none';
        document.getElementById('fileNameLabel').textContent = 'Recorded Video (WebM)';
        document.getElementById('fileNameLabel').style.display = 'block';
        stopStream();
    };

    mediaRecorder.start();
    recordIcon.style.borderRadius = '2px';
    recordBtn.style.borderColor = '#fff';
    recordTimer.style.display = 'block';
    startTime = Date.now();
    timerInterval = setInterval(updateTimer, 1000);
}

function stopRecording() {
    mediaRecorder.stop();
    recordIcon.style.borderRadius = '50%';
}

function updateTimer() {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const secs = (elapsed % 60).toString().padStart(2, '0');
    recordTimer.textContent = `${mins}:${secs}`;
}


// Submit upload with XHR for progress tracking
uploadForm?.addEventListener('submit', async e => {
    e.preventDefault();
    const file = recordedFile || fileInput?.files?.[0];
    if (!file) { showToast('Please select or record a video first', 'error'); return; }

    const caption      = document.getElementById('captionInput').value.trim();
    const mood         = document.getElementById('moodSelect').value;
    const formData     = new FormData();
    formData.append('video',         file);

    formData.append('caption',       caption);
    formData.append('mood_category', mood);

    submitBtn.disabled = true;
    progressWrap.style.display = '';

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/videos/upload', true);
    xhr.setRequestHeader('Authorization', `Bearer ${getToken()}`);

    xhr.upload.addEventListener('progress', e => {
        if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 100);
            progressFill.style.width = pct + '%';
            progressText.textContent = `Uploading… ${pct}%`;
        }
    });

    xhr.addEventListener('load', () => {
        const res = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) {
            progressFill.style.width = '100%';
            progressText.textContent = 'Upload complete!';
            showToast('Video uploaded!', 'success');
            setTimeout(() => { window.location.href = '/pages/index.html'; }, 1200);
        } else {
            showToast(res.error || 'Upload failed', 'error');
            progressWrap.style.display = 'none';
            submitBtn.disabled = false;
        }
    });

    xhr.addEventListener('error', () => {
        showToast('Upload failed – check your connection', 'error');
        progressWrap.style.display = 'none';
        submitBtn.disabled = false;
    });

    xhr.send(formData);
});

}); // end DOMContentLoaded
