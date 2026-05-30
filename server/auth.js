/**
 * auth.js — Express router untuk registrasi RBAC
 *
 * Endpoints:
 *   POST /api/auth/validate-email          → validasi email + terbitkan signature registrasi
 *   POST /api/auth/add-student-email       → sekolah menambah email mahasiswa ke DB
 *   POST /api/auth/bulk-add-student-emails → sekolah upload banyak email sekaligus
 *   GET  /api/auth/students/:schoolWallet  → daftar email mahasiswa milik sekolah
 *   GET  /api/auth/signer-address          → alamat publik backend signer (untuk deploy)
 *
 * Alur validasi → signing (satu request, dua fase):
 *   1. Client POST dengan { role, email, walletAddress, [schoolWallet], chainId }
 *   2. Backend validasi email sesuai role
 *   3. Backend fetch nonce dari chain (atau terima dari client + verifikasi)
 *   4. Backend sign → kembalikan { emailHash, signature }
 *   5. Client pakai { emailHash, signature } untuk panggil fungsi register di kontrak
 */

import { Router } from 'express';
import { ethers } from 'ethers';
import {
    validateSchoolEmail,
    validateHREmail,
    validateStudentEmailFormat,
} from './emailValidator.js';
import {
    isStudentEmailRegistered,
    addStudentEmail,
    getStudentsBySchool,
    bulkAddStudentEmails,
} from './studentDb.js';
import {
    signSchoolRegistration,
    signStudentRegistration,
    signHRRegistration,
    getSignerAddress,
    fetchNonceFromChain,
} from './signerService.js';

const router = Router();

// Alamat UserRegistry yang sudah di-deploy (isi setelah deploy)
const REGISTRY_ADDRESS = process.env.USER_REGISTRY_ADDRESS || '';

// RPC endpoint — gunakan dari .env atau fallback ke Sepolia publik
const RPC_URL = process.env.RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com';

// ──────────────────── Helper ────────────────────

function isValidAddress(addr) {
    return typeof addr === 'string' && ethers.isAddress(addr);
}

function isValidChainId(id) {
    const n = Number(id);
    return Number.isInteger(n) && n > 0;
}

// ============================================================
//   POST /api/auth/validate-email
// ============================================================
/**
 * Validasi email sesuai role dan terbitkan signature registrasi.
 *
 * Body:
 *   role         : "School" | "Student" | "HR"
 *   email        : string
 *   walletAddress: string (0x...)
 *   schoolWallet : string (0x...) — WAJIB jika role === "Student"
 *   chainId      : number         — Chain ID jaringan (11155111 untuk Sepolia)
 *
 * Response 200:
 *   { success: true, emailHash, signature, signerAddress, role }
 *
 * Response 4xx:
 *   { success: false, error: string }
 */
