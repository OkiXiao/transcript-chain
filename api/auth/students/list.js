import { ethers } from 'ethers';
import { getAllNimRecords } from '../../lib/firebaseAdmin.js';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const { schoolWallet } = req.query;

    if (!schoolWallet || !ethers.isAddress(schoolWallet)) {
        return res.status(400).json({ success: false, error: 'schoolWallet tidak valid.' });
    }

    try {
        const records = await getAllNimRecords(schoolWallet);
        const students = Object.entries(records).map(([nim, data]) => ({ nim, ...data }));
        students.sort((a, b) => a.nim.localeCompare(b.nim));
        return res.json({ success: true, schoolWallet, students, count: students.length });
    } catch (err) {
        console.error('[students/list]', err);
        return res.status(500).json({ success: false, error: err.message || 'Internal server error.' });
    }
}
