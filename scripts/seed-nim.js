/**
 * Seed NIM data ke Firebase untuk testing.
 * Run: node scripts/seed-nim.js
 * Pastikan .env.local sudah ada (jalankan: vercel env pull .env.local)
 */
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Coba .env.local dulu (dari vercel env pull), fallback ke .env
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const projectId   = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey  = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
const databaseURL = process.env.FIREBASE_DATABASE_URL;

if (!projectId || !clientEmail || !privateKey || !databaseURL) {
    console.error('Firebase env vars belum ada. Jalankan: vercel env pull .env.local');
    process.exit(1);
}

if (!getApps().length) {
    initializeApp({ credential: cert({ projectId, clientEmail, privateKey }), databaseURL });
}
const db = getDatabase();

// School wallet yang sudah terdaftar (deployer = admin = school)
const SCHOOL_WALLET = '0x829b0515ae678d77a1283faca5a8895664c1e998';

const nimData = [
    { nim: '2021001', name: 'Budi Santoso',      email: 'budi.santoso@student.univ.ac.id',      walletAddress: '' },
    { nim: '2021002', name: 'Siti Rahayu',        email: 'siti.rahayu@student.univ.ac.id',        walletAddress: '' },
    { nim: '2021003', name: 'Ahmad Fauzi',         email: 'ahmad.fauzi@student.univ.ac.id',         walletAddress: '' },
    { nim: '2021004', name: 'Dewi Lestari',        email: 'dewi.lestari@student.univ.ac.id',        walletAddress: '' },
    { nim: '2021005', name: 'Reza Pratama',        email: 'reza.pratama@student.univ.ac.id',        walletAddress: '' },
    { nim: '2021006', name: 'Nurul Hidayah',       email: 'nurul.hidayah@student.univ.ac.id',       walletAddress: '' },
];

async function seed() {
    const updates = {};
    for (const r of nimData) {
        updates[`nimRegistry/${SCHOOL_WALLET}/${r.nim}`] = {
            name: r.name,
            email: r.email,
            walletAddress: r.walletAddress,
            addedAt: new Date().toISOString(),
        };
    }
    await db.ref('/').update(updates);
    console.log(`Seeded ${nimData.length} NIM records for school ${SCHOOL_WALLET}`);
    nimData.forEach(r => console.log(`  ${r.nim} → ${r.name}`));
    process.exit(0);
}

seed().catch(err => { console.error(err); process.exit(1); });
