╔═════════════════════════════════════════════════════════════════════════════╗
║     BLINK v4.0 - PRODUCTION DEPLOYMENT & SETUP GUIDE                      ║
║     Instagram/YouTube Shorts Clone - Complete Backend & Frontend           ║
╚═════════════════════════════════════════════════════════════════════════════╝

═══════════════════════════════════════════════════════════════════════════════
1. QUICK START (5 MINUTES)
═══════════════════════════════════════════════════════════════════════════════

Step 1: Verify Backend is Running
──────────────────────────────────
✓ Open: https://blink-yzoo.onrender.com/
✓ Should see: { "status": "online", "message": "🚀 Blink Backend is Live" }

Step 2: Configure Frontend
──────────────────────────
✓ Frontend auto-detects environment
  - localhost → http://localhost:5000
  - Production → https://blink-yzoo.onrender.com

Step 3: Test HTTP Roots
───────────────────────
✓ Root: https://blink-yzoo.onrender.com/
✓ Health: https://blink-yzoo.onrender.com/health
✓ OpenAPI: https://blink-yzoo.onrender.com/api/...

═══════════════════════════════════════════════════════════════════════════════
2. BACKEND ARCHITECTURE
═══════════════════════════════════════════════════════════════════════════════

Server Structure:
─────────────────
blink/backend/
├── server.js                 → Main Express app (Port fallback 5000-5009)
├── config/
│   ├── db.js                → MySQL connection (Railway SSL)
│   └── cloudinary.js        → Media upload config
├── controllers/
│   ├── authController.js    → JWT + Rate limiting
│   ├── uploadController.js  → Video compression with ffmpeg
│   ├── videoController.js   → Feed, likes, comments
│   ├── userController.js    → Profiles, follow/unfollow
│   ├── messageController.js → Direct messaging
│   └── ...
├── routes/
│   ├── auth.js
│   ├── postRoutes.js
│   ├── userRoutes.js
│   ├── messageRoutes.js
│   ├── liveRoutes.js
│   └── uploadRoutes.js
├── middleware/
│   ├── auth.js              → JWT verification
│   ├── errorMiddleware.js   → Global error handler
│   └── uploadMiddleware.js  → Multipart handling
├── socket/
│   └── socketHandler.js     → Real-time WebSocket events
└── db/
    └── schema_production.sql → 13 MySQL tables

Key Features:
─────────────
✓ Auto port fallback (prevents EADDRINUSE crashes)
✓ Global rate limiting (1000 requests/15min)
✓ Auth rate limiting (5 attempts/15min per IP+email)
✓ 100MB body size limit
✓ CORS enabled for all origins
✓ Helmet security headers
✓ Graceful shutdown on SIGTERM/SIGINT
✓ Socket.io for real-time features

═══════════════════════════════════════════════════════════════════════════════
3. CRITICAL ENDPOINTS
═══════════════════════════════════════════════════════════════════════════════

AUTHENTICATION
──────────────
POST /api/auth/register
  Body: { username, email, password, confirmPassword }
  Response: { success, token, user }

POST /api/auth/login
  Body: { email, password }
  Response: { success, token, user }

GET /api/auth/me (Protected)
  Response: { userId, username, email, profile_pic }

POST /api/auth/logout (Protected)
  Response: { success, message }

VIDEO UPLOAD (NEW)
──────────────────
POST /api/upload/video (Protected, Auth Required)
  Body: { video: "data:video/mp4;base64,..." , caption, hashtags, mood_category }
  Response: { success, video: { id, video_url, thumbnail_url, duration } }
  
  Features:
  - Auto ffmpeg compression (reduces bitrate, optimizes resolution)
  - Cloudinary CDN delivery
  - Auto thumbnail generation
  - Database persistence
  - Progress tracking

FEED / VIDEOS
─────────────
GET /api/posts/feed?limit=10&offset=0
  Response: { videos: [...], hasMore: boolean }
  Features: Infinite scroll, auto-play ready, user avatars

POST /api/posts/:videoId/like (Protected)
  Response: { success, likes_count }

POST /api/posts/:videoId/comment (Protected)
  Body: { comment_text }
  Response: { success, comment }

PROFILE
───────
GET /api/users/profile/:username
  Response: { profile_pic, bio, followers_count, posts_count, ... }

POST /api/users/profile-pic (Protected)
  Body: { image: "data:image/jpeg;base64,..." }
  Response: { success, profile_pic }

POST /api/users/follow/:userId (Protected)
  Response: { success, isFollowing }

LIVE STREAMING
──────────────
GET /api/live/active
  Response: { streams: [...] }

POST /api/live/start (Socket.io event)
  Response: { streamId, roomName }

MESSAGES
────────
GET /api/messages/list
  Response: { conversations: [...] }

GET /api/messages/conversation/:userId?limit=50
  Response: { messages: [...] }

(Real-time via Socket.io: send-message, receive-message)