router.post('/validate-email', async (req, res) => {
    try {
        const { role, email, walletAddress, schoolWallet, chainId } = req.body;

        // ── Input validation ──
        if (!role || !email || !walletAddress || !chainId) {
            return res.status(400).json({
                success: false,
                error: 'Field wajib: role, email, walletAddress, chainId.',
            });
        }

        if (!['School', 'Student', 'HR'].includes(role)) {
            return res.status(400).json({
                success: false,
                error: 'Role tidak valid. Pilih: School, Student, atau HR.',
            });
        }

        if (!isValidAddress(walletAddress)) {
            return res.status(400).json({
                success: false,
                error: 'walletAddress tidak valid.',
            });
        }

        if (!isValidChainId(chainId)) {
            return res.status(400).json({
                success: false,
                error: 'chainId tidak valid.',
            });
        }

        // ── Fetch nonce dari chain ──
        let nonce = 0n;
        if (REGISTRY_ADDRESS && ethers.isAddress(REGISTRY_ADDRESS)) {
            try {
                nonce = await fetchNonceFromChain(REGISTRY_ADDRESS, walletAddress, RPC_URL);
            } catch (err) {
                console.warn('[auth] Gagal fetch nonce dari chain, gunakan 0:', err.message);
                // Tetap lanjut dengan nonce=0 — client harus memastikan wallet belum terdaftar
            }
        }

        const bigChainId = BigInt(chainId);

        // ── Validasi & signing per role ──
        let result;

        if (role === 'School') {
            const validation = validateSchoolEmail(email);
            if (!validation.valid) {
                return res.status(422).json({ success: false, error: validation.reason });
            }
            result = await signSchoolRegistration(walletAddress, email, nonce, bigChainId);

        } else if (role === 'Student') {
            if (!schoolWallet || !isValidAddress(schoolWallet)) {
                return res.status(400).json({
                    success: false,
                    error: 'schoolWallet wajib diisi dan valid untuk role Student.',
                });
            }

            const formatCheck = validateStudentEmailFormat(email);
            if (!formatCheck.valid) {
                return res.status(422).json({ success: false, error: formatCheck.reason });
            }

            // Periksa apakah email terdaftar di database sekolah
            const isRegistered = isStudentEmailRegistered(schoolWallet, email);
            if (!isRegistered) {
                return res.status(403).json({
                    success: false,
                    error: `Email "${email}" tidak ditemukan dalam database mahasiswa sekolah ini. ` +
                           `Hubungi administrator sekolah untuk mendaftarkan email Anda terlebih dahulu.`,
                });
            }

            result = await signStudentRegistration(walletAddress, email, schoolWallet, nonce, bigChainId);

        } else if (role === 'HR') {
            const validation = validateHREmail(email);
            if (!validation.valid) {
                return res.status(422).json({ success: false, error: validation.reason });
            }
            result = await signHRRegistration(walletAddress, email, nonce, bigChainId);
        }

        console.log(`[auth] Registrasi ${role} disetujui: ${walletAddress} (${email})`);

        return res.json({
            success: true,
            role,
            emailHash: result.emailHash,
            signature: result.signature,
            signerAddress: result.signerAddress,
            // Kembalikan schoolWallet untuk Student agar frontend bisa langsung pakai
            ...(role === 'Student' && { schoolWallet }),
        });

    } catch (err) {
        console.error('[auth] Error validate-email:', err);
        return res.status(500).json({ success: false, error: 'Internal server error.' });
    }
});

// ============================================================
//   POST /api/auth/add-student-email
// ============================================================
/**
 * Sekolah menambahkan satu email mahasiswa ke database.
 *
 * Otentikasi: wallet sekolah harus menandatangani pesan dengan MetaMask,
 * lalu backend memverifikasi bahwa penandatangan adalah schoolWallet.
 *
 * Body:
 *   schoolWallet   : string (0x...)
 *   studentEmail   : string
 *   walletSignature: string — tanda tangan dari schoolWallet atas pesan standar
 *
 * Pesan yang harus ditandatangani oleh sekolah di frontend:
 *   "TranscriptChain: Add student email <studentEmail> by <schoolWallet> at <timestamp>"
 */
router.post('/add-student-email', async (req, res) => {
    try {
        const { schoolWallet, studentEmail, walletSignature, timestamp } = req.body;

        if (!schoolWallet || !studentEmail || !walletSignature || !timestamp) {
            return res.status(400).json({
                success: false,
                error: 'Field wajib: schoolWallet, studentEmail, walletSignature, timestamp.',
            });
        }

        if (!isValidAddress(schoolWallet)) {
            return res.status(400).json({ success: false, error: 'schoolWallet tidak valid.' });
        }

        // Toleransi timestamp: ±5 menit (cegah replay lama)
        const now = Date.now();
        const ts = Number(timestamp);
        if (Math.abs(now - ts) > 5 * 60 * 1000) {
            return res.status(400).json({
                success: false,
                error: 'Timestamp kadaluarsa. Silakan coba lagi.',
            });
        }

        // Verifikasi bahwa walletSignature berasal dari schoolWallet
        const message = `TranscriptChain: Add student email ${studentEmail.toLowerCase().trim()} by ${schoolWallet.toLowerCase()} at ${timestamp}`;
        const recoveredAddress = ethers.verifyMessage(message, walletSignature);

        if (recoveredAddress.toLowerCase() !== schoolWallet.toLowerCase()) {
            return res.status(403).json({
                success: false,
                error: 'Signature tidak valid. Hanya pemilik wallet sekolah yang dapat menambah email mahasiswa.',
            });
        }

        // Validasi format email
        const emailTrimmed = studentEmail.toLowerCase().trim();
        if (!emailTrimmed.includes('@') || !emailTrimmed.includes('.')) {
            return res.status(400).json({ success: false, error: 'Format email mahasiswa tidak valid.' });
        }

        addStudentEmail(schoolWallet, emailTrimmed);

        console.log(`[auth] Email mahasiswa ditambahkan: ${emailTrimmed} oleh ${schoolWallet}`);

        return res.json({
            success: true,
            message: `Email "${emailTrimmed}" berhasil ditambahkan ke database sekolah.`,
        });

    } catch (err) {
        console.error('[auth] Error add-student-email:', err);
        return res.status(500).json({ success: false, error: 'Internal server error.' });
    }
});

