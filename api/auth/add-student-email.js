import { ethers } from 'ethers';
import { addStudentEmail, bulkAddStudentEmails } from '../_lib/firebaseAdmin.js';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { schoolWallet, studentEmail, emails, walletSignature, timestamp } = req.body;
    const isBulk = Array.isArray(emails);

    if (!schoolWallet || !walletSignature || !timestamp || (!studentEmail && !isBulk)) {
        return res.status(400).json({ success: false, error: 'Field wajib: schoolWallet, walletSignature, timestamp, dan studentEmail atau emails (array).' });
    }
    if (!ethers.isAddress(schoolWallet)) {
        return res.status(400).json({ success: false, error: 'schoolWallet tidak valid.' });
    }

    const now = Date.now();
    const ts  = Number(timestamp);
    if (Math.abs(now - ts) > 5 * 60 * 1000) {
        return res.status(400).json({ success: false, error: 'Timestamp kadaluarsa. Silakan coba lagi.' });
    }

    try {
        let message;
        if (isBulk) {
            message = `TranscriptChain: Bulk add ${emails.length} student emails by ${schoolWallet.toLowerCase()} at ${timestamp}`;
        } else {
            message = `TranscriptChain: Add student email ${studentEmail.toLowerCase().trim()} by ${schoolWallet.toLowerCase()} at ${timestamp}`;
        }

        const recovered = ethers.verifyMessage(message, walletSignature);
        if (recovered.toLowerCase() !== schoolWallet.toLowerCase()) {
            return res.status(403).json({ success: false, error: 'Signature tidak valid.' });
        }

        if (isBulk) {
            const valid = emails.filter(e => typeof e === 'string' && e.includes('@'));
            await bulkAddStudentEmails(schoolWallet, valid);
            const skipped = emails.length - valid.length;
            return res.json({ success: true, added: valid.length, skipped, message: `${valid.length} email ditambahkan, ${skipped} dilewati.` });
        } else {
            const emailTrimmed = studentEmail.toLowerCase().trim();
            if (!emailTrimmed.includes('@') || !emailTrimmed.includes('.')) {
                return res.status(400).json({ success: false, error: 'Format email mahasiswa tidak valid.' });
            }
            await addStudentEmail(schoolWallet, emailTrimmed);
            return res.json({ success: true, message: `Email "${emailTrimmed}" berhasil ditambahkan.` });
        }
    } catch (err) {
        console.error('[add-student-email]', err);
        return res.status(500).json({ success: false, error: err.message || 'Internal server error.' });
    }
}
