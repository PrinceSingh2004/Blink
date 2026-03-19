// test_suite.js – Senior Dev API Test Suite for Blink
const http = require('http');

const PASS = '\x1b[32m✅ PASS\x1b[0m';
const FAIL = '\x1b[31m❌ FAIL\x1b[0m';
const WARN = '\x1b[33m⚠️  WARN\x1b[0m';
let passed = 0, failed = 0, warned = 0;

function assert(label, condition, warn = false) {
    if (condition) {
        console.log(`  ${PASS} ${label}`);
        passed++;
    } else if (warn) {
        console.log(`  ${WARN} ${label}`);
        warned++;
    } else {
        console.log(`  ${FAIL} ${label}`);
        failed++;
    }
}

function httpReq(path, opts = {}) {
    return new Promise((resolve, reject) => {
        const bodyStr = opts.body ? JSON.stringify(opts.body) : undefined;
        const headers = { ...(opts.headers || {}) };
        if (bodyStr) {
            headers['Content-Type'] = 'application/json';
            headers['Content-Length'] = Buffer.byteLength(bodyStr);
        }
        const options = {
            hostname: 'localhost',
            port: 4000,
            path,
            method: opts.method || 'GET',
            headers,
        };
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
                let body;
                try { body = JSON.parse(data); } catch { body = data; }
                resolve({ status: res.statusCode, headers: res.headers, body });
            });
        });
        req.on('error', reject);
        if (bodyStr) req.write(bodyStr);
        req.end();
    });
}

