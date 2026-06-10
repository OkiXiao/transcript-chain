import { ethers } from 'ethers';
import { getPendingTranscriptById, updateTranscriptStatus, getConfig } from '../_lib/firebaseAdmin.js';

const MINISTRY_WALLET_ENV = process.env.MINISTRY_WALLET?.toLowerCase() || '';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const {
        requestId,
        studentWallet,
        ministryWallet,
        txHash,
        action = 'approve',
        reason,
    } = req.body;

    const validActions = ['approve', 'reject', 'mint', 'ministry_approve', 'ministry_reject', 'ministry_mint'];
    if (!requestId || !validActions.includes(action)) {
        return res.status(400).json({ success: false, error: 'requestId wajib diisi dan action harus valid.' });
    }

    const isMinistryAction = action === 'ministry_approve' || action === 'ministry_reject' || action === 'ministry_mint';

    if (!isMinistryAction && !ethers.isAddress(studentWallet)) {
        return res.status(400).json({ success: false, error: 'studentWallet tidak valid.' });
    }
    if (isMinistryAction) {
        const configWallet = await getConfig('ministryWallet').catch(() => null);
        const MINISTRY_WALLET = configWallet || MINISTRY_WALLET_ENV;
        if (!MINISTRY_WALLET) {
            return res.status(503).json({ success: false, error: 'Konfigurasi kementerian belum diatur.' });
        }
        if (!ministryWallet || ministryWallet.toLowerCase() !== MINISTRY_WALLET) {
            return res.status(403).json({ success: false, error: 'Hanya wallet Kementerian yang dapat melakukan tindakan ini.' });
        }
    }

    try {
        const record = await getPendingTranscriptById(requestId);
        if (!record) {
            return res.status(404).json({ success: false, error: 'Request tidak ditemukan.' });
        }

        if (action === 'approve' || action === 'reject') {
            if (record.studentWallet !== studentWallet.toLowerCase()) {
                return res.status(403).json({ success: false, error: 'Bukan request milik wallet ini.' });
            }
            if (record.status !== 'pending') {
                return res.status(409).json({ success: false, error: `Request sudah dalam status "${record.status}".` });
            }
            if (action === 'reject') {
                const extra = {};
                if (reason?.trim()) extra.rejectReason = reason.trim();
                await updateTranscriptStatus(requestId, 'rejected', extra);
                return res.json({ success: true, requestId, status: 'rejected' });
            }
            // action === 'approve' → student approves, awaiting ministry
            await updateTranscriptStatus(requestId, 'student_approved');
            return res.json({ success: true, requestId, status: 'student_approved' });
        }

        if (action === 'mint') {
            if (record.studentWallet !== studentWallet.toLowerCase()) {
                return res.status(403).json({ success: false, error: 'Bukan request milik wallet ini.' });
            }
            if (record.status !== 'ministry_approved') {
                return res.status(409).json({ success: false, error: `Belum disetujui kementerian. Status saat ini: "${record.status}".` });
            }
            await updateTranscriptStatus(requestId, 'minted', { txHash: txHash || '' });
            return res.json({ success: true, requestId, status: 'minted' });
        }

        if (action === 'ministry_approve') {
            if (record.status !== 'student_approved') {
                return res.status(409).json({ success: false, error: `Status harus "student_approved". Saat ini: "${record.status}".` });
            }
            await updateTranscriptStatus(requestId, 'ministry_approved');
            return res.json({ success: true, requestId, status: 'ministry_approved' });
        }

        if (action === 'ministry_mint') {
            const configWallet2 = await getConfig('ministryWallet').catch(() => null);
            const MW2 = configWallet2 || MINISTRY_WALLET_ENV;
            if (!MW2) return res.status(503).json({ success: false, error: 'Konfigurasi kementerian belum diatur.' });
            if (!ministryWallet || ministryWallet.toLowerCase() !== MW2) {
                return res.status(403).json({ success: false, error: 'Hanya wallet Kementerian yang dapat melakukan tindakan ini.' });
            }
            if (!['student_approved', 'ministry_approved'].includes(record.status)) {
                return res.status(409).json({ success: false, error: `Tidak dapat mint dari status "${record.status}".` });
            }
            await updateTranscriptStatus(requestId, 'minted', { txHash: txHash || '' });
            return res.json({ success: true, requestId, status: 'minted' });
        }

        if (action === 'ministry_reject') {
            if (!['student_approved', 'pending'].includes(record.status)) {
                return res.status(409).json({ success: false, error: `Request tidak dapat ditolak dari status "${record.status}".` });
            }
            const extra = {};
            if (reason?.trim()) extra.rejectReason = reason.trim();
            await updateTranscriptStatus(requestId, 'rejected', extra);
            return res.json({ success: true, requestId, status: 'rejected' });
        }

    } catch (err) {
        console.error('[student/approve-transcript]', err);
        return res.status(500).json({ success: false, error: err.message || 'Internal server error.' });
    }
}
