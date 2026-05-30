import { ethers } from 'ethers';
import { getPendingTranscriptsForSchool } from '../lib/firebaseAdmin.js';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const { schoolWallet } = req.query;
    if (!ethers.isAddress(schoolWallet)) {
        return res.status(400).json({ success: false, error: 'schoolWallet tidak valid.' });
    }

    try {
        const requests = await getPendingTranscriptsForSchool(schoolWallet);
        return res.json({ success: true, requests });
    } catch (err) {
        console.error('[school/requests]', err);
        return res.status(500).json({ success: false, error: err.message || 'Internal server error.' });
    }
}
