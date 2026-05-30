/**
 * studentDb.js
 *
 * Database email mahasiswa yang telah diverifikasi per sekolah.
 *
 * Implementasi: file JSON sederhana yang di-persist ke disk.
 * Pada produksi, ganti dengan query ke database relasional (PostgreSQL, MySQL)
 * atau NoSQL (MongoDB) yang sudah ada.
 *
 * Struktur data:
 * {
 *   "<schoolWalletAddress_lowercase>": {
 *     "<email_lowercase>": {
 *       "addedAt": "ISO timestamp",
 *       "addedByWallet": "<school_wallet>"
 *     }
 *   }
 * }
 *
 * API yang disediakan:
 *   addStudentEmail(schoolWallet, email)         → void
 *   isStudentEmailRegistered(schoolWallet, email) → boolean
 *   getStudentsBySchool(schoolWallet)             → string[]
 *   removeStudentEmail(schoolWallet, email)       → void
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Path file JSON untuk persistence
const DB_PATH = path.join(__dirname, 'studentDb.json');

// ──────────────────── Internal I/O ────────────────────

function loadDb() {
    if (!fs.existsSync(DB_PATH)) {
        return {};
    }
    try {
        const raw = fs.readFileSync(DB_PATH, 'utf-8');
        return JSON.parse(raw);
    } catch {
        // Jika file corrupt, mulai dengan database kosong
        return {};
    }
}

function saveDb(data) {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

// ──────────────────── Public API ────────────────────

/**
 * Tambahkan email mahasiswa ke database untuk sekolah tertentu.
 * Dipanggil oleh endpoint POST /api/auth/add-student-email
 * yang hanya boleh diakses oleh wallet School yang terautentikasi.
 *
 * @param {string} schoolWallet - Alamat wallet sekolah (checksum atau lowercase)
 * @param {string} email        - Email mahasiswa (akan dinormalisasi ke lowercase)
 */
function addStudentEmail(schoolWallet, email) {
    const db = loadDb();
    const schoolKey = schoolWallet.toLowerCase();
    const emailKey = email.toLowerCase().trim();

    if (!db[schoolKey]) {
        db[schoolKey] = {};
    }

    db[schoolKey][emailKey] = {
        addedAt: new Date().toISOString(),
        addedByWallet: schoolWallet.toLowerCase(),
    };

    saveDb(db);
}

/**
 * Periksa apakah email mahasiswa terdaftar di database sekolah tertentu.
 *
 * @param {string} schoolWallet - Alamat wallet sekolah
 * @param {string} email        - Email yang akan dicek
 * @returns {boolean}
 */
function isStudentEmailRegistered(schoolWallet, email) {
    const db = loadDb();
    const schoolKey = schoolWallet.toLowerCase();
    const emailKey = email.toLowerCase().trim();

    return !!(db[schoolKey] && db[schoolKey][emailKey]);
}

/**
 * Ambil semua email mahasiswa yang terdaftar untuk sebuah sekolah.
 *
 * @param {string} schoolWallet
 * @returns {Array<{ email: string, addedAt: string }>}
 */
function getStudentsBySchool(schoolWallet) {
    const db = loadDb();
    const schoolKey = schoolWallet.toLowerCase();

    if (!db[schoolKey]) return [];

    return Object.entries(db[schoolKey]).map(([email, meta]) => ({
        email,
        addedAt: meta.addedAt,
    }));
}

/**
 * Hapus email mahasiswa dari database sekolah.
 *
 * @param {string} schoolWallet
 * @param {string} email
 */
function removeStudentEmail(schoolWallet, email) {
    const db = loadDb();
    const schoolKey = schoolWallet.toLowerCase();
    const emailKey = email.toLowerCase().trim();

    if (db[schoolKey]) {
        delete db[schoolKey][emailKey];
        saveDb(db);
    }
}

/**
 * Bulk-import daftar email mahasiswa untuk sebuah sekolah.
 * Berguna saat sekolah mengunggah file CSV daftar mahasiswa.
 *
 * @param {string}   schoolWallet
 * @param {string[]} emails - Array email mahasiswa
 * @returns {{ added: number, skipped: number }}
 */
function bulkAddStudentEmails(schoolWallet, emails) {
    const db = loadDb();
    const schoolKey = schoolWallet.toLowerCase();

    if (!db[schoolKey]) {
        db[schoolKey] = {};
    }

    let added = 0;
    let skipped = 0;
    const now = new Date().toISOString();

    for (const email of emails) {
        const emailKey = email.toLowerCase().trim();
        if (!emailKey || !emailKey.includes('@')) {
            skipped++;
            continue;
        }
        if (db[schoolKey][emailKey]) {
            skipped++; // sudah ada
        } else {
            db[schoolKey][emailKey] = { addedAt: now, addedByWallet: schoolWallet.toLowerCase() };
            added++;
        }
    }

    saveDb(db);
    return { added, skipped };
}

export {
    addStudentEmail,
    isStudentEmailRegistered,
    getStudentsBySchool,
    removeStudentEmail,
    bulkAddStudentEmails,
};
