import express from 'express';
import multer from 'multer';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import authRouter from './auth.js';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env') });

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Middleware ───
app.use(cors());
app.use(express.json());

// ─── Auth / RBAC Routes ───
app.use('/api/auth', authRouter);

// Configure multer for file uploads (store temporarily)
const upload = multer({
    dest: 'uploads/',
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Hanya file PDF yang diperbolehkan'), false);
        }
    },
});

// ─── Pinata IPFS Helper ───
const PINATA_API_KEY = process.env.PINATA_API_KEY;
const PINATA_SECRET_KEY = process.env.PINATA_SECRET_KEY;

/**
 * Upload file to Pinata IPFS
 * Uses Pinata REST API v1 for pinning
 */
async function uploadFileToPinata(filePath, fileName) {
    const fileBuffer = fs.readFileSync(filePath);
    const blob = new Blob([fileBuffer], { type: 'application/pdf' });

    const formData = new FormData();
    formData.append('file', blob, fileName);
    formData.append('pinataMetadata', JSON.stringify({ name: fileName }));

    const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
        method: 'POST',
        headers: {
            'pinata_api_key': PINATA_API_KEY,
            'pinata_secret_api_key': PINATA_SECRET_KEY,
        },
        body: formData,
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Pinata upload failed: ${err}`);
    }

    return await res.json();
}

/**
 * Upload JSON metadata to Pinata IPFS
 */
async function uploadJSONToPinata(jsonData, name) {
    const body = {
        pinataContent: jsonData,
        pinataMetadata: { name },
    };

    const res = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'pinata_api_key': PINATA_API_KEY,
            'pinata_secret_api_key': PINATA_SECRET_KEY,
        },
        body: JSON.stringify(body),
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Pinata JSON upload failed: ${err}`);
    }

    return await res.json();
}

// ============================================================
//                       API ROUTES
// ============================================================

/**
 * POST /api/upload-transcript
 * 
 * Receives PDF file + metadata, uploads to IPFS, returns CIDs.
 * Flow:
 * 1. Upload PDF to Pinata → get pdfCID
 * 2. Create metadata JSON with pdfCID → upload to Pinata → get metadataCID
 * 3. Return both CIDs to frontend for NFT minting
 */
app.post('/api/upload-transcript', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'File PDF diperlukan' });
        }

        if (!PINATA_API_KEY || !PINATA_SECRET_KEY) {
            return res.status(500).json({ error: 'Pinata API belum dikonfigurasi. Set PINATA_API_KEY dan PINATA_SECRET_KEY di .env' });
        }

        const { studentName, schoolAddress } = req.body;

        if (!studentName || !schoolAddress) {
            return res.status(400).json({ error: 'studentName dan schoolAddress diperlukan' });
        }

        console.log(`[Upload] Student: ${studentName}, School: ${schoolAddress}`);
        console.log(`[Upload] File: ${req.file.originalname} (${req.file.size} bytes)`);

        // Step 1: Upload PDF to IPFS
        console.log('[IPFS] Uploading PDF to Pinata...');
        const pdfResult = await uploadFileToPinata(req.file.path, req.file.originalname);
        const pdfCID = pdfResult.IpfsHash;
        console.log(`[IPFS] PDF uploaded: ${pdfCID}`);

        // Step 2: Create and upload metadata JSON
        const metadata = {
            name: `Transcript - ${studentName}`,
            description: `Academic transcript for ${studentName}, issued by school wallet ${schoolAddress}`,
            image: `ipfs://${pdfCID}`,
            external_url: `https://gateway.pinata.cloud/ipfs/${pdfCID}`,
            attributes: [
                { trait_type: 'Student Name', value: studentName },
                { trait_type: 'School Address', value: schoolAddress },
                { trait_type: 'Document Type', value: 'Academic Transcript' },
                { trait_type: 'Issue Date', value: new Date().toISOString() },
                { trait_type: 'PDF CID', value: pdfCID },
            ],
        };

        console.log('[IPFS] Uploading metadata JSON to Pinata...');
        const metadataResult = await uploadJSONToPinata(metadata, `metadata-${studentName}`);
        const metadataCID = metadataResult.IpfsHash;
        console.log(`[IPFS] Metadata uploaded: ${metadataCID}`);

        // Cleanup temp file
        fs.unlinkSync(req.file.path);

        // Return CIDs
        res.json({
            pdfCID,
            metadataCID,
            metadataURI: `ipfs://${metadataCID}`,
            pdfURL: `https://gateway.pinata.cloud/ipfs/${pdfCID}`,
            metadataURL: `https://gateway.pinata.cloud/ipfs/${metadataCID}`,
        });

    } catch (err) {
        console.error('[Upload Error]', err);
        // Cleanup temp file on error
        if (req.file?.path && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).json({ error: err.message || 'Upload gagal' });
    }
});

/**
 * GET /api/health
 * Health check endpoint
 */
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        pinataConfigured: !!(PINATA_API_KEY && PINATA_SECRET_KEY),
        timestamp: new Date().toISOString(),
    });
});

// ─── Error handling ───
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'File terlalu besar (maks. 10MB)' });
        }
    }
    res.status(500).json({ error: err.message || 'Internal server error' });
});

// ─── Start server ───
app.listen(PORT, () => {
    console.log(`\n🚀 TranscriptChain API Server running on http://localhost:${PORT}`);
    console.log(`📦 Pinata IPFS: ${PINATA_API_KEY ? '✅ Configured' : '❌ Not configured'}`);
    console.log(`\nEndpoints:`);
    console.log(`  POST /api/upload-transcript              - Upload PDF ke IPFS`);
    console.log(`  GET  /api/health                         - Health check`);
    console.log(`  POST /api/auth/validate-email            - Validasi email + terbitkan signature registrasi`);
    console.log(`  POST /api/auth/add-student-email         - Sekolah menambah email mahasiswa`);
    console.log(`  POST /api/auth/bulk-add-student-emails   - Sekolah bulk-upload email mahasiswa`);
    console.log(`  GET  /api/auth/students/:wallet          - Daftar email mahasiswa per sekolah`);
    console.log(`  GET  /api/auth/signer-address            - Alamat publik backend signer\n`);
});
