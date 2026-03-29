import React from 'react';

export default function SingleVideo() {
  return (
    <>
      <link rel="stylesheet" href="/globals.css" />
      <div dangerouslySetInnerHTML={{ __html: `
        <div id="app" style="display: flex; flex-direction: column; height: 100vh; background: black;">
          <nav class="top-nav">
             <a href="/" class="nav-btn" style="text-decoration: none;">&larr; Back to Feed</a>
          </nav>

          <div id="videoContainer" style="flex: 1; position: relative;">
            <p style="color: white; text-align: center; margin-top: 50%;">Loading video...</p>
          </div>

          <div id="commentsSection" class="comments-section">
             <h3>Comments</h3>
             <div id="commentsList" style="flex:1; overflow-y:auto; padding-bottom: 20px;"></div>
             <div class="comment-input-area">
                <input type="text" id="commentText" placeholder="Write a comment..." />
                <button id="postCommentBtn">Post</button>
             </div>
          </div>
        </div>
      ` }} />

      <script dangerouslySetInnerHTML={{ __html: `
        const API = 'http://localhost:5000/api';
        const videoId = window.location.pathname.split('/').pop();

        async function init() {
            try {
                const [vidRes, commentRes] = await Promise.all([
                    fetch(API + '/videos/' + videoId),
                    fetch(API + '/videos/' + videoId + '/comments')
                ]);
                
                const videoData = await vidRes.json();
                const comments = await commentRes.json();

                const vContainer = document.getElementById('videoContainer');
                vContainer.innerHTML = \`
                    <video src="\${videoData.url}" controls autoplay style="width:100%; height:100%; object-fit: contain;"></video>
                \`;

                const cList = document.getElementById('commentsList');
                cList.innerHTML = comments.map(c => \`
                   <div style="margin-bottom: 10px; border-bottom: 1px solid #333; padding-bottom: 5px;">
                      <strong style="color: #00ff88;">\${c.author.split('@')[0]}</strong>
                      <p style="margin: 5px 0;">\${c.text}</p>
                   </div>
                \`).join('');
            } catch (e) {
                console.error('Error fetching video', e);
            }
        }

        document.getElementById('postCommentBtn')?.addEventListener('click', async () => {
             const text = document.getElementById('commentText').value;
             const token = localStorage.getItem('blink_token');
             
             if (!text) return;
             if (!token) return alert('Login first!');

             const res = await fetch(API + '/videos/' + videoId + '/comment', {
                 method: 'POST',
                 headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + token
                 },
                 body: JSON.stringify({ text })
             });

             if (res.ok) {
                 document.getElementById('commentText').value = '';
                 init(); // Refresh comments
             } else {
                 alert('Comment failed');
             }
        });

        init();
      ` }} />
    </>
  );
}
