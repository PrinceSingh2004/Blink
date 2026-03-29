# 🚀 BLINK V4.0 - PRODUCTION DEPLOYMENT GUIDE

## ✅ What's Included

- ✅ Complete Backend API (Node.js + Express)
- ✅ Real-time Socket.io (Chat, Live Streaming, Notifications)
- ✅ MySQL Database Schema (Railway-ready)
- ✅ Authentication System (JWT + HTTP-only Cookies)
- ✅ Cloudinary Integration (Video Upload)
- ✅ Frontend (Vanilla HTML/CSS/JS)
- ✅ Auto port fallback (No EADDRINUSE crashes)
- ✅ Rate limiting (Brute force protection)
- ✅ Glassmorphism UI (Dark theme)

---

## 📋 QUICK START

### 1. Clone & Install

```bash
cd blink/backend
npm install
```

### 2. Configure Environment

Create `.env` file:

```env
NODE_ENV=production
PORT=5000

# Railway MySQL
DB_HOST=autorack.proxy.rlwy.net
DB_PORT=3306
DB_USER=root
DB_PASSWORD=<your_password>
DB_NAME=railway

# Security
JWT_SECRET=your_super_secret_key_min32_chars
SESSION_SECRET=your_session_secret_key

# Cloudinary
CLOUDINARY_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# CORS
CORS_ORIGIN=*
```

### 3. Database Setup

1. Log into Railway MySQL console
2. Create database: `CREATE DATABASE railway;`
3. Run migration: Import `blink/db/schema_production.sql`

```bash
# Using MySQL client:
mysql -h autorack.proxy.rlwy.net -u root -p railway < blink/db/schema_production.sql
```

### 4. Start Server

```bash
npm start
# Server runs on http://localhost:5000 (or auto-fallback port)
```

---

## 🔐 SECURITY FEATURES

- ✅ **JWT Authentication** - 30-day tokens in HTTP-only cookies
- ✅ **Rate Limiting** - 5 auth attempts per 15 minutes
- ✅ **Password Hashing** - bcryptjs (10 salt rounds)
- ✅ **CORS Protection** - Configurable origins
- ✅ **Helmet Security Headers** - XSS, clickjacking protection
- ✅ **Input Validation** - All user inputs validated
- ✅ **SQL Injection Prevention** - Parameterized queries

---

## 📡 API ENDPOINTS

### Authentication
- `POST /api/auth/register` - Create account
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Get current user
- `POST /api/auth/logout` - Logout

### Users
- `GET /api/users/profile/:username` - Get user profile
- `PUT /api/users/profile` - Update profile
- `POST /api/users/follow/:userId` - Follow user
- `POST /api/users/unfollow/:userId` - Unfollow user
- `GET /api/users/:userId/followers` - Get followers
- `GET /api/users/search?q=query` - Search users

### Videos
- `GET /api/posts/feed` - Get video feed
- `POST /api/posts/upload` - Upload video
- `POST /api/posts/:videoId/like` - Like video
- `POST /api/posts/:videoId/unlike` - Unlike video
- `POST /api/posts/:videoId/comment` - Add comment
- `GET /api/posts/:videoId/comments` - Get comments
- `DELETE /api/posts/:videoId` - Delete video

### Messages (Real-time via Socket.io)
- `GET /api/messages/list` - Get conversations
- `GET /api/messages/conversation/:userId` - Get conversation history

### Live Streaming (Real-time via Socket.io)
- `GET /api/live/active` - Get active streams
- `GET /api/live/:streamId` - Get stream details
- `GET /api/live/user/:username` - Get user's streams

---

## 🔌 SOCKET.IO EVENTS

### Messaging
- `sendMessage` - Send direct message
- `newMessage` - Receive message (broadcast)
- `messageSent` - Confirm delivery

### Live Streaming
- `startStream` - Start broadcasting
- `joinStream` - Join stream viewer
- `endStream` - Stop broadcasting
- `viewerJoined` - Notify stream of new viewer

