# ⚡ BLINK v4.0 - 5 MINUTE QUICKSTART

## 🎯 ONE-COMMAND SETUP

```bash
# 1. Open terminal in blink/backend
cd blink/backend

# 2. Install + Run
npm install && npm start
```

Done! Server runs on port 5000 (auto-fallback if in use).

---

## ⚙️ BEFORE YOU START - Configure These 3 Things

### 1. Database (Railway or Local MySQL)
Create a MySQL database and note these credentials:
- Host: (e.g., autorack.proxy.rlwy.net for Railway)
- Port: (e.g., 3306)
- User: (e.g., root)
- Password: (your password)
- Database: (e.g., railway)

### 2. Environment File
Edit `blink/backend/.env`:
```env
DB_HOST=your_host
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=railway
JWT_SECRET=makeThis32CharactersLongMinimum1234567890

# Optional - for video uploads
CLOUDINARY_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_key
CLOUDINARY_API_SECRET=your_secret
```

### 3. Database Schema
Run this SQL script in your MySQL client:
```bash
# Copy contents of: blink/db/schema_production.sql
# Paste into MySQL console or Railway SQL editor
```

---

## ✅ START SERVER

```bash
cd blink/backend
npm install
npm start
```

You should see:
```
╔════════════════════════════════════════════════════════════╗
║   🚀 BLINK v4.0 - PRODUCTION SERVER ONLINE                ║
║   Port: 5000
║   Environment: production
╚════════════════════════════════════════════════════════════╝
```

---

## 🌐 TEST IT WORKS

```bash
# In another terminal:

# Test health
curl http://localhost:5000/health

# Test registration
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "email": "test@example.com",
    "password": "password123",
    "confirmPassword": "password123"
  }'

# Test login
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'
```

---

## 🎨 OPEN FRONTEND

Open in browser: `file:///path/to/blink/frontend/index.html`

Or use live server:
```bash
cd blink/frontend
npx serve .
```

Then visit: `http://localhost:3000`

Update frontend config in `js/config.js` if backend URL is different.

---

## 🚀 DEPLOY TO PRODUCTION

### Railway
```bash
git init
git add .
git commit -m "Blink deployment"
# Push to Railway...
```

### Heroku
```bash
heroku create blink-app
git push heroku main
heroku config:set JWT_SECRET=your_secret
```

### VPS / Own Server  
```bash
npm install -g pm2
pm2 start server.js --name "blink"
pm2 save
pm2 startup
```

---

## 🆘 TROUBLESHOOTING

| Problem | Solution |
|---------|----------|
| Port already in use | ✅ Auto-fallback enabled, try next port |
| Database won't connect | Check .env credentials, test with `npm run test:db` |
| "Unauthorized" errors | Get JWT token from login, include in Authorization header |
| Cloudinary errors | Check API key/secret, ensure account is active |
| Socket.io not connecting | Update `js/config.js` with correct backend URL |

---

## 📚 DOCS

- Full guide: [README.md](./README.md)
- API reference: [DEPLOYMENT.md](./DEPLOYMENT.md)  
- Database schema: [schema_production.sql](./db/schema_production.sql)

---

## 🎉 YOU'RE READY!

Your complete social platform is live. Start building! 🚀
