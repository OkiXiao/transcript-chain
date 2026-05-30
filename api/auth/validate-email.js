import { ethers } from 'ethers';
import { randomUUID } from 'crypto';
import nodemailer from 'nodemailer';
import { validateSchoolEmail, validateHREmail, validateStudentEmailFormat } from '../../server/emailValidator.js';
import { signSchoolRegistration, signStudentRegistration, signHRRegistration, fetchNonceFromChain } from '../../server/signerService.js';
import { isStudentRegistered, isEmailRegistered, markEmailRegistered, isSchoolAllowed, isHRAllowed, setEmailVerification, getEmailVerification, deleteEmailVerification } from '../lib/firebaseAdmin.js';

const APP_URL      = process.env.APP_URL || 'https://transcript-chain-six.vercel.app';
const GMAIL_USER   = process.env.GMAIL_USER || '';
const GMAIL_PASS   = process.env.GMAIL_PASS || '';

function getEmailHTML(role, verifyUrl) {
    const roleLabel = role === 'School' ? 'Institusi Pendidikan' : role === 'HR' ? 'HR / Perusahaan' : 'Mahasiswa';
    return `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#0f172a;color:#f8fafc;border-radius:12px">
            <h2 style="margin:0 0 8px;font-size:22px">🎓 TranscriptChain</h2>
            <p style="color:#94a3b8;margin:0 0 24px;font-size:14px">Verifikasi Pendaftaran ${roleLabel}</p>
            <p style="margin:0 0 16px">Klik tombol di bawah untuk memverifikasi email Anda dan melanjutkan proses pendaftaran:</p>
            <a href="${verifyUrl}" style="display:inline-block;background:#6366f1;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">
                ✅ Verifikasi Email
            </a>
            <p style="margin:24px 0 0;font-size:12px;color:#475569">Link berlaku selama <strong>15 menit</strong>. Jika Anda tidak merasa melakukan pendaftaran, abaikan email ini.</p>
            <p style="margin:8px 0 0;font-size:11px;color:#334155;word-break:break-all">${verifyUrl}</p>
        </div>`;
}

async function sendVerificationEmail(to, role, verifyUrl) {
    if (!GMAIL_USER || !GMAIL_PASS) {
        throw new Error('Konfigurasi email belum diatur di server (GMAIL_USER / GMAIL_PASS).');
    }
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: GMAIL_USER, pass: GMAIL_PASS },
    });
    await transporter.sendMail({
        from: `"TranscriptChain" <${GMAIL_USER}>`,
        to,
        subject: 'Verifikasi Email Pendaftaran — TranscriptChain',
        html: getEmailHTML(role, verifyUrl),
    });
}

