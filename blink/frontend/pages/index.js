import React from 'react';

export default function Index() {
  return (
    <>
      <link rel="stylesheet" href="/globals.css" />
      <div dangerouslySetInnerHTML={{ __html: `
        <div id="app">
          <nav class="top-nav">
             <h2>Blink Shorts</h2>
             <a href="/login" class="nav-btn">Login</a>
          </nav>
          
          <div class="video-feed" id="videoFeed">
             <!-- Videos injected via Vanilla JS -->
          </div>

          <div class="upload-btn" onclick="document.getElementById('uploadModal').style.display='block'">
             +
          </div>

          <!-- Upload Modal -->
          <div id="uploadModal" class="modal">
            <div class="modal-content">
               <span class="close" onclick="document.getElementById('uploadModal').style.display='none'">&times;</span>
               <h3>Upload Video</h3>
               <input type="file" id="videoInput" accept="video/*" />
               <button id="uploadBtn">Upload</button>
            </div>
          </div>
        </div>
      ` }} />

      <script dangerouslySetInnerHTML={{ __html: `
        const API = 'http://localhost:5000/api';
        let page = 0;

        async function loadVideos() {
           try {
              const res = await fetch(API + '/videos/feed?page=' + page);
              const videos = await res.json();
              const feed = document.getElementById('videoFeed');
              
              videos.forEach(v => {
                 const container = document.createElement('div');
                 container.className = 'video-container';
                 container.innerHTML = \`
                    <video src="\${v.url}" loop class="feed-video" playsinline></video>
                    <div class="overlay-ui">
                       <div class="author">@\${v.author.split('@')[0]}</div>
                       <div class="actions">
                          <button onclick="window.location.href='/video/\${v.id}'">💬 Comment</button>
                          <button>❤️ Like</button>
                       </div>
                    </div>
                 \`;
                 feed.appendChild(container);
              });

              setupIntersectionObserver();
           } catch (e) { console.error('Error loading feed', e); }
        }

        function setupIntersectionObserver() {
           const observer = new IntersectionObserver((entries) => {
              entries.forEach(entry => {
                 const vid = entry.target;
                 if (entry.isIntersecting) {
                    vid.play().catch(e => console.log('Autoplay blocked', e));
                 } else {
                    vid.pause();
                 }
              });
           }, { threshold: 0.6 });

           document.querySelectorAll('.feed-video').forEach(vid => {
               observer.observe(vid);
           });
        }

        document.getElementById('uploadBtn')?.addEventListener('click', async () => {
           const file = document.getElementById('videoInput').files[0];
           if (!file) return alert('Select file');
           const token = localStorage.getItem('blink_token');
           if (!token) return alert('Please login first!');

           const fd = new FormData();
           fd.append('video', file);
           
           document.getElementById('uploadBtn').innerText = 'Uploading...';
           const res = await fetch(API + '/videos/upload', {
              method: 'POST',
              headers: { 'Authorization': 'Bearer ' + token },
              body: fd
           });
           
           if(res.ok) {
              alert('Uploaded!');
              window.location.reload();
           } else {
              alert('Failed');
           }
        });

        // Init
        loadVideos();
      ` }} />
    </>
  );
}