═══════════════════════════════════════════════════════════════════════════════
4. FRONTEND INTEGRATION
═══════════════════════════════════════════════════════════════════════════════

Auto Environment Detection (js/config.js):
────────────────────────────────────────────
✓ localhost:3000 → http://localhost:5000/api
✓ production.com → https://blink-yzoo.onrender.com/api

HTML Files to Include:
───────────────────────
✓ Socket.io script: <script src="https://cdn.socket.io/4.8.3/socket.io.min.js"></script>
✓ Config: <script src="js/config.js"></script>
✓ Upload module: <script src="js/upload.js"></script>
✓ Live module: <script src="js/live_webrtc.js"></script>
✓ Messaging: <script src="js/messages_realtime.js"></script>
✓ Feed: <script src="js/feed.js"></script>
✓ Profile: <script src="js/profile_v2.js"></script>

Upload UI Example:
───────────────────
<form id="upload-form">
    <input type="file" id="video-input" accept="video/*">
    <textarea id="caption" placeholder="Add caption..." required></textarea>
    <input type="text" name="hashtags" placeholder="Add hashtags">
    <select name="mood_category">
        <option>General</option>
        <option>Happy</option>
        <option>Funny</option>
    </select>
    <button type="submit">Upload</button>
    <div class="progress-bar"></div>
</form>

JavaScript Integration:
────────────────────────
// Upload video
await window.BlinkConfig.fetch('/upload/video', {
    method: 'POST',
    body: JSON.stringify({
        video: base64String,
        caption: "My video",
        hashtags: "#blink #tiktok"
    })
});

// Send message
window.BlinkMessenger.sendMessage(userId, "Hello!");

// Start stream
await window.BlinkStreamer.startStream();

═══════════════════════════════════════════════════════════════════════════════
5. DATABASE SETUP
═══════════════════════════════════════════════════════════════════════════════

Import Schema:
───────────────
mysql -h gondola.proxy.rlwy.net -u root -p[PASSWORD] railway < blink/db/schema_production.sql

Or via Railway Dashboard:
├── Go to Database → Query Editor
├── Copy schema_production.sql content
├── Execute

Tables Created:
────────────────
1.  users (Profiles, auth)
2.  followers (Follow relationships)
3.  videos (Reels/feed posts)
4.  video_likes (Like tracking)
5.  comments (Video comments)
6.  messages (Direct chat)
7.  live_streams (Stream metadata)
8.  live_viewers (Stream viewers)
9.  stories (Temporary stories)
10. notifications (Real-time alerts)
11. saved_videos (User favorites)
12. auth_attempts (Rate limiting)
13. blocked_users (Blocking feature)

═══════════════════════════════════════════════════════════════════════════════
6. ENVIRONMENT CONFIGURATION
═══════════════════════════════════════════════════════════════════════════════

Required .env Variables:
───────────────────────
NODE_ENV=production
PORT=5000
DB_HOST=gondola.proxy.rlwy.net
DB_PORT=49958
DB_USER=root
DB_PASSWORD=amqaIPgfqVXPpRfATpvNArAPnBnuUHPJ
DB_NAME=railway
JWT_SECRET=blink_super_secret_jwt_key_2026_production_12345 (min 32 chars)
CLOUDINARY_NAME=dvnvx42na
CLOUDINARY_API_KEY=949983528816724
CLOUDINARY_API_SECRET=5X-dHAaOU4GEPmiJmy2xrvOGQ0U
CORS_ORIGIN=*

Cloudinary Setup:
──────────────────
1. Sign up: https://cloudinary.com
2. Copy Cloud Name, API Key, API Secret
3. Add to .env
4. Images stored in: cloud_name/blink/avatars
5. Videos stored in: cloud_name/blink/reels
6. Auto compression & CDN delivery

═══════════════════════════════════════════════════════════════════════════════
7. TESTING ENDPOINTS
═══════════════════════════════════════════════════════════════════════════════

Test Root Route:
─────────────────
curl https://blink-yzoo.onrender.com/

Test Health Check:
────────────────────
curl https://blink-yzoo.onrender.com/health

Register User:
────────────────
curl -X POST https://blink-yzoo.onrender.com/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "email": "test@example.com",
    "password": "password123",
    "confirmPassword": "password123"
  }'

Login:
──────
curl -X POST https://blink-yzoo.onrender.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'

Get Feed:
──────────
curl https://blink-yzoo.onrender.com/api/posts/feed?limit=10

With Authentication:
────────────────────
curl https://blink-yzoo.onrender.com/api/auth/me \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

═══════════════════════════════════════════════════════════════════════════════
8. TROUBLESHOOTING
═══════════════════════════════════════════════════════════════════════════════

"Route not found: GET /"
──────────────────────────
✓ FIXED: Root route now returns { status: "online", ... }
✓ Check: https://blink-yzoo.onrender.com/

"EADDRINUSE: Port already in use"
──────────────────────────────────
✓ FIXED: Auto port fallback (tries 5000-5009)
✓ Logs will show: "Port 5000 in use, trying 5001..."

