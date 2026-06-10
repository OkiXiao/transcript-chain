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

// ─── Student DB helpers ─────────────────────────────────────────

/**
 * Tambah satu email mahasiswa ke database sekolah.
 * Path: studentEmails/{schoolWallet}/{emailKey}
 */
export async function addStudentEmail(schoolWallet, studentEmail) {
    const db  = getDb();
    const key = schoolWallet.toLowerCase();
    const emailKey = studentEmail.toLowerCase().trim().replace(/\./g, ','); // Realtime DB tidak izinkan titik di key
    await db.ref(`studentEmails/${key}/${emailKey}`).set({
        email: studentEmail.toLowerCase().trim(),
        addedAt: new Date().toISOString(),
    });
}

/**
 * Cek apakah email mahasiswa terdaftar di sekolah tertentu.
 */
export async function isStudentRegistered(schoolWallet, studentEmail) {
    const db  = getDb();
    const key = schoolWallet.toLowerCase();
    const emailKey = studentEmail.toLowerCase().trim().replace(/\./g, ',');
    const snap = await db.ref(`studentEmails/${key}/${emailKey}`).get();
    return snap.exists();
}

/**
 * Ambil semua email mahasiswa milik sekolah.
 */
export async function getStudentEmails(schoolWallet) {
    const db  = getDb();
    const key = schoolWallet.toLowerCase();
    const snap = await db.ref(`studentEmails/${key}`).get();
    if (!snap.exists()) return [];
    const data = snap.val();
    return Object.values(data).map(v => v.email);
}

/**
 * Bulk add email mahasiswa.
 */
export async function bulkAddStudentEmails(schoolWallet, emails) {
    const db  = getDb();
    const key = schoolWallet.toLowerCase();
    const updates = {};
    for (const email of emails) {
        const emailKey = email.toLowerCase().trim().replace(/\./g, ',');
        updates[emailKey] = {
            email: email.toLowerCase().trim(),
            addedAt: new Date().toISOString(),
        };
    }
    await db.ref(`studentEmails/${key}`).update(updates);
}

// ─── NIM Registry helpers ───────────────────────────────────────
// Path: nimRegistry/{schoolWallet}/{nim} → { name, email, walletAddress }

export async function addNimRecord(schoolWallet, nim, data) {
    const db = getDb();
    const key = schoolWallet.toLowerCase();
    await db.ref(`nimRegistry/${key}/${nim}`).set({
        name: data.name,
        email: (data.email || '').toLowerCase().trim(),
        walletAddress: (data.walletAddress || '').toLowerCase(),
        birthPlace: data.birthPlace || '',
        birthDate: data.birthDate || '',
        faculty: data.faculty || '',
        major: data.major || '',
        degree: data.degree || '',
        tahunLulus: data.tahunLulus || '',
        addedAt: new Date().toISOString(),
    });
}

export async function getNimRecord(schoolWallet, nim) {
    const db = getDb();
    const key = schoolWallet.toLowerCase();
    const snap = await db.ref(`nimRegistry/${key}/${nim}`).get();
    return snap.exists() ? snap.val() : null;
}

export async function getAllNimRecords(schoolWallet) {
    const db = getDb();
    const key = schoolWallet.toLowerCase();
    const snap = await db.ref(`nimRegistry/${key}`).get();
    if (!snap.exists()) return {};
    return snap.val();
}

// ─── Pending Transcript helpers ─────────────────────────────────
// Path: pendingTranscripts/{requestId} → { schoolWallet, studentWallet, ... }

export async function createPendingTranscript(data) {
    const db = getDb();
    const ref = db.ref('pendingTranscripts').push();
    const requestId = ref.key;
    await ref.set({
        ...data,
        requestId,
        status: 'pending',
        createdAt: new Date().toISOString(),
    });
    return requestId;
}

export async function getPendingTranscriptsForStudent(studentWallet) {
    const db = getDb();
    const snap = await db.ref('pendingTranscripts')
        .orderByChild('studentWallet')
        .equalTo(studentWallet.toLowerCase())
        .get();
    if (!snap.exists()) return [];
    return Object.values(snap.val());
}

export async function getAllStudentApprovedTranscripts() {
    const db = getDb();
    const snap = await db.ref('pendingTranscripts')
        .orderByChild('status')
        .equalTo('student_approved')
        .get();
    if (!snap.exists()) return [];
    return Object.values(snap.val());
}

export async function getPendingTranscriptsForSchool(schoolWallet) {
    const db = getDb();
    const snap = await db.ref('pendingTranscripts')
        .orderByChild('schoolWallet')
        .equalTo(schoolWallet.toLowerCase())
        .get();
    if (!snap.exists()) return [];
    return Object.values(snap.val());
}

export async function updateTranscriptStatus(requestId, status, extra = {}) {
    const db = getDb();
    await db.ref(`pendingTranscripts/${requestId}`).update({
        status,
        updatedAt: new Date().toISOString(),
        ...extra,
    });
}

export async function getPendingTranscriptById(requestId) {
    const db = getDb();
    const snap = await db.ref(`pendingTranscripts/${requestId}`).get();
    return snap.exists() ? snap.val() : null;
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

// ─── Resubmit helpers ────────────────────────────────────────────

export async function resubmitTranscript(requestId, data) {
    const db = getDb();
    await db.ref(`pendingTranscripts/${requestId}`).update({
        ...data,
        status: 'pending',
        rejectReason: null,
        updatedAt: new Date().toISOString(),
    });
}

// ─── App Config helpers ──────────────────────────────────────────
// Path: config/{key} → value

export async function getConfig(key) {
    const db = getDb();
    const snap = await db.ref(`config/${key}`).get();
    return snap.exists() ? snap.val() : null;
}

export async function setConfig(key, value) {
    const db = getDb();
    await db.ref(`config/${key}`).set(value);
}

// ─── Registered Emails helpers ──────────────────────────────────
// Path: registeredEmails/{emailKey} → { email, walletAddress, role, registeredAt }

export async function isEmailRegistered(email) {
    const db = getDb();
    const emailKey = email.toLowerCase().trim().replace(/\./g, ',');
    const snap = await db.ref(`registeredEmails/${emailKey}`).get();
    return snap.exists();
}

export async function markEmailRegistered(email, walletAddress, role) {
    const db = getDb();
    const emailKey = email.toLowerCase().trim().replace(/\./g, ',');
    await db.ref(`registeredEmails/${emailKey}`).set({
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
