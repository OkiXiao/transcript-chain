import { ethers } from 'ethers';
import { getAllStudentApprovedTranscripts, getConfig } from '../_lib/firebaseAdmin.js';

const MINISTRY_WALLET_ENV = process.env.MINISTRY_WALLET?.toLowerCase() || '';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const { ministryWallet } = req.query;

    // Firebase config takes priority over env var
    const configWallet = await getConfig('ministryWallet').catch(() => null);
    const MINISTRY_WALLET = configWallet || MINISTRY_WALLET_ENV;

    if (!MINISTRY_WALLET) {
        return res.status(503).json({ success: false, error: 'Konfigurasi kementerian belum diatur.' });
    }
    if (!ethers.isAddress(ministryWallet) || ministryWallet.toLowerCase() !== MINISTRY_WALLET) {
        return res.status(403).json({ success: false, error: 'Akses ditolak. Wallet ini bukan wallet Kementerian.' });
    }

    try {
        const requests = await getAllStudentApprovedTranscripts();
        const sorted = requests.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        return res.json({ success: true, requests: sorted });
    } catch (err) {
        console.error('[ministry/requests]', err);
        return res.status(500).json({ success: false, error: err.message || 'Internal server error.' });
    }
}
