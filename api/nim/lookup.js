import { ethers } from 'ethers';
import { getNimRecord } from '../lib/firebaseAdmin.js';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const { schoolWallet, nim } = req.query;

    if (!ethers.isAddress(schoolWallet)) {
        return res.status(400).json({ success: false, error: 'schoolWallet tidak valid.' });
    }
    if (!nim || typeof nim !== 'string' || nim.trim() === '') {
        return res.status(400).json({ success: false, error: 'nim wajib diisi.' });
    }

    try {
        const record = await getNimRecord(schoolWallet, nim.trim());
        if (!record) {
            return res.status(404).json({ success: false, error: `NIM "${nim}" tidak ditemukan di database sekolah ini.` });
        }
        return res.json({ success: true, nim: nim.trim(), ...record });
    } catch (err) {
        console.error('[nim/lookup]', err);
        return res.status(500).json({ success: false, error: err.message || 'Internal server error.' });
    }
}