"Unauthorized - Invalid token"
────────────────────────────────
✓ Token expired? Generate new via /api/auth/login
✓ Check JWT_SECRET is set correctly
✓ Token format: Bearer `tokenhere` (space required)

"CORS blocked request"
──────────────────────
✓ FIXED: CORS enabled for all origins (origin: "*")
✓ Credentials: true for cookies

"Video upload fails"
─────────────────────
✓ Check max size: 500MB limit (set in body parser)
✓ Check Cloudinary credentials in .env
✓ ffmpeg must be available on platform

"Socket.io "Connecting..." never resolves"
──────────────────────────────────────────
✓ FIXED: Improved WebRTC signaling
✓ Check ICE servers configured
✓ Verify Socket.io connected (console logs)

"Database connection refused"
──────────────────────────────
✓ Check DB_HOST, DB_PORT, DB_USER, DB_PASSWORD
✓ Verify Railway database is active
✓ Check connection pooling (10 max connections)

═══════════════════════════════════════════════════════════════════════════════
9. MONITORING & DEBUGGING
═══════════════════════════════════════════════════════════════════════════════

Enable Logging:
────────────────
NODE_DEBUG=* npm start  # Enable all debug logs

Check Server Logs:
────────────────────
# On Render Dashboard: Logs section
# Shows startup info, connected users, errors, etc.

Monitor Database:
──────────────────
# Railway Dashboard → Database → Query Editor
# Check table sizes, run performance queries

WebSocket Status:
──────────────────
# Browser DevTools → Network → WS
# Monitor Socket.io connections

═══════════════════════════════════════════════════════════════════════════════
10. PERFORMANCE OPTIMIZATION
═══════════════════════════════════════════════════════════════════════════════

Database Queries:
──────────────────
✓ All queries use indexes on frequently accessed columns
✓ Full-text search on captions and hashtags
✓ Connection pooling (10 connections)
✓ Keep-alive enabled

Frontend:
──────────
✓ Lazy loading images/videos
✓ Infinite scroll pagination
✓ Service workers for caching
✓ CDN for static assets

Video Delivery:
────────────────
✓ Cloudinary auto compression
✓ Auto format selection (q_auto, f_auto)
✓ Responsive images
✓ Thumbnail generation

API Caching:
──────────────
✓ 30-day JWT token expiration
✓ HTTP-only cookies for security
✓ Redis support (optional future)

═══════════════════════════════════════════════════════════════════════════════
11. SECURITY CHECKLIST
═══════════════════════════════════════════════════════════════════════════════

✓ JWT tokens (30-day expiration)
✓ HTTP-only cookies
✓ Password hashing (bcryptjs, 10 salt rounds)
✓ Rate limiting (auth: 5/15min)
✓ CORS configured
✓ Helmet security headers
✓ SQL injection prevention (parameterized queries)
✓ Input validation (email, password, username)
✓ Cloudinary SSL/TLS
✓ Railway database SSL

═══════════════════════════════════════════════════════════════════════════════
12. DEPLOYMENT CHECKLIST
═══════════════════════════════════════════════════════════════════════════════

Pre-Deployment:
────────────────
✓ Test all endpoints locally
✓ Verify .env variables
✓ Check database schema imported
✓ Test file uploads
✓ Test Socket.io connections

Render Deployment:
────────────────────
✓ Connect GitHub repo
✓ Set root directory: blink/backend
✓ Start command: node server.js
✓ Add environment variables
✓ Enable auto-deploy on push

Post-Deployment:
─────────────────
✓ Test live backend: https://blink-yzoo.onrender.com/
✓ Test all API endpoints
✓ Monitor logs for errors
✓ Test frontend connection
✓ Test Socket.io events
✓ Monitor Render dashboard

═══════════════════════════════════════════════════════════════════════════════
13. NEXT STEPS
═══════════════════════════════════════════════════════════════════════════════

Immediate:
───────────
1. Run: npm install (if not done)
2. Create .env file with credentials
3. Import database schema
4. Start server: npm start
5. Test root route: curl localhost:5000

Testing:
─────────
1. Register new user via POST /api/auth/register
2. Login via POST /api/auth/login
3. Upload video via POST /api/upload/video
4. Check Cloudinary for uploaded files
5. Test Socket.io real-time features

Deployment:
────────────
1. Push to GitHub
2. Connect to Render
3. Set environment variables
4. Deploy and monitor logs
5. Test production backend

═══════════════════════════════════════════════════════════════════════════════
SUPPORT & DOCUMENTATION
═══════════════════════════════════════════════════════════════════════════════

API Documentation: See FINAL_DELIVERY.md
Deployment Guide: See DEPLOYMENT.md
Quick Start: See QUICKSTART.md
Main README: See README.md

═══════════════════════════════════════════════════════════════════════════════
Last Updated: March 29, 2026
Version: 4.0.0
Status: Production Ready ✅
═══════════════════════════════════════════════════════════════════════════════
