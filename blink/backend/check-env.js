#!/usr/bin/env node
/**
 * check-env.js - Environment & Dependencies Verification
 * Run: node check-env.js
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

console.log(`
╔════════════════════════════════════════════════════════════╗
║        BLINK v4.0 - ENVIRONMENT VERIFICATION               ║
╚════════════════════════════════════════════════════════════╝
\n`);

let passed = 0;
let failed = 0;
let warnings = 0;

const check = (name, condition, message) => {
    if (condition) {
        console.log(`✅ ${name}`);
        if (message) console.log(`   ${message}\n`);
        passed++;
    } else {
        console.log(`❌ ${name}`);
        if (message) console.log(`   ${message}\n`);
        failed++;
    }
};

const warn = (name, message) => {
    console.log(`⚠️  ${name}`);
    if (message) console.log(`   ${message}\n`);
    warnings++;
};

// ════════════════════════════════════════════════════════════════════════════════
// 1. NODE VERSION
// ════════════════════════════════════════════════════════════════════════════════
console.log('📦 Node.js Version Check');
const nodeVersion = process.version;
const majorVersion = parseInt(nodeVersion.split('.')[0].substring(1));
check(
    `Node.js v${majorVersion}+`,
    majorVersion >= 18,
    `Current: ${nodeVersion}`
);

// ════════════════════════════════════════════════════════════════════════════════
// 2. REQUIRED ENV VARIABLES
// ════════════════════════════════════════════════════════════════════════════════
console.log('\n📝 Environment Variables');
const required = {
    'DB_HOST': 'Database host (e.g., autorack.proxy.rlwy.net)',
    'DB_USER': 'Database user (e.g., root)',
    'DB_PASSWORD': 'Database password',
    'DB_NAME': 'Database name (e.g., railway)',
    'JWT_SECRET': 'JWT secret (min 32 characters)'
};

Object.entries(required).forEach(([key, desc]) => {
    const value = process.env[key];
    if (key === 'JWT_SECRET') {
        check(
            `${key}`,
            value && value.length >= 32,
            value ? `Length: ${value.length}` : `MISSING - Required for security`
        );
    } else {
        check(
            `${key}`,
            !!value,
            value ? `✓ Set` : `MISSING - ${desc}`
        );
    }
});

// ════════════════════════════════════════════════════════════════════════════════
// 3. OPTIONAL ENV VARIABLES
// ════════════════════════════════════════════════════════════════════════════════
console.log('🎨 Optional Environment Variables');
const optional = {
    'CLOUDINARY_NAME': 'Cloudinary cloud name (for media uploads)',
    'CLOUDINARY_API_KEY': 'Cloudinary API key',
    'CLOUDINARY_API_SECRET': 'Cloudinary API secret',
    'CORS_ORIGIN': 'CORS allowed origin'
};

Object.entries(optional).forEach(([key, desc]) => {
    if (process.env[key]) {
        check(`${key}`, true, '✓ Configured');
    } else {
        warn(`${key}`, `Optional - ${desc}`);
    }
});

// ════════════════════════════════════════════════════════════════════════════════
// 4. FILES EXISTENCE
// ════════════════════════════════════════════════════════════════════════════════
console.log('\n📂 Required Files');
const files = [
    'server.js',
    'config/db.js',
    'routes/auth.js',
    'middleware/auth.js'
];

files.forEach(file => {
    const exists = fs.existsSync(path.join(__dirname, file));
    check(`${file}`, exists);
});

// ════════════════════════════════════════════════════════════════════════════════
// 5. NPM PACKAGES
// ════════════════════════════════════════════════════════════════════════════════
console.log('\n📚 NPM Packages');
const packages = [
    'express',
    'mysql2',
    'jsonwebtoken',
    'bcryptjs',
    'socket.io',
    'dotenv'
];

packages.forEach(pkg => {
    try {
        require.resolve(pkg);
        check(`${pkg}`, true);
    } catch {
        warn(`${pkg}`, 'Not installed. Run: npm install');
    }
});

// ════════════════════════════════════════════════════════════════════════════════
// SUMMARY
// ════════════════════════════════════════════════════════════════════════════════
console.log(`
╔════════════════════════════════════════════════════════════╗
║                    VERIFICATION SUMMARY                    ║
╚════════════════════════════════════════════════════════════╝
`);

console.log(`✅ Passed:  ${passed}`);
console.log(`❌ Failed:  ${failed}`);
console.log(`⚠️  Warned: ${warnings}\n`);

if (failed === 0) {
    if (warnings > 0) {
        console.log('🟡 Some optional features may not work. The app will still run.\n');
    } else {
        console.log('🟢 All systems ready! Run: npm start\n');
    }
    process.exit(0);
} else {
    console.log('🔴 Fix the errors above before starting the server.\n');
    process.exit(1);
}