### WebRTC Signaling
- `webrtc-offer` - WebRTC offer
- `webrtc-answer` - WebRTC answer
- `webrtc-ice-candidate` - ICE candidate

### Notifications
- `notification` - Receive in-app notification
- `likeNotification` - Someone liked your video
- `followNotification` - Someone followed you

---

## 🐛 TROUBLESHOOTING

### "EADDRINUSE" Error
**Fixed automatically** - Server tries next 10 ports

### Database Connection Failed
1. Check credentials in `.env`
2. Verify Railway MySQL is running
3. Allow your IP in Railway firewall
4. Test with: `npm run test:db`

### Cloudinary Upload Fails
1. Verify credentials in `.env`
2. Check Cloudinary dashboard for API key
3. Ensure account has upload permission

### Socket.io Not Connecting
1. Check CORS settings in `.env`
2. Verify Socket.io URL matches backend URL
3. Check browser console for errors

### JWT Token Invalid
1. Regenerate `JWT_SECRET` in `.env`
2. Clear browser localStorage: `localStorage.clear()`
3. Re-login to get new token

---

## 📊 PERFORMANCE

- Infinite scroll optimized for mobile
- Lazy loading for videos
- CDN delivery via Cloudinary
- Database connection pooling (10 connections)
- Gzip compression enabled
- Response caching headers

---

## 🚀 DEPLOYMENT TO PRODUCTION

### Railway Deployment

```bash
# 1. Push to GitHub
git add .
git commit -m "Blink v4.0 production"
git push

# 2. Connect to Railway
railway link

# 3. Configure environment on Railway dashboard
# 4. Deploy
railway up
```

### Environment on Railway
- Set all `.env` variables in Railway dashboard
- Database: Connect to Railway MySQL

### Monitoring
- Check logs: `railway logs`
- Monitor usage: Railway dashboard
- Error tracking: Setup Sentry integration

---

## 📱 FRONTEND DEPLOYMENT

### Public Folder
Place all HTML/CSS/JS files in `/blink/frontend/`

### Static Server
Add to server.js:
```javascript
app.use(express.static(path.join(__dirname, '../frontend')));
```

### CDN Optimization
1. Images hosted on Cloudinary
2. Videos delivered via CDN
3. CSS/JS precompressed (gzip)

---

## ✨ FEATURES INCLUDED

### Core Features
- ✅ User Authentication & Authorization
- ✅ Profile Management
- ✅ Video Upload & Streaming
- ✅ Infinite Scroll Feed
- ✅ Like & Comment System
- ✅ Follow/Unfollow
- ✅ Direct Messaging
- ✅ Live Streaming
- ✅ Real-time Notifications
- ✅ User Search

### UI/UX
- ✅ Dark theme with gradient accents
- ✅ Glassmorphism design
- ✅ Mobile-first responsive
- ✅ Smooth animations
- ✅ Loading skeletons
- ✅ Error handling

### Performance
- ✅ Database connection pooling
- ✅ Query optimization
- ✅ Lazy loading
- ✅ CDN delivery
- ✅ Response compression

---

## 🔧 MAINTENANCE

### Database Cleanup
```bash
# Remove expired stories (24 hours)
DELETE FROM stories WHERE expires_at < NOW();

# Cleanup old notifications
DELETE FROM notifications WHERE created_at < DATE_SUB(NOW(), INTERVAL 30 DAY);
```

### Monitor Metrics
- Active users (online_users table)
- Stream viewers (live_viewers table)
- Disk usage (Cloudinary dashboard)
- Database growth

---

## 📞 SUPPORT

For issues:
1. Check logs: `npm run logs` or Railway logs
2. Test API: `curl http://localhost:5000/health`
3. Verify database connection: Check MySQL
4. Check browser console for frontend errors

---

## 📄 LICENSE

Blink v4.0 - Production Ready Social Platform

---

**Last Updated:** March 29, 2026
**Status:** ✅ Production Ready
