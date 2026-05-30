import { ethers } from 'ethers';
import { getAllowedSchools, getAllowedHR, addToWhitelist, removeFromWhitelist, getConfig, setConfig } from './lib/firebaseAdmin.js';

const ADMIN_WALLET = process.env.ADMIN_WALLET?.toLowerCase() || '';

function validateAdmin(wallet, res) {
    if (!ADMIN_WALLET) {
        res.status(503).json({ success: false, error: 'Admin belum dikonfigurasi. Set ADMIN_WALLET di environment.' });
        return false;
    }
    if (!wallet || wallet.toLowerCase() !== ADMIN_WALLET) {
        res.status(403).json({ success: false, error: 'Akses ditolak. Wallet ini bukan wallet Admin.' });
        return false;
    }
    return true;
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        // ─── GET: list whitelist ─────────────────────────────────
        if (req.method === 'GET') {
            const { adminWallet, type } = req.query;
            if (!validateAdmin(adminWallet, res)) return;

            if (type === 'schools') {
                const schools = await getAllowedSchools();
                return res.json({ success: true, schools });
            }
            if (type === 'hr') {
                const hr = await getAllowedHR();
                return res.json({ success: true, hr });
            }
            if (type === 'config') {
                const ministryWallet = await getConfig('ministryWallet') || process.env.MINISTRY_WALLET || '';
                return res.json({ success: true, ministryWallet });
            }
            // Return both
            const [schools, hr] = await Promise.all([getAllowedSchools(), getAllowedHR()]);
            return res.json({ success: true, schools, hr });
        }

        // ─── POST: add to whitelist ──────────────────────────────
        if (req.method === 'POST') {
            const { adminWallet, action, email, schoolName, companyName } = req.body;
            if (!validateAdmin(adminWallet, res)) return;

            if (action === 'set_ministry') {
                const { ministryWallet: mw } = req.body;
                if (!mw || !ethers.isAddress(mw)) {
                    return res.status(400).json({ success: false, error: 'Alamat wallet Kementerian tidak valid.' });
                }
                await setConfig('ministryWallet', mw.toLowerCase());
                return res.json({ success: true, message: `Wallet Kementerian berhasil diset ke ${mw}.` });
            }

            if (!email || !email.includes('@')) {
                return res.status(400).json({ success: false, error: 'Email tidak valid.' });
            }

            if (action === 'add_school') {
                await addToWhitelist('schools', email, adminWallet, { schoolName: schoolName || '' });
                return res.json({ success: true, message: `Email "${email}" berhasil ditambahkan sebagai sekolah.` });
            }
            if (action === 'add_hr') {
                await addToWhitelist('hr', email, adminWallet, { companyName: companyName || '' });
                return res.json({ success: true, message: `Email "${email}" berhasil ditambahkan sebagai HR.` });
            }
            if (action === 'remove_school') {
                await removeFromWhitelist('schools', email);
                return res.json({ success: true, message: `Email "${email}" dihapus dari whitelist sekolah.` });
            }
            if (action === 'remove_hr') {
                await removeFromWhitelist('hr', email);
                return res.json({ success: true, message: `Email "${email}" dihapus dari whitelist HR.` });
            }

            return res.status(400).json({ success: false, error: 'action tidak dikenal.' });
        }

        return res.status(405).json({ error: 'Method not allowed' });

    } catch (err) {
        console.error('[admin]', err);
        return res.status(500).json({ success: false, error: err.message || 'Internal server error.' });
    }
}
