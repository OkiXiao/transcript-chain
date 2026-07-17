import { ethers } from 'ethers';
import { randomUUID } from 'crypto';
import nodemailer from 'nodemailer';
import { signSchoolRegistration, signHRRegistration, fetchNonceFromChain } from '../../server/signerService.js';
import { isEmailRegistered, markEmailRegistered, isSchoolAllowed, isHRAllowed, setEmailVerification, getEmailVerification, deleteEmailVerification, createSession, markSessionVerified, getSession } from '../_lib/firebaseAdmin.js';

const APP_URL    = process.env.APP_URL || 'https://transcript-chain-six.vercel.app';
const GMAIL_USER = process.env.GMAIL_USER || '';
const GMAIL_PASS = process.env.GMAIL_PASS || '';

function getEmailHTML(role, verifyUrl) {
    const roleLabel = role === 'School' ? 'Institusi Pendidikan' : 'HR / Perusahaan';
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
const RPC_URL          = process.env.RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { action, role, email, walletAddress, chainId, sessionId } = req.body;

    // ── verify_token: email link clicked ──────────────────────────────────────
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

            const verifiedPayload = {
                role:          data.role,
                email:         data.email,
                emailHash:     data.emailHash,
                signature:     data.signature,
                signerAddress: data.signerAddress,
            };

            if (data.sessionId) {
                await markSessionVerified(data.sessionId, verifiedPayload).catch(() => {});
            }

            return res.json({ success: true, ...verifiedPayload });
        } catch (err) {
            console.error('[validate-email/verify_token]', err);
            return res.status(500).json({ success: false, error: 'Gagal memverifikasi token.' });
        }
    }

    // ── check_session: original tab polls for verification result ─────────────
    if (action === 'check_session') {
        const { sessionId } = req.body;
        if (!sessionId) return res.status(400).json({ verified: false });
        try {
            const session = await getSession(sessionId);
            if (!session) return res.json({ verified: false });
            if (Date.now() > session.expiresAt) return res.json({ verified: false, expired: true });
            if (!session.verified) return res.json({ verified: false });
            return res.json({ verified: true, ...session.data });
        } catch {
            return res.status(500).json({ verified: false });
        }
    }

    // ── confirm: mark email registered after on-chain tx success ─────────────
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

    // ── Main flow: validate email & generate backend signature ────────────────
    if (!role || !email || !walletAddress || !chainId) {
        return res.status(400).json({ success: false, error: 'Field wajib: role, email, walletAddress, chainId.' });
    }
    if (!['School', 'HR'].includes(role)) {
        return res.status(400).json({ success: false, error: 'Role tidak valid. Pilih: School atau HR.' });
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

        // Double-check on-chain state
        if (REGISTRY_ADDRESS && ethers.isAddress(REGISTRY_ADDRESS)) {
            const minABI = [
                'function isRegistered(address) view returns (bool)',
                'function getProfile(address) view returns (tuple(uint8 role, bytes32 emailHash, bool isActive, uint256 registeredAt))',
                'function emailHashToWallet(bytes32) view returns (address)',
            ];
            try {
                const provider = new ethers.JsonRpcProvider(RPC_URL);
                const registry = new ethers.Contract(REGISTRY_ADDRESS, minABI, provider);

                const alreadyRegistered = await registry.isRegistered(walletAddress);
                if (alreadyRegistered) {
                    const profile = await registry.getProfile(walletAddress);
                    if (!profile.isActive) {
                        return res.status(403).json({
                            success: false,
                            error: 'Wallet ini telah dinonaktifkan oleh administrator. Hubungi admin untuk informasi lebih lanjut.',
                        });
                    }
                    return res.status(409).json({
                        success: false,
                        error: 'Wallet ini sudah terdaftar di blockchain.',
                    });
                }

                const emailOnChainHash = ethers.keccak256(ethers.toUtf8Bytes(email.toLowerCase().trim()));
                const boundWallet = await registry.emailHashToWallet(emailOnChainHash);
                if (boundWallet && boundWallet !== ethers.ZeroAddress) {
                    return res.status(409).json({
                        success: false,
                        error: `Email "${email}" sudah terikat ke wallet lain di blockchain.`,
                    });
                }
            } catch { /* RPC error — lanjut */ }
        }

        let nonce = 0n;
        if (REGISTRY_ADDRESS && ethers.isAddress(REGISTRY_ADDRESS)) {
            try {
                nonce = await fetchNonceFromChain(REGISTRY_ADDRESS, walletAddress, RPC_URL);
            } catch { /* fallback ke 0 */ }
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
        }

        // Dev mode: skip email
        if (!GMAIL_USER || !GMAIL_PASS) {
            return res.json({
                success: true,
                role,
                emailHash:     result.emailHash,
                signature:     result.signature,
                signerAddress: result.signerAddress,
            });
        }

        // Generate token, store in Firebase, send email
        const token     = randomUUID().replace(/-/g, '');
        const expiresAt = Date.now() + 15 * 60 * 1000;
        await setEmailVerification(token, {
            role, email, walletAddress,
            emailHash:     result.emailHash,
            signature:     result.signature,
            signerAddress: result.signerAddress,
            ...(sessionId && { sessionId }),
            expiresAt,
            createdAt: Date.now(),
        });
        if (sessionId) {
            await createSession(sessionId, { expiresAt: expiresAt + 5 * 60 * 1000 }).catch(() => {});
        }

        const verifyUrl = `${APP_URL}/register?token=${token}`;
        try {
            await sendVerificationEmail(email, role, verifyUrl);
        } catch (emailErr) {
            console.error('[validate-email/send]', emailErr.message);
            await deleteEmailVerification(token).catch(() => {});
            return res.status(502).json({ success: false, error: `Gagal mengirim email: ${emailErr.message}` });
        }

        return res.json({ success: true, status: 'email_sent', message: `Link verifikasi dikirim ke ${email}. Berlaku 15 menit.` });

    } catch (err) {
        console.error('[validate-email]', err);
        return res.status(500).json({ success: false, error: err.message || 'Internal server error.' });
    }
}