// ============================================================
//   POST /api/auth/bulk-add-student-emails
// ============================================================
/**
 * Upload banyak email mahasiswa sekaligus (array JSON).
 *
 * Body:
 *   schoolWallet   : string
 *   emails         : string[] — array email mahasiswa
 *   walletSignature: string
 *   timestamp      : number
 */
router.post('/bulk-add-student-emails', async (req, res) => {
    try {
        const { schoolWallet, emails, walletSignature, timestamp } = req.body;

        if (!schoolWallet || !Array.isArray(emails) || !walletSignature || !timestamp) {
            return res.status(400).json({
                success: false,
                error: 'Field wajib: schoolWallet, emails (array), walletSignature, timestamp.',
            });
        }

        if (!isValidAddress(schoolWallet)) {
            return res.status(400).json({ success: false, error: 'schoolWallet tidak valid.' });
        }

        const now = Date.now();
        const ts = Number(timestamp);
        if (Math.abs(now - ts) > 5 * 60 * 1000) {
            return res.status(400).json({ success: false, error: 'Timestamp kadaluarsa.' });
        }

        // Verifikasi signature
        const message = `TranscriptChain: Bulk add ${emails.length} student emails by ${schoolWallet.toLowerCase()} at ${timestamp}`;
        const recoveredAddress = ethers.verifyMessage(message, walletSignature);

        if (recoveredAddress.toLowerCase() !== schoolWallet.toLowerCase()) {
            return res.status(403).json({ success: false, error: 'Signature tidak valid.' });
        }

        const result = bulkAddStudentEmails(schoolWallet, emails);

        console.log(`[auth] Bulk add: ${result.added} ditambah, ${result.skipped} dilewati oleh ${schoolWallet}`);

        return res.json({
            success: true,
            added: result.added,
            skipped: result.skipped,
            message: `${result.added} email berhasil ditambahkan, ${result.skipped} dilewati.`,
        });

    } catch (err) {
        console.error('[auth] Error bulk-add-student-emails:', err);
        return res.status(500).json({ success: false, error: 'Internal server error.' });
    }
});

// ============================================================
//   GET /api/auth/students/:schoolWallet
// ============================================================
/**
 * Ambil daftar email mahasiswa milik sebuah sekolah.
 * Gunakan untuk dropdown sekolah di dashboard atau verifikasi.
 */
router.get('/students/:schoolWallet', (req, res) => {
    const { schoolWallet } = req.params;

    if (!isValidAddress(schoolWallet)) {
        return res.status(400).json({ success: false, error: 'schoolWallet tidak valid.' });
    }

    const students = getStudentsBySchool(schoolWallet);
    return res.json({ success: true, schoolWallet, students, count: students.length });
});

// ============================================================
//   GET /api/auth/signer-address
// ============================================================
/**
 * Kembalikan alamat publik backend signer.
 * Gunakan ini untuk mengetahui nilai trustedSigner yang harus di-set saat deploy.
 */
router.get('/signer-address', (req, res) => {
    try {
        const address = getSignerAddress();
        return res.json({ success: true, signerAddress: address });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

export default router;
