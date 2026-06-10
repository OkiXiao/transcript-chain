/**
 * Daftarkan atau update data lengkap mahasiswa di NIM registry Firebase.
 * POST /api/nim/register
 */
import { ethers } from 'ethers';
import { addNimRecord, addStudentEmail } from '../_lib/firebaseAdmin.js';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // ── Bulk import ──────────────────────────────────────────────
    if (req.body?.isBulk && Array.isArray(req.body.students)) {
        const { schoolWallet, students, signature, timestamp } = req.body;
        if (!schoolWallet || !ethers.isAddress(schoolWallet)) {
            return res.status(400).json({ success: false, error: 'schoolWallet tidak valid.' });
        }
        if (!signature || !timestamp) {
            return res.status(400).json({ success: false, error: 'Signature dan timestamp wajib.' });
        }
        const now = Date.now();
        const ts = Number(timestamp);
        if (Math.abs(now - ts) > 5 * 60 * 1000) {
            return res.status(400).json({ success: false, error: 'Timestamp kadaluarsa.' });
        }
        const message = `TranscriptChain: Bulk register ${students.length} students for ${schoolWallet.toLowerCase()} at ${timestamp}`;
        try {
            const recovered = ethers.verifyMessage(message, signature);
            if (recovered.toLowerCase() !== schoolWallet.toLowerCase()) {
                return res.status(403).json({ success: false, error: 'Signature tidak valid.' });
            }
        } catch {
            return res.status(403).json({ success: false, error: 'Signature tidak dapat diverifikasi.' });
        }

        const results = await Promise.allSettled(
            students
                .filter(s => s.nim?.trim() && s.name?.trim())
                .map(async (student) => {
                    const cleanEmail = (student.email || '').toLowerCase().trim();
                    await addNimRecord(schoolWallet, student.nim.trim(), {
                        name: student.name.trim(),
                        email: cleanEmail,
                        walletAddress: (student.walletAddress || '').toLowerCase().trim(),
                        birthPlace: (student.birthPlace || '').trim(),
                        birthDate: (student.birthDate || '').trim(),
                        faculty: (student.faculty || '').trim(),
                        major: (student.major || '').trim(),
                        degree: (student.degree || '').trim(),
                        jenjang: (['S1','S2','S3'].includes(student.jenjang) ? student.jenjang : 'S1'),
                        tahunLulus: (student.tahunLulus || '').trim(),
                    });
                    if (cleanEmail) await addStudentEmail(schoolWallet, cleanEmail);
                    return student.nim;
                })
        );
        const errors = results
            .map((r, i) => r.status === 'rejected' ? { nim: students[i]?.nim, error: r.reason?.message } : null)
            .filter(Boolean);
        const imported = results.filter(r => r.status === 'fulfilled').length;
        return res.json({ success: true, imported, total: students.length, errors });
    }

    const {
        schoolWallet, nim, name, email, walletAddress,
        birthPlace, birthDate, faculty, major, degree, jenjang, tahunLulus,
        signature, timestamp,
    } = req.body;

    if (!schoolWallet || !nim || !name) {
        return res.status(400).json({ success: false, error: 'Field wajib: schoolWallet, nim, name.' });
    }
    if (!ethers.isAddress(schoolWallet)) {
        return res.status(400).json({ success: false, error: 'schoolWallet tidak valid.' });
    }

    // Verifikasi signature dari school wallet agar tidak sembarangan bisa menulis data
    if (signature && timestamp) {
        const now = Date.now();
        const ts = Number(timestamp);
        if (Math.abs(now - ts) > 5 * 60 * 1000) {
            return res.status(400).json({ success: false, error: 'Timestamp kadaluarsa.' });
        }
        const message = `TranscriptChain: Register NIM ${nim} for ${schoolWallet.toLowerCase()} at ${timestamp}`;
        try {
            const recovered = ethers.verifyMessage(message, signature);
            if (recovered.toLowerCase() !== schoolWallet.toLowerCase()) {
                return res.status(403).json({ success: false, error: 'Signature tidak valid.' });
            }
        } catch {
            return res.status(403).json({ success: false, error: 'Signature tidak dapat diverifikasi.' });
        }
    }

    try {
        const cleanEmail = (email || '').toLowerCase().trim();

        await addNimRecord(schoolWallet, nim.trim(), {
            name: name.trim(),
            email: cleanEmail,
            walletAddress: (walletAddress || '').toLowerCase(),
            birthPlace: (birthPlace || '').trim(),
            birthDate: (birthDate || '').trim(),
            faculty: (faculty || '').trim(),
            major: (major || '').trim(),
            degree: (degree || '').trim(),
            jenjang: (['S1','S2','S3'].includes(jenjang) ? jenjang : 'S1'),
            tahunLulus: (tahunLulus || '').trim(),
        });

        if (cleanEmail) {
            await addStudentEmail(schoolWallet, cleanEmail);
        }

        return res.json({ success: true, message: `NIM ${nim} berhasil didaftarkan/diperbarui.` });
    } catch (err) {
        console.error('[nim/register]', err);
        return res.status(500).json({ success: false, error: err.message || 'Internal server error.' });
    }
}
