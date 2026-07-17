import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import validateEmailHandler from '../api/auth/validate-email.js';
import adminHandler         from '../api/admin.js';
import uploadPdfHandler     from '../api/school/upload-pdf.js';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env') });

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(cors());

// Skip express.json for upload-pdf — formidable reads the raw stream directly
app.use((req, res, next) => {
    if (req.path === '/api/school/upload-pdf') return next();
    express.json()(req, res, next);
});

app.all('/api/auth/validate-email',  validateEmailHandler);
app.all('/api/admin',                adminHandler);
app.post('/api/school/upload-pdf',   uploadPdfHandler);

app.get('/api/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.listen(PORT, () => {
    console.log(`\n🚀 TranscriptChain dev server: http://localhost:${PORT}`);
    console.log(`   Vite proxy: /api → http://localhost:${PORT}\n`);
    console.log('  POST /api/auth/validate-email');
    console.log('  GET/POST /api/admin');
    console.log('  POST /api/school/upload-pdf\n');
});
