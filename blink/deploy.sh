#!/bin/bash
# ════════════════════════════════════════════════════════════════════════════════
# BLINK DEPLOYMENT SCRIPT - One-Command Deployment
# ════════════════════════════════════════════════════════════════════════════════

set -e

echo "╔════════════════════════════════════════════════════════════╗"
echo "║        BLINK v4.0 - DEPLOYMENT & INITIALIZATION             ║"
echo "╚════════════════════════════════════════════════════════════╝"

# ════════════════════════════════════════════════════════════════════════════════
# STEP 1: Install Backend Dependencies
# ════════════════════════════════════════════════════════════════════════════════
echo ""
echo "📦 Installing backend dependencies..."
cd blink/backend
npm install

# ════════════════════════════════════════════════════════════════════════════════
# STEP 2: Database Setup (requires Railway MySQL connection)
# ════════════════════════════════════════════════════════════════════════════════
echo ""
echo "🗄️  Database setup..."
echo "⚠️  Ensure your .env has correct DB credentials for Railway:"
echo "   - DB_HOST=autorack.proxy.rlwy.net"
echo "   - DB_PORT=3306"
echo "   - DB_USER=root"
echo "   - DB_PASSWORD=<your_railway_password>"
echo "   - DB_NAME=railway"
echo ""
echo "📝 To initialize database, run:"
echo "   1. Copy blink/db/schema_production.sql"
echo "   2. Execute in Railway MySQL console"
echo ""

# ════════════════════════════════════════════════════════════════════════════════
# STEP 3: Environment Configuration
# ════════════════════════════════════════════════════════════════════════════════
echo ""
echo "⚙️  Checking environment configuration..."
if [ -f .env ]; then
    echo "✅ .env file found"
else
    echo "❌ .env file not found. Creating from .env.example..."
    cp .env.example .env
    echo "⚠️  UPDATE .env WITH YOUR CONFIGURATION:"
    echo "   - Cloudinary credentials"
    echo "   - Database credentials"
    echo "   - JWT secret"
fi

# ════════════════════════════════════════════════════════════════════════════════
# STEP 4: Test Connection
# ════════════════════════════════════════════════════════════════════════════════
echo ""
echo "🔗 Testing database connection..."
node -e "
const db = require('./config/db');
db.testConnection().then(result => {
    if (result.success) {
        console.log('✅ ' + result.message);
        process.exit(0);
    } else {
        console.log('❌ ' + result.message);
        process.exit(1);
    }
});
"

# ════════════════════════════════════════════════════════════════════════════════
# STEP 5: Start Server
# ════════════════════════════════════════════════════════════════════════════════
echo ""
echo "🚀 Starting Blink server..."
npm start
