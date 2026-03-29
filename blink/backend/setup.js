#!/usr/bin/env node
/**
 * setup.js - Interactive Setup Wizard for Blink
 * Guides user through configuration
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (query) => new Promise(resolve => rl.question(query, resolve));

const envPath = path.join(__dirname, '.env');

(async () => {
    console.log(`
╔════════════════════════════════════════════════════════════╗
║    BLINK v4.0 - INTERACTIVE SETUP WIZARD                   ║
║                                                             ║
║  This will guide you through configuring Blink.           ║
║  Press Ctrl+C to cancel.                                   ║
╚════════════════════════════════════════════════════════════╝
\n`);

    // Check if .env exists
    if (fs.existsSync(envPath)) {
        const overwrite = await question('❓ .env already exists. Overwrite? (y/n): ');
        if (overwrite.toLowerCase() !== 'y') {
            console.log('✅ Keeping existing .env\n');
            rl.close();
            process.exit(0);
        }
    }

    console.log('\n📝 DATABASE CONFIGURATION\n');
    console.log('Enter your MySQL database credentials:');
    console.log('(For Railway: use autorack.proxy.rlwy.net)\n');

    const dbHost = await question('Database Host [localhost]: ') || 'localhost';
    const dbPort = await question('Database Port [3306]: ') || '3306';
    const dbUser = await question('Database User [root]: ') || 'root';
    const dbPassword = await question('Database Password: ');
    const dbName = await question('Database Name [railway]: ') || 'railway';

    console.log('\n🔐 SECURITY CONFIGURATION\n');
    const jwtSecret = await question('JWT Secret (min 32 chars, can be random): ');
    const sessionSecret = await question('Session Secret (can be random): ');

    if (!jwtSecret || jwtSecret.length < 32) {
        console.log('\n❌ JWT Secret must be at least 32 characters!');
        rl.close();
        process.exit(1);
    }

    console.log('\n📸 CLOUDINARY CONFIGURATION (Optional)\n');
    console.log('Leave blank to skip. You can add later for video uploads.\n');
    const cloudinaryName = await question('Cloudinary Cloud Name: ') || '';
    const cloudinaryKey = await question('Cloudinary API Key: ') || '';
    const cloudinarySecret = await question('Cloudinary API Secret: ') || '';

    console.log('\n🌐 CORS CONFIGURATION\n');
    const corsOrigin = await question('CORS Origin [*]: ') || '*';

    // ════════════════════════════════════════════════════════════════════════════
    // GENERATE .ENV FILE
    // ════════════════════════════════════════════════════════════════════════════
    const envContent = `# ═══════════════════════════════════════════════════════════
# BLINK v4.0 - Environment Configuration
# Generated with setup wizard - ${new Date().toISOString()}
# ═══════════════════════════════════════════════════════════

NODE_ENV=production
PORT=5000

# DATABASE (MySQL)
DB_HOST=${dbHost}
DB_PORT=${dbPort}
DB_USER=${dbUser}
DB_PASSWORD=${dbPassword}
DB_NAME=${dbName}

# SECURITY  
JWT_SECRET=${jwtSecret}
SESSION_SECRET=${sessionSecret}

# CLOUDINARY (Optional - for video uploads)
${cloudinaryName ? `CLOUDINARY_NAME=${cloudinaryName}` : '# CLOUDINARY_NAME='}
${cloudinaryKey ? `CLOUDINARY_API_KEY=${cloudinaryKey}` : '# CLOUDINARY_API_KEY='}
${cloudinarySecret ? `CLOUDINARY_API_SECRET=${cloudinarySecret}` : '# CLOUDINARY_API_SECRET='}

# CORS
CORS_ORIGIN=${corsOrigin}

# APP CONFIGURATION
STORY_EXPIRY_HOURS=24
VIDEO_MAX_SIZE_MB=100
COMPRESSION_QUALITY=75
`;

    fs.writeFileSync(envPath, envContent);

    console.log(`
✅ Configuration saved to: .env

╔════════════════════════════════════════════════════════════╗
║              NEXT STEPS                                     ║
╚════════════════════════════════════════════════════════════╝

1️⃣  Setup Database:
   - Create MySQL database
   - Import: blink/db/schema_production.sql
   
   For Railway SQL console:
   $ mysql -h ${dbHost} -u ${dbUser} -p ${dbName} < blink/db/schema_production.sql

2️⃣  Test Configuration:
   $ node check-env.js

3️⃣  Test Database Connection:
   $ npm run test:db

4️⃣  Start Server:
   $ npm start

5️⃣  Open Frontend:
   Open file://.../blink/frontend/index.html in browser

📚 For more info, see:
   - README.md
   - QUICKSTART.md
   - DEPLOYMENT.md

🚀 Installation complete! Ready to launch Blink.
`);

    rl.close();
    process.exit(0);
})().catch(err => {
    console.error('❌ Setup cancelled:', err.message);
    rl.close();
    process.exit(1);
});
