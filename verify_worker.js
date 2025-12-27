// verify_worker.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// 1. Load Secrets
const devVarsPath = path.join(__dirname, 'worker', '.dev.vars');
let jwtSecret = '';

if (fs.existsSync(devVarsPath)) {
    const content = fs.readFileSync(devVarsPath, 'utf-8');
    const match = content.match(/JWT_SECRET=(.+)/);
    if (match) {
        jwtSecret = match[1].trim();
        console.log('Found JWT_SECRET');
    }
} else {
    console.warn('worker/.dev.vars not found, using placeholder secret (might fail)');
    jwtSecret = 'your-secret-here';
}

// 2. JWT Helper
function toBase64Url(str) {
    return Buffer.from(str)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

function signJwt(payload, secret) {
    const header = { alg: 'HS256', typ: 'JWT' };
    const headerB64 = toBase64Url(JSON.stringify(header));
    const payloadB64 = toBase64Url(JSON.stringify(payload));
    const input = `${headerB64}.${payloadB64}`;

    const signature = crypto.createHmac('sha256', secret)
        .update(input)
        .digest('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

    return `${input}.${signature}`;
}

// 3. Generate Token
const token = signJwt({
    sub: 'verification-user-id',
    email: 'test@example.com',
    name: 'Verifier',
    exp: Math.floor(Date.now() / 1000) + 3600
}, jwtSecret);

console.log('Generated Token (truncated):', token.substring(0, 20) + '...');

// 4. Call API
async function runTest() {
    // Check if running local or we want to point to remote
    // Default to local dev port
    const url = 'http://127.0.0.1:8787/dvw/process';
    console.log(`Testing POST ${url} ...`);
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ filename: 'sample.json' })
        });

        console.log('Status:', response.status);
        const text = await response.text();
        console.log('Body:', text);

        if (response.ok) {
            console.log('SUCCESS: API processed the file.');
        } else {
            console.error('FAILURE: API returned error.');
        }
    } catch (e) {
        console.error('Request Failed:', e.message);
    }
}

runTest();
