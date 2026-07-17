import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';

let _db = null;

function getDb() {
    if (_db) return _db;

    const projectId   = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey  = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
    const databaseURL = process.env.FIREBASE_DATABASE_URL;

    if (!projectId || !clientEmail || !privateKey || !databaseURL) {
        throw new Error(
            'Firebase env vars belum di-set. Butuh: ' +
            'FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY, FIREBASE_DATABASE_URL'
        );
    }

    if (!getApps().length) {
        initializeApp({
            credential: cert({ projectId, clientEmail, privateKey }),
            databaseURL,
        });
    }

    _db = getDatabase();
    return _db;
}

// ─── Admin Whitelist helpers ─────────────────────────────────────
// allowedSchools/{emailKey} → { email, schoolName, addedAt, addedBy }
// allowedHR/{emailKey}      → { email, companyName, addedAt, addedBy }

function emailKey(email) {
    return email.toLowerCase().trim().replace(/\./g, ',');
}

export async function isSchoolAllowed(email) {
    const db = getDb();
    const snap = await db.ref(`allowedSchools/${emailKey(email)}`).get();
    return snap.exists();
}

export async function isHRAllowed(email) {
    const db = getDb();
    const snap = await db.ref(`allowedHR/${emailKey(email)}`).get();
    return snap.exists();
}

export async function getAllowedSchools() {
    const db = getDb();
    const snap = await db.ref('allowedSchools').get();
    if (!snap.exists()) return [];
    return Object.values(snap.val()).sort((a, b) => a.email.localeCompare(b.email));
}

export async function getAllowedHR() {
    const db = getDb();
    const snap = await db.ref('allowedHR').get();
    if (!snap.exists()) return [];
    return Object.values(snap.val()).sort((a, b) => a.email.localeCompare(b.email));
}

export async function addToWhitelist(type, email, adminWallet, meta = {}) {
    const db = getDb();
    const key = emailKey(email);
    const node = type === 'schools' ? 'allowedSchools' : 'allowedHR';
    await db.ref(`${node}/${key}`).set({
        email: email.toLowerCase().trim(),
        addedAt: new Date().toISOString(),
        addedBy: adminWallet,
        ...meta,
    });
}

export async function removeFromWhitelist(type, email) {
    const db = getDb();
    const key = emailKey(email);
    const node = type === 'schools' ? 'allowedSchools' : 'allowedHR';
    await db.ref(`${node}/${key}`).remove();
}

// ─── Registered Emails helpers ──────────────────────────────────
// Path: registeredEmails/{emailKey} → { email, walletAddress, role, registeredAt }

export async function isEmailRegistered(email) {
    const db = getDb();
    const key = email.toLowerCase().trim().replace(/\./g, ',');
    const snap = await db.ref(`registeredEmails/${key}`).get();
    return snap.exists();
}

export async function markEmailRegistered(email, walletAddress, role) {
    const db = getDb();
    const key = email.toLowerCase().trim().replace(/\./g, ',');
    await db.ref(`registeredEmails/${key}`).set({
        email: email.toLowerCase().trim(),
        walletAddress: walletAddress.toLowerCase(),
        role,
        registeredAt: new Date().toISOString(),
    });
}

export async function setEmailVerification(token, data) {
    const db = getDb();
    await db.ref(`emailVerifications/${token}`).set(data);
}

export async function getEmailVerification(token) {
    const db = getDb();
    const snap = await db.ref(`emailVerifications/${token}`).get();
    return snap.exists() ? snap.val() : null;
}

export async function deleteEmailVerification(token) {
    const db = getDb();
    await db.ref(`emailVerifications/${token}`).remove();
}

export async function getAllRegisteredEmails() {
    const db = getDb();
    const snap = await db.ref('registeredEmails').get();
    if (!snap.exists()) return {};
    return snap.val();
}

export async function removeRegisteredEmail(emailKey) {
    const db = getDb();
    await db.ref(`registeredEmails/${emailKey}`).remove();
}

// ─── Email Session helpers (polling-based auto-advance) ──────────────────────
// Path: emailSessions/{sessionId} → { verified, data, expiresAt }

export async function createSession(sessionId, { expiresAt }) {
    const db = getDb();
    await db.ref(`emailSessions/${sessionId}`).set({ verified: false, expiresAt, createdAt: Date.now() });
}

export async function markSessionVerified(sessionId, data) {
    const db = getDb();
    await db.ref(`emailSessions/${sessionId}`).update({ verified: true, data, verifiedAt: Date.now() });
}

export async function getSession(sessionId) {
    const db = getDb();
    const snap = await db.ref(`emailSessions/${sessionId}`).get();
    return snap.exists() ? snap.val() : null;
}
