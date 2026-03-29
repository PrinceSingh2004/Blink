/**
 * startup-check.js
 * ═══════════════════════════════════════════════════════════════════════════════
 * Pre-flight checks before starting Blink server
 * ═══════════════════════════════════════════════════════════════════════════════
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

console.log(`
╔════════════════════════════════════════════════════════════╗
║         BLINK v4.0 - STARTUP VERIFICATION                  ║
╚════════════════════════════════════════════════════════════╝
`);

let errors = [];
let warnings = [];
let passed = 0;

// ════════════════════════════════════════════════════════════════════════════════
// CHECK 1: Environment Variables
// ════════════════════════════════════════════════════════════════════════════════
console.log('🔍 Checking environment variables...');

const required = [
    'DB_HOST',
    'DB_USER',
    'DB_PASSWORD',
    'DB_NAME',
    'JWT_SECRET'
];

const optional = [
    'CLOUDINARY_NAME',
    'CLOUDINARY_API_KEY',
    'CLOUDINARY_API_SECRET'
];

required.forEach(key => {
    if (process.env[key]) {
        console.log(`  ✅ ${key}`);
        passed++;
    } else {
        errors.push(`Missing required environment variable: ${key}`);
        console.log(`  ❌ ${key}`);
    }
});

optional.forEach(key => {
    if (process.env[key]) {
        console.log(`  ✅ ${key}`);
    } else {
        warnings.push(`Optional variable not set: ${key}`);
        console.log(`  ⚠️  ${key} (optional)`);
    }
});

// ════════════════════════════════════════════════════════════════════════════════
// CHECK 2: File Structure
// ════════════════════════════════════════════════════════════════════════════════
console.log('\n🔍 Checking file structure...');

const requiredFiles = [
    'server.js',
    'config/db.js',
    'routes/auth.js',
    'routes/postRoutes.js',
    'routes/userRoutes.js',
    'routes/messageRoutes.js',
    'routes/liveRoutes.js',
    'middleware/auth.js',
    'socket/socketHandler.js',
    'controllers/authController.js'
];

requiredFiles.forEach(file => {
    const filePath = path.join(__dirname, file);
    if (fs.existsSync(filePath)) {
        console.log(`  ✅ ${file}`);
        passed++;
    } else {
        errors.push(`Missing critical file: ${file}`);
        console.log(`  ❌ ${file}`);
    }
});

// ════════════════════════════════════════════════════════════════════════════════
// CHECK 3: Dependencies
// ════════════════════════════════════════════════════════════════════════════════
console.log('\n🔍 Checking dependencies...');

const requiredPackages = [
    'express',
    'mysql2',
    'jsonwebtoken',
    'bcryptjs',
    'socket.io',
    'cloudinary'
];

requiredPackages.forEach(pkg => {
    try {
        require(pkg);
        console.log(`  ✅ ${pkg}`);
        passed++;
    } catch {
        warnings.push(`Package not installed: ${pkg}. Run: npm install`);
        console.log(`  ⚠️  ${pkg}`);
    }
});

// ════════════════════════════════════════════════════════════════════════════════
// CHECK 4: Database Connection
// ════════════════════════════════════════════════════════════════════════════════
console.log('\n🔍 Checking database connection...');

const db = require('./config/db');
db.testConnection().then(result => {
    if (result.success) {
        console.log(`  ✅ Database connected: ${result.message}`);
        passed++;
    } else {
        errors.push(`Database connection failed: ${result.message}`);
        console.log(`  ❌ ${result.message}`);
    }
    
    // ════════════════════════════════════════════════════════════════════════════
    // SUMMARY
    // ════════════════════════════════════════════════════════════════════════════
    console.log(`
╔════════════════════════════════════════════════════════════╗
║                    CHECKUP SUMMARY                         ║
╚════════════════════════════════════════════════════════════╝
    `);
    
    if (errors.length === 0) {
        console.log(`✅ All checks passed! (${passed} items verified)`);
        if (warnings.length > 0) {
            console.log(`\n⚠️  ${warnings.length} warnings:`);
            warnings.forEach(w => console.log(`   - ${w}`));
        }
        console.log(`\n🚀 Ready to start server with: npm start\n`);
        process.exit(0);
    } else {
        console.log(`❌ ${errors.length} critical error(s):`);
        errors.forEach(e => console.log(`   ❌ ${e}`));
        
        if (warnings.length > 0) {
            console.log(`\n⚠️  ${warnings.length} warnings:`);
            warnings.forEach(w => console.log(`   - ${w}`));
        }
        
        console.log(`\n📝 Fix the errors above and try again.\n`);
        process.exit(1);
    }
}).catch(err => {
    console.log(`  ❌ Database check failed: ${err.message}`);
    console.log(`\n🛑 Cannot proceed without database connection\n`);
    process.exit(1);
});
