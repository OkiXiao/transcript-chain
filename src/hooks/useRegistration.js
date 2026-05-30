/**
 * useRegistration.js
 *
 * Hook orchestrasi alur registrasi multi-step (Email → Wallet → On-Chain).
 *
 * Step flow:
 *   1. IDLE          — form kosong, user pilih role
 *   2. EMAIL_VALID   — email sudah divalidasi backend, signature sudah diterima
 *   3. WALLET_READY  — wallet sudah terhubung, siap kirim ke chain
 *   4. CONFIRMING    — tx sedang diproses di chain
 *   5. SUCCESS       — registrasi berhasil
 *   6. ERROR         — terjadi error
 *
 * Cara pakai:
 *   const { step, register, validateEmail, status, error } = useRegistration(registryContract);
 */

import { useState, useCallback } from 'react';
import { ethers } from 'ethers';
import { useWeb3 } from '../context/Web3Context';
import { useAuth } from '../context/AuthContext';

// In dev, use local Express server. In production (Vercel), use relative paths (same domain).
const API_BASE = import.meta.env.VITE_API_URL !== undefined
    ? import.meta.env.VITE_API_URL
    : (import.meta.env.DEV ? 'http://localhost:3001' : '');

export const REG_STEP = {
    IDLE:         'IDLE',
    EMAIL_SENT:   'EMAIL_SENT',
    EMAIL_VALID:  'EMAIL_VALID',
    WALLET_READY: 'WALLET_READY',
    CONFIRMING:   'CONFIRMING',
    SUCCESS:      'SUCCESS',
    ERROR:        'ERROR',
};

