import { createHash } from 'crypto';
import { IncomingForm } from 'formidable';
import fs from 'fs';
import { uploadBufferToPinata, uploadJSONToPinata } from '../_lib/pinata.js';

export const config = { api: { bodyParser: false } };

function parseForm(req) {
    return new Promise((resolve, reject) => {
        const form = new IncomingForm({ maxFileSize: 20 * 1024 * 1024 }); // 20 MB limit
        form.parse(req, (err, fields, files) => {
            if (err) reject(err);
            else resolve({ fields, files });
        });
    });
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { fields, files } = await parseForm(req);

        const pdfFile = Array.isArray(files.pdf) ? files.pdf[0] : files.pdf;
        if (!pdfFile) return res.status(400).json({ success: false, error: 'File PDF tidak ditemukan.' });

        const recipientName = (Array.isArray(fields.recipientName) ? fields.recipientName[0] : fields.recipientName) || '';
        const institution   = (Array.isArray(fields.institution)   ? fields.institution[0]   : fields.institution)   || '';
        const schoolWallet  = (Array.isArray(fields.schoolWallet)  ? fields.schoolWallet[0]  : fields.schoolWallet)  || '';

        // ── 1. Read PDF buffer & compute SHA-256 ──────────────────────────────
        const pdfBuffer = fs.readFileSync(pdfFile.filepath);
        const sha256Hex = createHash('sha256').update(pdfBuffer).digest('hex');
        const sha256Hash = '0x' + sha256Hex; // hex string untuk on-chain bytes32

        // ── 2. Upload PDF to IPFS ─────────────────────────────────────────────
        const timestamp   = Date.now();
        const pdfFileName = `transcript_${timestamp}.pdf`;
        const pinataFile  = await uploadBufferToPinata(pdfBuffer, pdfFileName, 'application/pdf');
        const pdfCID      = pinataFile.IpfsHash;

        // ── 3. Build metadata JSON ────────────────────────────────────────────
        const issuedAt = Math.floor(timestamp / 1000);
        const metadata = {
            name:         `Transkrip Akademik${recipientName ? ' - ' + recipientName : ''}`,
            description:  'NFT Transkrip Akademik TranscriptChain',
            image:        'ipfs://QmQkwrZKuLzKHrxhvdC9Y5PL1GxABzjpZkgRD7ZoEHRFMv', // placeholder
            external_url: `ipfs://${pdfCID}`,
            attributes: {
                sha256Hash,
                pdfCID,
                issuedBy:    schoolWallet,
                issuedAt,
                institution,
            },
        };

        // ── 4. Upload metadata JSON to IPFS ───────────────────────────────────
        const metaFileName = `metadata_${timestamp}.json`;
        const pinataMeta   = await uploadJSONToPinata(metadata, metaFileName);
        const metadataURI  = `ipfs://${pinataMeta.IpfsHash}`;

        return res.json({
            success: true,
            sha256Hash,
            pdfCID,
            metadataURI,
        });
    } catch (err) {
        console.error('[upload-pdf]', err);
        return res.status(500).json({ success: false, error: err.message || 'Internal server error.' });
    }
}
