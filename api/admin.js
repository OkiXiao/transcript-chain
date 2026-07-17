import { ethers } from 'ethers';
import { getAllowedSchools, getAllowedHR, addToWhitelist, removeFromWhitelist, getAllRegisteredEmails, removeRegisteredEmail } from './_lib/firebaseAdmin.js';

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
            const [schools, hr] = await Promise.all([getAllowedSchools(), getAllowedHR()]);
            return res.json({ success: true, schools, hr });
        }

        // ─── POST ────────────────────────────────────────────────
        if (req.method === 'POST') {
            const { adminWallet, action, email, schoolName, companyName } = req.body;
            if (!validateAdmin(adminWallet, res)) return;

            // ── reset_wallets: deactivate all except admin ──
            if (action === 'reset_wallets') {
                const KEEP = new Set([
                    (process.env.ADMIN_WALLET || '').toLowerCase(),
                ].filter(Boolean));

                const RPC      = process.env.SEPOLIA_RPC_URL || process.env.RPC_URL;
                const REG_ADDR = process.env.USER_REGISTRY_ADDRESS;
                const PRIV_KEY = process.env.DEPLOYER_PRIVATE_KEY;
                if (!RPC || !REG_ADDR || !PRIV_KEY) {
                    return res.status(500).json({ success: false, error: 'Missing RPC/registry/deployer env vars.' });
                }

                const REGISTRY_ABI = [
                    'function isRegistered(address) view returns (bool)',
                    'function deactivateUser(address wallet)',
                ];
                const provider = new ethers.JsonRpcProvider(RPC);
                const deployer = new ethers.Wallet(PRIV_KEY, provider);
                const registry = new ethers.Contract(REG_ADDR, REGISTRY_ABI, deployer);

                const allEmails = await getAllRegisteredEmails();
                const entries   = Object.entries(allEmails).map(([key, data]) => ({
                    key, email: data.email, wallet: (data.walletAddress || '').toLowerCase(), role: data.role,
                })).filter(e => e.wallet && !KEEP.has(e.wallet));

                const feeData = await provider.getFeeData();
                const baseFee = feeData.lastBaseFeePerGas || ethers.parseUnits('2', 'gwei');
                const gasOpts = {
                    maxFeePerGas:         baseFee + ethers.parseUnits('4', 'gwei'),
                    maxPriorityFeePerGas: ethers.parseUnits('2', 'gwei'),
                    gasLimit:             80_000n,
                    chainId:              11155111n,
                };
                let nonce = await provider.getTransactionCount(deployer.address, 'latest');

                const deactivated = [], skipped = [], errors = [];

                for (const entry of entries) {
                    try {
                        const onChain = await registry.isRegistered(entry.wallet);
                        if (onChain) {
                            const signed = await deployer.signTransaction({
                                to: REG_ADDR,
                                data: registry.interface.encodeFunctionData('deactivateUser', [entry.wallet]),
                                nonce, ...gasOpts,
                            });
                            const txBody = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_sendRawTransaction', params: [signed] });
                            const resp   = await Promise.race([
                                fetch(RPC, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: txBody }).then(r => r.json()),
                                new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000)),
                            ]).catch(() => ({}));
                            nonce++;
                            await removeRegisteredEmail(entry.key);
                            deactivated.push({ wallet: entry.wallet, email: entry.email, role: entry.role, txHash: resp.result || null });
                        } else {
                            await removeRegisteredEmail(entry.key);
                            skipped.push({ wallet: entry.wallet, email: entry.email, reason: 'not on-chain' });
                        }
                    } catch (err) {
                        errors.push({ wallet: entry.wallet, email: entry.email, error: err.message });
                    }
                }

                return res.json({
                    success: true,
                    kept: [...KEEP],
                    deactivated,
                    skipped,
                    errors,
                    summary: `${deactivated.length} dinonaktifkan, ${skipped.length} hanya Firebase, ${errors.length} error`,
                });
            }

            // ── whitelist actions (require email) ──
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
