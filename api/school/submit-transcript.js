import { ethers } from 'ethers';
import { createPendingTranscript, resubmitTranscript } from '../lib/firebaseAdmin.js';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const {
        schoolWallet, schoolName, studentWallet, studentName, nim,
        grades, pdfCID, photoCID, metadataURI, schoolSignature,
        birthPlace, birthDate, faculty, major, degree, jenjang,
        editingRequestId,
    } = req.body;

    if (!schoolWallet || !studentWallet || !studentName || !nim || !metadataURI || !schoolSignature) {
        return res.status(400).json({
            success: false,
            error: 'Field wajib: schoolWallet, studentWallet, studentName, nim, metadataURI, schoolSignature.',
        });
    }
    if (!ethers.isAddress(schoolWallet) || !ethers.isAddress(studentWallet)) {
        return res.status(400).json({ success: false, error: 'Alamat wallet tidak valid.' });
    }

    const transcriptData = {
        schoolWallet: schoolWallet.toLowerCase(),
        schoolName: schoolName || '',
        studentWallet: studentWallet.toLowerCase(),
        studentName,
        nim,
        grades: Array.isArray(grades) ? grades : [],
        pdfCID: pdfCID || '',
        photoCID: photoCID || '',
        metadataURI,
        schoolSignature,
        birthPlace: birthPlace || '',
        birthDate: birthDate || '',
        faculty: faculty || '',
        major: major || '',
        degree: degree || '',
        jenjang: (['S1','S2','S3'].includes(jenjang) ? jenjang : 'S1'),
    };

    try {
        if (editingRequestId) {
            // Re-submit: update the existing rejected record back to pending
            await resubmitTranscript(editingRequestId, transcriptData);
            return res.json({ success: true, requestId: editingRequestId, resubmitted: true });
        }

        const requestId = await createPendingTranscript(transcriptData);
        return res.json({ success: true, requestId });
    } catch (err) {
        console.error('[school/submit-transcript]', err);
        return res.status(500).json({ success: false, error: err.message || 'Internal server error.' });
    }
}