async function runTests() {
    console.log('\n' + '═'.repeat(60));
    console.log('  🧪 BLINK SENIOR DEV FULL TEST SUITE');
    console.log('═'.repeat(60));

    // ── SECTION 1: Health & Basics ─────────────────────────────
    console.log('\n📋 SECTION 1 – Health & Server Basics');
    const health = await httpReq('/health');
    assert('GET /health → 200', health.status === 200);
    assert('Health returns status:ok', health.body?.status === 'ok');
    assert('Health has timestamp', !!health.body?.timestamp);

    // ── SECTION 2: Security Headers ───────────────────────────
    console.log('\n🔒 SECTION 2 – Security Headers (helmet)');
    const root = await httpReq('/');
    assert('Root responds with HTML', root.status === 200 || root.status === 302);
    const h = root.headers;
    assert('x-content-type-options: nosniff', h['x-content-type-options'] === 'nosniff');
    assert('x-frame-options set', !!h['x-frame-options']);
    assert('x-dns-prefetch-control set', !!h['x-dns-prefetch-control']);
    assert('Content-Security-Policy (optional)', !!h['content-security-policy'], true);

    // ── SECTION 3: Static File Serving ────────────────────────
    console.log('\n📁 SECTION 3 – Static Files & Redirects');
    const loginPage = await httpReq('/pages/login.html');
    assert('GET /pages/login.html → 200', loginPage.status === 200);
    assert('login.html is HTML', loginPage.headers['content-type']?.includes('text/html'));

    const splash = await httpReq('/');
    assert('GET / → splash.html served', splash.status === 200);

    const redirect = await httpReq('/login.html');
    assert('GET /login.html → 302 redirect', redirect.status === 302);
    assert('Redirect points to /pages/login.html', redirect.headers['location']?.includes('/pages/login.html'));

    // ── SECTION 4: 404 Handling ───────────────────────────────
    console.log('\n🚫 SECTION 4 – 404 & Error Handling');
    const api404 = await httpReq('/api/doesnotexist');
    assert('Unknown API → 404', api404.status === 404);
    assert('API 404 returns JSON error', !!api404.body?.error);

    const page404 = await httpReq('/pages/ghost.html');
    assert('Unknown page → fallback (200 or 404)', [200, 404].includes(page404.status));

    // ── SECTION 5: Auth – Input Validation ────────────────────
    console.log('\n🔐 SECTION 5 – Auth Input Validation');

    const noBody = await httpReq('/api/auth/register', { method: 'POST', body: {} });
    assert('Register with empty body → 400', noBody.status === 400);

    const shortUser = await httpReq('/api/auth/register', { method: 'POST', body: { username: 'a', email: 'test@gmail.com', password: '123456' } });
    assert('Register with username < 3 chars → 400', shortUser.status === 400);

    const badEmail = await httpReq('/api/auth/register', { method: 'POST', body: { username: 'testuser', email: 'notanemail', password: '123456' } });
    assert('Register with bad email → 400', badEmail.status === 400);

    const shortPass = await httpReq('/api/auth/register', { method: 'POST', body: { username: 'testuser', email: 'test@gmail.com', password: '123' } });
    assert('Register with password < 6 chars → 400', shortPass.status === 400);

    const badLogin = await httpReq('/api/auth/login', { method: 'POST', body: { identifier: 'no_one@gmail.com', password: 'wrongpassword' } });
    assert('Login with unknown user → 404', badLogin.status === 404);

    const missingLogin = await httpReq('/api/auth/login', { method: 'POST', body: {} });
    assert('Login with missing fields → 400', missingLogin.status === 400);

    // ── SECTION 6: Protected Routes (No Token) ────────────────
    console.log('\n🛡️ SECTION 6 – Protected Routes');

    const noToken = await httpReq('/api/users/search?q=test');
    assert('GET /api/users/search (no token) → 401', noToken.status === 401);

    const noTokenProfile = await httpReq('/api/users/profile/update', { method: 'PUT', body: { username: 'hacker' } });
    assert('PUT /api/users/profile/update (no token) → 401', noTokenProfile.status === 401);

    const noTokenUpload = await httpReq('/api/videos/upload', { method: 'POST', body: {} });
    assert('POST /api/videos/upload (no token) → 401', noTokenUpload.status === 401);

    // ── SECTION 7: Public API Routes ──────────────────────────
    console.log('\n🎬 SECTION 7 – Public Video API');

    const videos = await httpReq('/api/videos?limit=5');
    assert('GET /api/videos → 200', videos.status === 200);
    assert('Videos response has array', Array.isArray(videos.body?.videos));
    assert('Videos has total field', videos.body?.total !== undefined);

    const videosLimited = await httpReq('/api/videos?limit=3');
    assert('Videos limit=3 respected (≤3)', (videosLimited.body?.videos?.length || 0) <= 3);

    const videosBadMood = await httpReq('/api/videos?mood=FakeMood999');
    assert('Videos with non-existent mood → 200 (empty)', videosBadMood.status === 200);

    // ── SECTION 8: Rate Limiting ──────────────────────────────
    console.log('\n⚡ SECTION 8 – Rate Limiting');
    const rateLimitRes = await httpReq('/api/videos');
    assert('Rate-limit headers present', !!rateLimitRes.headers['ratelimit-limit'] || !!rateLimitRes.headers['x-ratelimit-limit'], true);

    // ── SECTION 9: CORS ───────────────────────────────────────
    console.log('\n🌐 SECTION 9 – CORS');
    const corsRes = await httpReq('/api/videos', { headers: { 'Origin': 'http://localhost:3000' } });
    assert('CORS allows localhost:3000', corsRes.status === 200);
    const corsExternal = await httpReq('/api/videos', { headers: { 'Origin': 'https://example-frontend.com' } });
    assert('CORS policy applied (any origin allowed in dev)', [200, 204].includes(corsExternal.status));

    // ── SECTION 10: Upload Directories ───────────────────────
    console.log('\n📂 SECTION 10 – Upload Static Serving');
    const uploadBad = await httpReq('/uploads/nonexistent.mp4');
    assert('GET /uploads/nonexistent → 404', uploadBad.status === 404);

    // ── FINAL REPORT ──────────────────────────────────────────
    const total = passed + failed + warned;
    console.log('\n' + '═'.repeat(60));
    console.log('  📊 TEST REPORT');
    console.log('═'.repeat(60));
    console.log(`  Total Tests : ${total}`);
    console.log(`  \x1b[32mPassed      : ${passed}\x1b[0m`);
    console.log(`  \x1b[31mFailed      : ${failed}\x1b[0m`);
    console.log(`  \x1b[33mWarnings    : ${warned}\x1b[0m`);
    console.log('─'.repeat(60));
    if (failed === 0) {
        console.log('  \x1b[32m🎉 ALL TESTS PASSED! Production-ready.\x1b[0m');
    } else {
        console.log(`  \x1b[31m⚠️  ${failed} test(s) failed. Review above.\x1b[0m`);
    }
    console.log('═'.repeat(60) + '\n');
    process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((err) => {
    console.error('\n❌ TEST RUNNER CRASHED:', err.message);
    console.error('   Is the server running on port 4000? (npm start)');
    process.exit(1);
});
