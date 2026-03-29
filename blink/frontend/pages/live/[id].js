import React from 'react';

export default function LiveStream() {
  return (
    <>
      <link rel="stylesheet" href="/globals.css" />
      <script src="https://cdn.socket.io/4.7.5/socket.io.min.js"></script>
      <div dangerouslySetInnerHTML={{ __html: `
        <div id="liveApp" style="display: flex; height: 100vh; width: 100vw; background: black;">
            <div id="videoArea" style="flex: 2; position: relative;">
                <video id="remoteVideo" autoplay playsinline style="width: 100%; height: 100%; object-fit: cover;"></video>
                <video id="localVideo" autoplay muted playsinline style="position: absolute; width: 120px; bottom: 20px; right: 20px; border: 2px solid #0ff; border-radius: 8px;"></video>
                <div class="live-controls">
                   <button id="startCamBtn">Start Broadcast</button>
                   <button id="joinStreamBtn">Join Stream</button>
                </div>
            </div>
            
            <div id="chatArea" class="live-chat">
                <h3 style="color: white; border-bottom: 1px solid #333; padding-bottom: 10px;">Live Chat</h3>
                <div id="chatMessages" style="flex: 1; overflow-y: auto; padding: 10px;"></div>
                <div style="display: flex; gap: 10px;">
                    <input type="text" id="chatInput" placeholder="Send a message..." style="flex:1;" />
                    <button id="sendChatBtn">Send</button>
                </div>
            </div>
        </div>
      ` }} />

      <script dangerouslySetInnerHTML={{ __html: `
        let localStream;
        let peerConnection;
        const config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
        const streamId = window.location.pathname.split('/').pop();
        const socket = io('http://localhost:5000');
        
        const localVideo = document.getElementById('localVideo');
        const remoteVideo = document.getElementById('remoteVideo');
        let isBroadcaster = false;

        socket.on('connect', () => {
            socket.emit('join_live', streamId);
        });

        document.getElementById('startCamBtn').onclick = async () => {
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            localVideo.srcObject = localStream;
            isBroadcaster = true;
            setupPeer();
            alert('Broadcasting. Waiting for peers...');
        };

        document.getElementById('joinStreamBtn').onclick = () => {
            isBroadcaster = false;
            setupPeer();
            alert('Joined streaming room');
        };

        function setupPeer() {
            peerConnection = new RTCPeerConnection(config);
            if (localStream) {
                localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
            }

            peerConnection.ontrack = (event) => {
                remoteVideo.srcObject = event.streams[0];
            };

            peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    socket.emit('ice_candidate', { streamId, candidate: event.candidate });
                }
            };

            if (isBroadcaster) {
                peerConnection.createOffer().then(sdp => {
                    peerConnection.setLocalDescription(sdp);
                    socket.emit('offer', { streamId, sdp });
                });
            }
        }

        socket.on('offer', async ({ sdp }) => {
            if (!isBroadcaster && peerConnection) {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
                const answer = await peerConnection.createAnswer();
                await peerConnection.setLocalDescription(answer);
                socket.emit('answer', { streamId, sdp: answer });
            }
        });

        socket.on('answer', async ({ sdp }) => {
            if (isBroadcaster && peerConnection) {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
            }
        });

        socket.on('ice_candidate', async ({ candidate }) => {
            if (peerConnection) {
                await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            }
        });

        // Chat logic
        document.getElementById('sendChatBtn').onclick = () => {
            const text = document.getElementById('chatInput').value;
            const uid = localStorage.getItem('blink_user') || 'Anon';
            if (!text) return;
            socket.emit('live_chat', { streamId, user: 'User ' + uid, text });
            document.getElementById('chatInput').value = '';
        };

        socket.on('live_chat', (data) => {
            const chatBox = document.getElementById('chatMessages');
            chatBox.innerHTML += \`<div style="color: white; margin: 4px 0;"><b>\${data.user}:</b> \${data.text}</div>\`;
            chatBox.scrollTop = chatBox.scrollHeight;
        });
      ` }} />
    </>
  );
}
