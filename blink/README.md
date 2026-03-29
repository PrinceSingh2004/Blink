# Blink Project Setup Guide

This project has been fully rebuilt from scratch while preserving your customized frontend exactly as it was. The backend has been completely replaced with a clean, high-performance Node.js/Express server that natively handles the required APIs, ensuring zero dependency conflicts (no `multer-storage-cloudinary` ERESOLVE issues) by streaming buffers straight to Cloudinary.

## Prerequisites
- Node.js (v18+)
- MySQL Database (Railway or Local)
- Cloudinary Account

---

## 💾 1. Database Setup (MySQL)
The necessary table definitions perfectly match the requirements of your frontend's REST calls.
1. Create a MySQL database (e.g., on Railway)
2. Execute the included completely re-written SQL script:
   ```bash
   # From your SQL Client or Railway Dashboard, run the schema file:
   # blink/database/schema.sql
   ```

## ⚙️ 2. Backend Setup
The backend is a robust REST API equipped with Socket.io WebRTC signaling.
1. CD into the backend folder:
   ```bash
   cd backend/
   ```
2. Install dependencies (Clean install, verified compatible package layout):
   ```bash
   npm install
   ```
3. Setup Environment Variables:
   Open `backend/.env` and update the placeholders with your actual Cloudinary API keys and Railway DB credentials.
   (e.g., set `DB_HOST=containers-us-west.railway.app`)

4. **Start the API server**:
   ```bash
   npm run dev
   ```
   *Your backend server is now listening at `http://localhost:5000`.*

---

## 🎨 3. Frontend Setup
Because your frontend uses beautiful Vanilla HTML, CSS, and JS exclusively, there is absolutely zero compiling required! No React, No Docker. We kept exactly what you had.

1. CD into the frontend folder or simply open your editor's Live Server:
   ```bash
   cd frontend/
   npx serve .
   ```
*(Or simply double click/Open with Live Server on `frontend/index.html`!)*

### ✨ Live Streaming Setup Details
For your `live.html` interface, make sure to grant your browser hardware permissions! Socket.IO on the new Node.JS runtime seamlessly acts as an SFU or P2P Signaling mechanism matching your original `Js/sfu_extensions.js` requirements. 

Because we added dynamic API stripping middleware on the server (`app.use((req, res, next) => req.url.replace(/^\/api\/api\//, '/api/'))`), the frontend's original hardcoded combinations (`fetch(API + '/auth/me')` vs `/api/auth/me`) will smoothly redirect into the correct Express endpoints automatically!