export function useRegistration(registryContract) {
    const { account, connectWallet, chainId } = useWeb3();
    const { refreshRole, setUserEmail } = useAuth();

    const [step, setStep]         = useState(REG_STEP.IDLE);
    const [status, setStatus]     = useState('');
    const [error, setError]       = useState('');
    const [txHash, setTxHash]     = useState('');

    // Data yang disimpan antar step
    const [pendingData, setPendingData] = useState(null);

    const reset = useCallback(() => {
        setStep(REG_STEP.IDLE);
        setStatus('');
        setError('');
        setTxHash('');
        setPendingData(null);
    }, []);

    // ──────────────────── Step 1: Validasi Email ke Backend ────────────────────

    /**
     * Validasi email ke server dan terima signature registrasi.
     *
     * @param {object} params
     * @param {'School'|'Student'|'HR'} params.role
     * @param {string} params.email
     * @param {string} params.walletAddress - Alamat MetaMask yang sudah terhubung
     * @param {string} [params.schoolWallet] - Wajib untuk role Student
     */
    const validateEmail = useCallback(async ({ role, email, walletAddress, schoolWallet }) => {
        setError('');
        setStatus('Memvalidasi email ke server...');

        // Pastikan wallet terhubung
        let wallet = walletAddress || account;
        if (!wallet) {
            setStatus('Menghubungkan wallet...');
            await connectWallet();
            wallet = account;
            if (!wallet) {
                setError('Wallet harus terhubung sebelum validasi email.');
                setStep(REG_STEP.ERROR);
                return;
            }
        }

        // Chain ID dari MetaMask (hex string "0xaa36a7" → number)
        const numericChainId = chainId ? parseInt(chainId, 16) : 11155111;

        try {
            const body = { role, email, walletAddress: wallet, chainId: numericChainId };
            if (role === 'Student' && schoolWallet) body.schoolWallet = schoolWallet;

            const res = await fetch(`${API_BASE}/api/auth/validate-email`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            const data = await res.json();

            if (!res.ok || !data.success) {
                setError(data.error || 'Validasi email gagal.');
                setStep(REG_STEP.ERROR);
                return;
            }

            // Email verification sent — wait for user to click link
            if (data.status === 'email_sent') {
                setUserEmail(email);
                setStatus(data.message || 'Link verifikasi dikirim. Cek email Anda.');
                setStep(REG_STEP.EMAIL_SENT);
                return;
            }

            // No email verification (dev mode) — proceed directly
            setPendingData({
                role,
                email,
                emailHash:   data.emailHash,
                signature:   data.signature,
                schoolWallet: data.schoolWallet || schoolWallet || null,
                walletAddress: wallet,
            });

            setUserEmail(email);
            setStatus('Email valid. Siap mendaftar ke blockchain.');
            setStep(REG_STEP.EMAIL_VALID);

        } catch (err) {
            setError(`Gagal menghubungi server: ${err.message}`);
            setStep(REG_STEP.ERROR);
        }
    }, [account, chainId, connectWallet, setUserEmail]);

    // ──────────────────── Step 2: Kirim Transaksi ke Chain ────────────────────

    /**
     * Panggil fungsi register di UserRegistry contract menggunakan MetaMask.
     * Harus dipanggil setelah validateEmail berhasil.
     */
    const submitOnChain = useCallback(async () => {
        if (!pendingData) {
            setError('Tidak ada data pending. Jalankan validateEmail terlebih dahulu.');
            return;
        }

        if (!registryContract) {
            setError('Contract UserRegistry belum terhubung.');
            setStep(REG_STEP.ERROR);
            return;
        }

        const { role, emailHash, signature, schoolWallet } = pendingData;

        setStep(REG_STEP.CONFIRMING);
        setStatus('Menunggu konfirmasi transaksi di MetaMask...');
        setError('');

        try {
            let tx;

            if (role === 'School') {
                tx = await registryContract.registerSchool(emailHash, signature);
            } else if (role === 'Student') {
                if (!schoolWallet || !ethers.isAddress(schoolWallet)) {
                    throw new Error('Alamat wallet sekolah tidak valid untuk registrasi Student.');
                }
                tx = await registryContract.registerStudent(emailHash, schoolWallet, signature);
            } else if (role === 'HR') {
                tx = await registryContract.registerHR(emailHash, signature);
            } else {
                throw new Error(`Role tidak dikenal: ${role}`);
            }

            setStatus('Transaksi terkirim. Menunggu konfirmasi block...');
            setTxHash(tx.hash);

            const receipt = await tx.wait();

            if (receipt.status === 1) {
                setStatus('Registrasi berhasil!');
                setStep(REG_STEP.SUCCESS);
                await refreshRole(); // Perbarui role di AuthContext
                // Tandai email sebagai sudah terdaftar (fire-and-forget, jangan blokir UI)
                fetch(`${API_BASE}/api/auth/validate-email`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'confirm', email: pendingData.email, walletAddress: pendingData.walletAddress, role }),
                }).catch(() => {}); // best-effort
            } else {
                throw new Error('Transaksi gagal (status 0).');
            }

        } catch (err) {
            // MetaMask rejected
            if (err.code === 4001 || err.code === 'ACTION_REJECTED') {
                setError('Transaksi ditolak oleh pengguna.');
                setStep(REG_STEP.EMAIL_VALID); // kembali ke step sebelumnya
            } else {
                // Parsing pesan error dari kontrak
                const contractError = err.reason || err.data?.message || err.message || 'Transaksi gagal.';
                setError(contractError);
                setStep(REG_STEP.ERROR);
            }
        }
    }, [pendingData, registryContract, refreshRole]);

    // ──────────────────── Helper: Buat pesan untuk add-student-email ────────────────────

    /**
     * Sekolah menambahkan email mahasiswa ke database.
     * Memerlukan tanda tangan MetaMask dari wallet sekolah.
     *
     * @param {object} params
     * @param {string} params.studentEmail
     * @param {object} params.signer - ethers.Signer dari Web3Context
     */
    const addStudentEmail = useCallback(async ({ studentEmail, signer }) => {
        if (!signer || !account) {
            throw new Error('Wallet sekolah harus terhubung.');
        }

        const timestamp = Date.now();
        const message = `TranscriptChain: Add student email ${studentEmail.toLowerCase().trim()} by ${account.toLowerCase()} at ${timestamp}`;

        const walletSignature = await signer.signMessage(message);

        const res = await fetch(`${API_BASE}/api/auth/add-student-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                schoolWallet: account,
                studentEmail,
                walletSignature,
                timestamp,
            }),
        });

        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'Gagal menambah email.');
        return data;
    }, [account]);

    /**
     * Sekolah bulk-upload email mahasiswa.
     *
     * @param {object} params
     * @param {string[]} params.emails
     * @param {object}   params.signer
     */
    const bulkAddStudentEmails = useCallback(async ({ emails, signer }) => {
        if (!signer || !account) {
            throw new Error('Wallet sekolah harus terhubung.');
        }

        const timestamp = Date.now();
        const message = `TranscriptChain: Bulk add ${emails.length} student emails by ${account.toLowerCase()} at ${timestamp}`;

        const walletSignature = await signer.signMessage(message);

        const res = await fetch(`${API_BASE}/api/auth/add-student-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ schoolWallet: account, emails, walletSignature, timestamp }),
        });

        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'Bulk add gagal.');
        return data;
    }, [account]);

    const verifyEmailToken = useCallback(async (token) => {
        setError('');
        setStatus('Memverifikasi link...');
        try {
            const res = await fetch(`${API_BASE}/api/auth/validate-email`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'verify_token', token }),
            });
            const data = await res.json();
            if (!res.ok || !data.success) {
                setError(data.error || 'Token tidak valid.');
                setStep(REG_STEP.ERROR);
                return;
            }
            setPendingData({
                role: data.role,
                email: data.email,
                emailHash: data.emailHash,
                signature: data.signature,
                schoolWallet: data.schoolWallet || null,
                walletAddress: account || '',
            });
            setUserEmail(data.email);
            setStatus('Email terverifikasi. Siap mendaftar ke blockchain.');
            setStep(REG_STEP.EMAIL_VALID);
        } catch (err) {
            setError(`Gagal memverifikasi: ${err.message}`);
            setStep(REG_STEP.ERROR);
        }
    }, [account, setUserEmail]);

    return {
        // State
        step,
        status,
        error,
        txHash,
        pendingData,
        // Actions
        validateEmail,
        verifyEmailToken,
        submitOnChain,
        addStudentEmail,
        bulkAddStudentEmails,
        reset,
    };
}
