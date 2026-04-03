/**
 * upload.js – Blink Creator Studio
 */

document.addEventListener('DOMContentLoaded', () => {
    initUpload();
});

function initUpload() {
    const dropzone = document.getElementById('dropzone');
    const mediaInput = document.getElementById('mediaInput');
    const videoPreview = document.getElementById('videoPreview');
    const publishBtn = document.getElementById('publishBtn');
    const captionInput = document.getElementById('captionInput');

    if (!dropzone || !mediaInput) return;

    dropzone.onclick = () => mediaInput.click();

    mediaInput.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            handleFileSelect(file);
        }
    };

    dropzone.ondragover = (e) => {
        e.preventDefault();
        dropzone.classList.add('bg-primary-fade');
    };

    dropzone.ondragleave = () => {
        dropzone.classList.remove('bg-primary-fade');
    };

    dropzone.ondrop = (e) => {
        e.preventDefault();
        dropzone.classList.remove('bg-primary-fade');
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('video/')) {
            handleFileSelect(file);
        }
    };

    function handleFileSelect(file) {
        const url = URL.createObjectURL(file);
        videoPreview.src = url;
        videoPreview.classList.remove('hidden');
        
        // Hide dropzone icons/text
        dropzone.querySelectorAll(':not(#videoPreview):not(input)').forEach(el => el.classList.add('hidden'));
        dropzone.style.padding = '0';
        
        window.showToast("Video selected!");
    }

    publishBtn.onclick = async () => {
        const file = mediaInput.files[0];
        const caption = captionInput.value.trim();

        if (!file) {
            window.showToast("Please select a video first", "error");
            return;
        }

        const formData = new FormData();
        formData.append('video', file);
        formData.append('caption', caption);

        try {
            publishBtn.disabled = true;
            document.getElementById('uploadProgress').classList.remove('hidden');
            
            const progressFill = document.getElementById('progressFill');
            const progressText = document.getElementById('progressText');

            const xhr = new XMLHttpRequest();
            xhr.open('POST', window.BlinkConfig.API_BASE + '/api/upload/video', true);
            
            // Need to get token properly
            const token = window.BlinkConfig.getToken() || localStorage.getItem('token');
            xhr.setRequestHeader('Authorization', `Bearer ${token}`);

            xhr.upload.onprogress = (e) => {
                if (e.lengthComputable) {
                    const percent = Math.round((e.loaded / e.total) * 100);
                    progressFill.style.width = percent + '%';
                    progressText.innerText = `Uploading... ${percent}%`;
                }
            };

            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    window.showToast("Post published successfully!");
                    setTimeout(() => window.location.href = 'index.html', 1500);
                } else {
                    window.showToast("Upload failed", "error");
                    publishBtn.disabled = false;
                }
            };

            xhr.onerror = () => {
                window.showToast("Network error", "error");
                publishBtn.disabled = false;
            };

            xhr.send(formData);

        } catch (err) {
            console.error("Upload error:", err);
            publishBtn.disabled = false;
        }
    };
}