const REGISTRY_ADDRESS = process.env.USER_REGISTRY_ADDRESS || '';
const RPC_URL = process.env.RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { action, role, email, walletAddress, schoolWallet, chainId } = req.body;

    // Verify token from email link
    if (action === 'verify_token') {
        const { token } = req.body;
        if (!token) return res.status(400).json({ success: false, error: 'Token wajib diisi.' });
        try {
            const data = await getEmailVerification(token);
            if (!data) return res.status(404).json({ success: false, error: 'Token tidak valid atau sudah kadaluarsa.' });
            if (Date.now() > data.expiresAt) {
                await deleteEmailVerification(token);
                return res.status(410).json({ success: false, error: 'Link verifikasi sudah kadaluarsa. Silakan daftar ulang.' });
            }
            await deleteEmailVerification(token);
            return res.json({
                success: true,
                role: data.role,
                email: data.email,
                emailHash: data.emailHash,
                signature: data.signature,
                signerAddress: data.signerAddress,
                ...(data.schoolWallet && { schoolWallet: data.schoolWallet }),
            });
        } catch (err) {
            console.error('[validate-email/verify_token]', err);
            return res.status(500).json({ success: false, error: 'Gagal memverifikasi token.' });
        }
    }

    // Confirm action: mark email as registered after on-chain tx success
    if (action === 'confirm') {
        if (!email || !walletAddress || !role) {
            return res.status(400).json({ success: false, error: 'Field wajib: email, walletAddress, role.' });
        }
        if (!ethers.isAddress(walletAddress)) {
            return res.status(400).json({ success: false, error: 'walletAddress tidak valid.' });
        }
        try {
            await markEmailRegistered(email, walletAddress, role);
            return res.json({ success: true });
        } catch (err) {
            console.error('[validate-email/confirm]', err);
            return res.status(500).json({ success: false, error: err.message || 'Internal server error.' });
        }
    }

    if (!role || !email || !walletAddress || !chainId) {
        return res.status(400).json({ success: false, error: 'Field wajib: role, email, walletAddress, chainId.' });
    }
    if (!['School', 'Student', 'HR'].includes(role)) {
        return res.status(400).json({ success: false, error: 'Role tidak valid. Pilih: School, Student, atau HR.' });
    }
    if (!ethers.isAddress(walletAddress)) {
        return res.status(400).json({ success: false, error: 'walletAddress tidak valid.' });
    }

    try {
        if (await isEmailRegistered(email)) {
            return res.status(409).json({
                success: false,
                error: `Email "${email}" sudah digunakan untuk registrasi. Setiap email hanya dapat digunakan sekali.`,
            });
        }

        let nonce = 0n;
        if (REGISTRY_ADDRESS && ethers.isAddress(REGISTRY_ADDRESS)) {
            try {
                nonce = await fetchNonceFromChain(REGISTRY_ADDRESS, walletAddress, RPC_URL);
            } catch {
                // fallback to 0 — contract will reject if nonce mismatch
            }
        }

        const bigChainId = BigInt(chainId);
        let result;

        if (role === 'School') {
            if (!await isSchoolAllowed(email)) {
                return res.status(403).json({
                    success: false,
                    error: `Email "${email}" belum terdaftar sebagai institusi. Hubungi Admin untuk mendaftarkan email sekolah Anda.`,
                });
            }
            result = await signSchoolRegistration(walletAddress, email, nonce, bigChainId);

        } else if (role === 'HR') {
            if (!await isHRAllowed(email)) {
                return res.status(403).json({
                    success: false,
                    error: `Email "${email}" belum terdaftar sebagai HR. Hubungi Admin untuk mendaftarkan email Anda.`,
                });
            }
            result = await signHRRegistration(walletAddress, email, nonce, bigChainId);

        } else if (role === 'Student') {
            if (!schoolWallet || !ethers.isAddress(schoolWallet)) {
                return res.status(400).json({ success: false, error: 'schoolWallet wajib diisi dan valid untuk role Student.' });
            }
            const v = validateStudentEmailFormat(email);
            if (!v.valid) return res.status(422).json({ success: false, error: v.reason });
            if (!await isStudentRegistered(schoolWallet, email)) {
                return res.status(403).json({
                    success: false,
                    error: `Email "${email}" tidak ditemukan dalam database mahasiswa sekolah ini. Hubungi administrator sekolah.`,
                });
            }
            result = await signStudentRegistration(walletAddress, email, schoolWallet, nonce, bigChainId);
        }

        // If no Gmail configured, skip email and return directly (dev mode)
        if (!GMAIL_USER || !GMAIL_PASS) {
            return res.json({
                success: true,
                role,
                emailHash: result.emailHash,
                signature: result.signature,
                signerAddress: result.signerAddress,
                ...(role === 'Student' && { schoolWallet }),
            });
        }

        // Generate verification token, store in Firebase, send email
        const token = randomUUID().replace(/-/g, '');
        const expiresAt = Date.now() + 15 * 60 * 1000; // 15 minutes
        await setEmailVerification(token, {
            role, email, walletAddress,
            emailHash: result.emailHash,
            signature: result.signature,
            signerAddress: result.signerAddress,
            ...(role === 'Student' && { schoolWallet }),
            expiresAt,
            createdAt: Date.now(),
        });

        const verifyUrl = `${APP_URL}/register?token=${token}`;
        try {
            await sendVerificationEmail(email, role, verifyUrl);
        } catch (emailErr) {
            console.error('[validate-email/send]', emailErr.message);
            // Clean up token if email failed
            await deleteEmailVerification(token).catch(() => {});
            return res.status(502).json({ success: false, error: `Gagal mengirim email: ${emailErr.message}` });
        }

        return res.json({ success: true, status: 'email_sent', message: `Link verifikasi dikirim ke ${email}. Berlaku 15 menit.` });

    } catch (err) {
        console.error('[validate-email]', err);
        return res.status(500).json({ success: false, error: err.message || 'Internal server error.' });
    }
}
