/**
 * Mint an ID token for an email and call GET /v1/users/me against local API.
 * Usage: node scripts/verify-me.mjs sabeee@gmail.com
 */
import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { applicationDefault, getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: resolve(root, 'apps/api/.env') });
config({ path: resolve(root, 'apps/web/.env') });

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error('Usage: node scripts/verify-me.mjs <email>');
  process.exit(1);
}

const apiKey = process.env.VITE_FIREBASE_API_KEY;
const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;
const apiBase = process.env.VITE_API_BASE_URL || 'http://localhost:8080';

if (!getApps().length) {
  let credential = applicationDefault();
  const secretsPath = resolve(root, 'secrets/nexle-marketplace-admin.json');
  try {
    const sa = JSON.parse(readFileSync(secretsPath, 'utf8'));
    credential = cert(sa);
  } catch {
    // fall back to ADC
  }
  initializeApp({ credential, projectId });
}

const authUser = await getAuth().getUserByEmail(email);
const customToken = await getAuth().createCustomToken(authUser.uid);

const tokenRes = await fetch(
  `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: customToken, returnSecureToken: true }),
  },
);
const tokenJson = await tokenRes.json();
if (!tokenJson.idToken) {
  console.error(JSON.stringify({ ok: false, step: 'idToken', tokenJson }, null, 2));
  process.exit(1);
}

const meRes = await fetch(`${apiBase}/v1/users/me`, {
  headers: { Authorization: `Bearer ${tokenJson.idToken}` },
});
const meText = await meRes.text();
let me;
try {
  me = JSON.parse(meText);
} catch {
  me = meText;
}

console.log(
  JSON.stringify(
    {
      ok: meRes.ok,
      status: meRes.status,
      uid: authUser.uid,
      email,
      accountType: me?.data?.accountType ?? me?.accountType,
      body: me,
    },
    null,
    2,
  ),
);
