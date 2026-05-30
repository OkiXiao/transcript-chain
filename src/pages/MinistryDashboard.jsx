import { useState, useEffect, useCallback } from 'react';
import { useWeb3 } from '../context/Web3Context';
import { ethers } from 'ethers';

function GradesTable({ grades }) {
    if (!grades?.length) return null;
    const totalSks = grades.reduce((s, g) => s + (parseInt(g.sks) || 0), 0);
    return (
        <div style={{ borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-sm)' }}>
                    <thead>
                        <tr style={{ background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid var(--border)' }}>
                            <th style={{ textAlign: 'left', padding: '10px 14px', color: 'var(--text-muted)', fontWeight: 600, fontSize: 'var(--font-xs)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>KMK</th>
                            <th style={{ textAlign: 'left', padding: '10px 14px', color: 'var(--text-muted)', fontWeight: 600, fontSize: 'var(--font-xs)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Mata Kuliah</th>
                            <th style={{ textAlign: 'center', padding: '10px 14px', color: 'var(--text-muted)', fontWeight: 600, fontSize: 'var(--font-xs)', letterSpacing: '0.05em', textTransform: 'uppercase', width: 70 }}>Nilai</th>
                            <th style={{ textAlign: 'center', padding: '10px 14px', color: 'var(--text-muted)', fontWeight: 600, fontSize: 'var(--font-xs)', letterSpacing: '0.05em', textTransform: 'uppercase', width: 70 }}>SKS</th>
                        </tr>
                    </thead>
                    <tbody>
                        {grades.map((g, i) => (
                            <tr key={i} style={{ borderBottom: i < grades.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none', transition: 'background 0.15s' }}>
                                <td style={{ padding: '9px 14px', color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: 'var(--font-xs)' }}>{g.kmk}</td>
                                <td style={{ padding: '9px 14px', color: 'var(--text-secondary)' }}>{g.courseName}</td>
                                <td style={{ padding: '9px 14px', textAlign: 'center', fontWeight: 700,
                                    color: g.grade === 'A' ? '#4ade80' : g.grade === 'A-' ? '#86efac' : g.grade === 'E' || g.grade === 'D' ? '#f87171' : 'var(--text-primary)' }}>
                                    {g.grade}
                                </td>
                                <td style={{ padding: '9px 14px', textAlign: 'center', color: 'var(--text-muted)' }}>{g.sks || '-'}</td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot>
                        <tr style={{ borderTop: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
                            <td colSpan={2} style={{ padding: '9px 14px', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', fontWeight: 600 }}>
                                Total — {grades.length} Mata Kuliah
                            </td>
                            <td></td>
                            <td style={{ padding: '9px 14px', textAlign: 'center', fontWeight: 700, color: 'var(--primary)' }}>{totalSks}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    );
}

function InfoChip({ label, value }) {
    if (!value) return null;
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', fontWeight: 600 }}>{label}</span>
            <span style={{ fontSize: 'var(--font-sm)', color: 'var(--text-secondary)' }}>{value}</span>
        </div>
    );
}

function MinistryDashboard() {
    const { account, contract, signer, connectWallet, loading: walletLoading } = useWeb3();

    const [requests, setRequests]         = useState([]);
    const [loading, setLoading]           = useState(false);
    const [fetchError, setFetchError]     = useState('');
    const [accessDenied, setAccessDenied] = useState(false);
    const [unconfigured, setUnconfigured] = useState(false);

    const [expandedId, setExpandedId]     = useState(null);
    const [rejectingId, setRejectingId]   = useState(null);
    const [rejectReason, setRejectReason] = useState('');
    const [actionLoading, setActionLoading] = useState(null);
    const [sessionApproved, setSessionApproved] = useState(0);
    const [sessionRejected, setSessionRejected] = useState(0);
    const [actionError, setActionError]   = useState('');

    // Mint modal
    const [mintingReq, setMintingReq]     = useState(null);
    const [mintStep, setMintStep]         = useState('idle'); // idle | confirm | minting | waiting | done
    const [mintResult, setMintResult]     = useState(null);
    const [mintError, setMintError]       = useState('');

    const formatDate = (iso) => {
        if (!iso) return '-';
        return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
    };

    const fetchRequests = useCallback(async () => {
        if (!account) return;
        setLoading(true); setFetchError(''); setAccessDenied(false); setUnconfigured(false);
        try {
            const res = await fetch(`/api/ministry/requests?ministryWallet=${account}`);
            if (res.status === 403) { setAccessDenied(true); setLoading(false); return; }
            if (res.status === 503) { setUnconfigured(true); setLoading(false); return; }
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.error || 'Gagal mengambil data.');
            setRequests(data.requests || []);
        } catch (err) {
            setFetchError(err.message || 'Gagal menghubungi server.');
        } finally { setLoading(false); }
    }, [account]);

    useEffect(() => { fetchRequests(); }, [fetchRequests]);

    const openMintModal = (req) => {
        setMintingReq(req); setMintStep('confirm'); setMintResult(null); setMintError('');
    };
    const closeMintModal = () => {
        if (mintStep === 'minting' || mintStep === 'waiting') return;
        setMintingReq(null); setMintStep('idle'); setMintResult(null); setMintError('');
    };

    const confirmMint = async () => {
        if (!mintingReq || !contract || !signer) {
            setMintError('Contract atau signer tidak tersedia. Pastikan MetaMask terhubung.');
            return;
        }
        setMintError('');
        try {
            setMintStep('minting');
            const tx = await contract.mintTranscriptWithApproval(
                mintingReq.studentWallet,
                mintingReq.metadataURI,
                mintingReq.studentName,
                mintingReq.pdfCID,
                mintingReq.schoolSignature
            );
            setMintStep('waiting');
            const receipt = await tx.wait();

            let tokenId = null;
            for (const log of receipt.logs) {
                try {
                    const parsed = contract.interface.parseLog({ topics: log.topics, data: log.data });
                    if (parsed?.name === 'TranscriptMinted') { tokenId = parsed.args[0].toString(); break; }
                } catch { /* skip */ }
            }

            // Update Firebase status to minted
            const statusRes = await fetch('/api/student/approve-transcript', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ requestId: mintingReq.requestId, ministryWallet: account, action: 'ministry_mint', txHash: tx.hash }),
            });
            if (!statusRes.ok) {
                const statusErr = await statusRes.json().catch(() => ({}));
                console.error('[ministry_mint status update]', statusErr);
                throw new Error(`NFT berhasil di-mint (tx: ${tx.hash.slice(0,10)}...) tapi update status gagal: ${statusErr.error || statusRes.status}. Hubungi admin.`);
            }

            setMintStep('done');
            setMintResult({ tokenId, txHash: tx.hash });
            setSessionApproved(n => n + 1);
            setRequests(prev => prev.filter(r => r.requestId !== mintingReq.requestId));
        } catch (err) {
            if (err.code === 4001 || err.message?.includes('user rejected')) {
                setMintError('Transaksi dibatalkan oleh pengguna.');
            } else {
                setMintError(err.reason || err.message || 'Mint gagal. Coba lagi.');
            }
            setMintStep('confirm');
        }
    };

    const handleReject = async (requestId) => {
        if (!rejectReason.trim()) { setActionError('Alasan penolakan wajib diisi.'); return; }
        setActionLoading(requestId); setActionError('');
        try {
            const res = await fetch('/api/student/approve-transcript', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ requestId, ministryWallet: account, action: 'ministry_reject', reason: rejectReason }),
            });
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.error || 'Gagal menolak.');
            setSessionRejected(n => n + 1);
            setRequests(prev => prev.filter(r => r.requestId !== requestId));
        } catch (err) {
            setActionError(err.message || 'Gagal menolak.');
        } finally { setActionLoading(null); setRejectingId(null); setRejectReason(''); }
    };

    // ── Not connected ──────────────────────────────────────────────────────────
    if (!account) {
        return (
            <div className="container">
                <div className="connect-prompt">
                    <div className="connect-prompt-icon">🏛️</div>
                    <h2>Connect Wallet Kementerian</h2>
                    <p>Hubungkan wallet yang terdaftar sebagai Kementerian Pendidikan.</p>
                    <button className="btn btn-primary btn-lg" onClick={connectWallet} disabled={walletLoading}>
                        {walletLoading ? <><span className="spinner"></span> Connecting...</> : '🔗 Connect MetaMask'}
                    </button>
                </div>
            </div>
        );
    }

    // ── Not configured ─────────────────────────────────────────────────────────
    if (unconfigured) {
        return (
            <div className="container">
                <div className="access-denied">
                    <div className="access-denied-icon">⚙️</div>
                    <h2>Konfigurasi Belum Diatur</h2>
                    <p>Environment variable <code>MINISTRY_WALLET</code> belum diset di server.</p>
                    <p style={{ fontSize: 'var(--font-sm)', color: 'var(--text-muted)' }}>
                        Set <code>MINISTRY_WALLET</code> di Vercel Dashboard → Settings → Environment Variables.
                    </p>
                </div>
            </div>
        );
    }

    // ── Access denied ──────────────────────────────────────────────────────────
    if (accessDenied) {
        return (
            <div className="container">
                <div className="access-denied">
                    <div className="access-denied-icon">🚫</div>
                    <h2>Akses Ditolak</h2>
                    <p>Wallet ini tidak terdaftar sebagai Kementerian Pendidikan.</p>
                    <div className="wallet-display">{account}</div>
                </div>
            </div>
        );
    }

    // ── Main dashboard ─────────────────────────────────────────────────────────
    return (
        <div className="container" style={{ paddingTop: 'var(--space-2xl)', paddingBottom: 'var(--space-3xl)' }}>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-2xl)', flexWrap: 'wrap', gap: 'var(--space-md)' }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                        <div style={{ width: 44, height: 44, borderRadius: 'var(--radius-md)', background: 'linear-gradient(135deg, rgba(99,102,241,0.3), rgba(139,92,246,0.3))', border: '1px solid rgba(99,102,241,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem' }}>
                            🏛️
                        </div>
                        <div>
                            <h1 style={{ fontSize: 'var(--font-2xl)', fontWeight: 700, margin: 0, lineHeight: 1.2 }}>Kementerian Pendidikan</h1>
                            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--font-sm)', margin: 0, marginTop: 2 }}>Dashboard Verifikasi & Persetujuan Ijazah Nasional</p>
                        </div>
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.25)', borderRadius: 'var(--radius-md)', padding: '6px 12px', fontSize: 'var(--font-xs)', color: '#34d399' }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#34d399', flexShrink: 0 }}></span>
                        {account.slice(0, 6)}…{account.slice(-4)}
                    </div>
                    <button className="btn btn-secondary" onClick={fetchRequests} disabled={loading}
                        style={{ fontSize: 'var(--font-xs)', padding: '6px 14px' }}>
                        {loading ? <span className="spinner" style={{ width: 12, height: 12 }}></span> : '↻ Refresh'}
                    </button>
                </div>
            </div>

            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-md)', marginBottom: 'var(--space-2xl)' }}>
                {[
                    { label: 'Menunggu Review', value: requests.length, color: '#fbbf24', bg: 'rgba(251,191,36,0.08)', border: 'rgba(251,191,36,0.2)', icon: '⏳' },
                    { label: 'Disetujui Sesi Ini', value: sessionApproved, color: '#4ade80', bg: 'rgba(74,222,128,0.08)', border: 'rgba(74,222,128,0.2)', icon: '✓' },
                    { label: 'Ditolak Sesi Ini', value: sessionRejected, color: '#f87171', bg: 'rgba(248,113,113,0.08)', border: 'rgba(248,113,113,0.2)', icon: '✕' },
                ].map(({ label, value, color, bg, border, icon }) => (
                    <div key={label} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 'var(--radius-lg)', padding: 'var(--space-lg)', textAlign: 'center' }}>
                        <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                            <span style={{ color }}>{icon}</span> {label}
                        </div>
                        <div style={{ fontSize: '2.25rem', fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
                    </div>
                ))}
            </div>

            {/* Action error */}
            {actionError && (
                <div className="alert alert-error animate-fade-in" style={{ marginBottom: 'var(--space-lg)' }}>
                    <span className="alert-icon">⚠️</span>
                    <div>{actionError}</div>
                    <button style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', marginLeft: 'auto', opacity: 0.7, fontSize: '1rem' }} onClick={() => setActionError('')}>✕</button>
                </div>
            )}
            {fetchError && (
                <div className="alert alert-error animate-fade-in" style={{ marginBottom: 'var(--space-lg)' }}>
                    <span className="alert-icon">⚠️</span>
                    <div>{fetchError}</div>
                </div>
            )}

            {/* Loading */}
            {loading && requests.length === 0 && (
                <div style={{ textAlign: 'center', padding: 'var(--space-3xl)' }}>
                    <span className="spinner" style={{ width: 36, height: 36 }}></span>
                    <p style={{ marginTop: 16, color: 'var(--text-muted)', fontSize: 'var(--font-sm)' }}>Memuat data persetujuan...</p>
                </div>
            )}

            {/* Empty state */}
            {!loading && requests.length === 0 && !fetchError && (
                <div style={{ textAlign: 'center', padding: 'var(--space-3xl) var(--space-xl)', borderRadius: 'var(--radius-xl)', border: '1px dashed var(--border)', background: 'rgba(255,255,255,0.02)' }}>
                    <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto var(--space-lg)' }}>
                        <span style={{ fontSize: '1.75rem' }}>✅</span>
                    </div>
                    <h3 style={{ color: 'var(--text-primary)', marginBottom: 8 }}>Semua sudah diproses</h3>
                    <p style={{ color: 'var(--text-muted)', fontSize: 'var(--font-sm)', maxWidth: 360, margin: '0 auto' }}>
                        Tidak ada ijazah yang menunggu persetujuan. Semua pengajuan dari mahasiswa telah ditangani.
                    </p>
                </div>
            )}

            {/* ── Mint Modal ────────────────────────────────────────────── */}
            {mintingReq && mintStep !== 'idle' && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-lg)' }}>
                    {/* Backdrop */}
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
                        onClick={closeMintModal} />

                    {/* Dialog */}
                    <div className="glass-card-static animate-fade-in"
                        style={{ position: 'relative', width: '100%', maxWidth: 480, padding: 'var(--space-2xl)', borderRadius: 'var(--radius-xl)', border: '1px solid rgba(52,211,153,0.25)', boxShadow: '0 25px 50px rgba(0,0,0,0.5)' }}>

                        {/* Close button */}
                        {mintStep !== 'minting' && mintStep !== 'waiting' && (
                            <button onClick={closeMintModal}
                                style={{ position: 'absolute', top: 16, right: 16, background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', width: 32, height: 32, cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                ✕
                            </button>
                        )}

                        {/* ── DONE ───────────────────────────────────── */}
                        {mintStep === 'done' && mintResult ? (
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(52,211,153,0.15)', border: '1px solid rgba(52,211,153,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto var(--space-lg)', fontSize: '2rem' }}>
                                    🎉
                                </div>
                                <h3 style={{ fontSize: 'var(--font-xl)', fontWeight: 700, marginBottom: 8, color: '#34d399' }}>NFT Berhasil Di-Mint!</h3>
                                <p style={{ color: 'var(--text-muted)', fontSize: 'var(--font-sm)', marginBottom: 'var(--space-xl)' }}>
                                    Ijazah <strong style={{ color: 'var(--text-primary)' }}>{mintingReq.studentName}</strong> telah berhasil diterbitkan sebagai NFT di blockchain.
                                </p>
                                {mintResult.tokenId && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 16px', background: 'rgba(52,211,153,0.06)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(52,211,153,0.15)', marginBottom: 'var(--space-sm)', fontSize: 'var(--font-sm)' }}>
                                        <span style={{ color: 'var(--text-muted)' }}>Token ID</span>
                                        <span style={{ fontWeight: 700, color: '#34d399', fontFamily: 'monospace' }}>#{mintResult.tokenId}</span>
                                    </div>
                                )}
                                {mintResult.txHash && (
                                    <a href={`https://sepolia.etherscan.io/tx/${mintResult.txHash}`} target="_blank" rel="noopener noreferrer"
                                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', background: 'rgba(99,102,241,0.06)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(99,102,241,0.15)', textDecoration: 'none', fontSize: 'var(--font-sm)', marginBottom: 'var(--space-xl)' }}>
                                        <span style={{ color: 'var(--text-muted)' }}>Tx Hash</span>
                                        <span style={{ color: 'var(--primary)', fontFamily: 'monospace', fontSize: 'var(--font-xs)' }}>
                                            {mintResult.txHash.slice(0, 10)}…{mintResult.txHash.slice(-8)} ↗
                                        </span>
                                    </a>
                                )}
                                <button className="btn btn-primary" style={{ width: '100%' }} onClick={closeMintModal}>
                                    Selesai
                                </button>
                            </div>
                        ) : mintStep === 'minting' || mintStep === 'waiting' ? (
                            /* ── IN PROGRESS ─────────────────────────── */
                            <div style={{ textAlign: 'center', padding: 'var(--space-lg) 0' }}>
                                <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto var(--space-lg)' }}>
                                    <span className="spinner" style={{ width: 28, height: 28, borderColor: 'rgba(52,211,153,0.25)', borderTopColor: '#34d399' }}></span>
                                </div>
                                <h3 style={{ fontSize: 'var(--font-lg)', fontWeight: 700, marginBottom: 8 }}>
                                    {mintStep === 'minting' ? 'Menunggu Konfirmasi MetaMask' : 'Transaksi Dikirim...'}
                                </h3>
                                <p style={{ color: 'var(--text-muted)', fontSize: 'var(--font-sm)' }}>
                                    {mintStep === 'minting'
                                        ? 'Silakan periksa MetaMask Anda dan konfirmasi transaksi.'
                                        : 'Menunggu konfirmasi di jaringan Sepolia. Mohon tunggu...'}
                                </p>
                            </div>
                        ) : (
                            /* ── CONFIRM ─────────────────────────────── */
                            <>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 'var(--space-xl)' }}>
                                    <div style={{ width: 44, height: 44, borderRadius: 'var(--radius-md)', background: 'linear-gradient(135deg, rgba(52,211,153,0.2), rgba(16,185,129,0.2))', border: '1px solid rgba(52,211,153,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem', flexShrink: 0 }}>
                                        🪙
                                    </div>
                                    <div>
                                        <h3 style={{ fontSize: 'var(--font-lg)', fontWeight: 700, margin: 0 }}>Konfirmasi Mint NFT</h3>
                                        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--font-sm)', margin: 0 }}>Tindakan ini tidak dapat dibatalkan</p>
                                    </div>
                                </div>

                                {/* Student summary */}
                                <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', padding: 'var(--space-lg)', marginBottom: 'var(--space-xl)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                                    {[
                                        { label: 'Nama', value: mintingReq.studentName },
                                        { label: 'NIM', value: mintingReq.nim },
                                        { label: 'Program Studi', value: mintingReq.major },
                                        { label: 'Institusi', value: mintingReq.schoolName || mintingReq.schoolWallet },
                                        { label: 'Wallet', value: `${mintingReq.studentWallet?.slice(0, 8)}…${mintingReq.studentWallet?.slice(-6)}` },
                                    ].filter(r => r.value).map(({ label, value }) => (
                                        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--font-sm)', gap: 12 }}>
                                            <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{label}</span>
                                            <span style={{ color: 'var(--text-secondary)', textAlign: 'right', wordBreak: 'break-all' }}>{value}</span>
                                        </div>
                                    ))}
                                </div>

                                {mintError && (
                                    <div className="alert alert-error animate-fade-in" style={{ marginBottom: 'var(--space-lg)', fontSize: 'var(--font-sm)' }}>
                                        <span className="alert-icon">⚠️</span>
                                        <div>{mintError}</div>
                                    </div>
                                )}

                                <div style={{ display: 'flex', gap: 10 }}>
                                    <button className="btn btn-secondary" style={{ flex: 1 }} onClick={closeMintModal}>
                                        Batal
                                    </button>
                                    <button className="btn btn-primary" style={{ flex: 2, background: 'linear-gradient(135deg, #34d399, #10b981)', borderColor: 'transparent' }}
                                        onClick={confirmMint}>
                                        🪙 Mint Sekarang
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Request cards */}
            {requests.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
                    <p style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginBottom: 0 }}>
                        {requests.length} ijazah menunggu persetujuan Anda
                    </p>
                    {requests.map(req => {
                        const isExpanded  = expandedId === req.requestId;
                        const isActioning = actionLoading === req.requestId;
                        const isRejecting = rejectingId === req.requestId;

                        return (
                            <div key={req.requestId} className="glass-card-static animate-fade-in"
                                style={{ border: '1px solid rgba(251,191,36,0.15)', padding: 0, overflow: 'hidden' }}>

                                {/* Top accent bar */}
                                <div style={{ height: 3, background: 'linear-gradient(90deg, #fbbf24, rgba(251,191,36,0.2))' }} />

                                <div style={{ padding: 'var(--space-xl)' }}>
                                    {/* Card header row */}
                                    <div style={{ display: 'flex', gap: 'var(--space-lg)', alignItems: 'flex-start' }}>
                                        {/* Photo */}
                                        <div style={{ width: 80, height: 100, borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', overflow: 'hidden', flexShrink: 0, background: 'rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            {req.photoCID
                                                ? <img src={`https://gateway.pinata.cloud/ipfs/${req.photoCID}`} alt="foto" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                : <span style={{ fontSize: '2rem', opacity: 0.4 }}>👤</span>}
                                        </div>

                                        {/* Student info */}
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                                                <div>
                                                    <h3 style={{ fontSize: 'var(--font-xl)', fontWeight: 700, margin: 0, marginBottom: 4 }}>{req.studentName}</h3>
                                                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                                        <span style={{ fontSize: 'var(--font-xs)', fontFamily: 'monospace', color: 'var(--primary)', background: 'rgba(99,102,241,0.1)', padding: '2px 8px', borderRadius: 4, border: '1px solid rgba(99,102,241,0.2)' }}>
                                                            NIM {req.nim}
                                                        </span>
                                                        {req.degree && (
                                                            <span style={{ fontSize: 'var(--font-xs)', color: '#a78bfa', background: 'rgba(167,139,250,0.1)', padding: '2px 10px', borderRadius: 999, border: '1px solid rgba(167,139,250,0.2)', fontWeight: 600 }}>
                                                                {req.degree}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5, background: 'rgba(251,191,36,0.1)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.25)', borderRadius: 999, padding: '4px 12px', fontSize: 'var(--font-xs)', fontWeight: 600 }}>
                                                    ⏳ Menunggu Review
                                                </span>
                                            </div>

                                            {/* Info chips */}
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 'var(--space-md)', marginTop: 'var(--space-lg)', padding: 'var(--space-md)', background: 'rgba(255,255,255,0.02)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                                                <InfoChip label="Institusi" value={req.schoolName || req.schoolWallet?.slice(0, 8) + '…'} />
                                                <InfoChip label="Program Studi" value={req.major} />
                                                <InfoChip label="Fakultas" value={req.faculty} />
                                                <InfoChip label="Tempat Lahir" value={req.birthPlace} />
                                                <InfoChip label="Tanggal Lahir" value={req.birthDate} />
                                                <InfoChip label="Diajukan" value={formatDate(req.createdAt)} />
                                                {req.grades?.length > 0 && (
                                                    <InfoChip label="Beban Studi" value={`${req.grades.length} MK · ${req.grades.reduce((s, g) => s + (parseInt(g.sks) || 0), 0)} SKS`} />
                                                )}
                                                <InfoChip label="Wallet Mahasiswa" value={req.studentWallet ? `${req.studentWallet.slice(0, 6)}…${req.studentWallet.slice(-4)}` : null} />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Secondary actions: PDF, Grades */}
                                    <div style={{ display: 'flex', gap: 8, marginTop: 'var(--space-lg)', flexWrap: 'wrap' }}>
                                        {req.pdfCID && (
                                            <a href={`https://gateway.pinata.cloud/ipfs/${req.pdfCID}`} target="_blank" rel="noopener noreferrer"
                                                className="btn btn-secondary" style={{ textDecoration: 'none', fontSize: 'var(--font-xs)', padding: '6px 14px' }}>
                                                📄 Lihat Dokumen Ijazah ↗
                                            </a>
                                        )}
                                        {req.grades?.length > 0 && (
                                            <button className="btn btn-secondary" style={{ fontSize: 'var(--font-xs)', padding: '6px 14px' }}
                                                onClick={() => setExpandedId(isExpanded ? null : req.requestId)}>
                                                {isExpanded ? '▲ Sembunyikan Transkrip' : `📊 Lihat Transkrip (${req.grades.length} MK)`}
                                            </button>
                                        )}
                                    </div>

                                    {/* Expanded grades */}
                                    {isExpanded && req.grades?.length > 0 && (
                                        <div style={{ marginTop: 'var(--space-md)' }} className="animate-fade-in">
                                            <GradesTable grades={req.grades} />
                                        </div>
                                    )}

                                    {/* Decision area */}
                                    <div style={{ marginTop: 'var(--space-xl)', paddingTop: 'var(--space-lg)', borderTop: '1px solid var(--border)' }}>
                                        {isRejecting ? (
                                            <div className="animate-fade-in">
                                                <p style={{ fontSize: 'var(--font-sm)', color: 'var(--text-muted)', marginBottom: 'var(--space-sm)' }}>
                                                    Berikan alasan penolakan yang jelas untuk catatan audit:
                                                </p>
                                                <textarea className="form-input" placeholder="Contoh: Data tidak sesuai dengan catatan akademik resmi."
                                                    value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                                                    disabled={isActioning} rows={3}
                                                    style={{ fontSize: 'var(--font-sm)', resize: 'vertical', minHeight: 72, marginBottom: 'var(--space-sm)', width: '100%', boxSizing: 'border-box' }} />
                                                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                                                    <button className="btn btn-secondary"
                                                        onClick={() => { setRejectingId(null); setRejectReason(''); setActionError(''); }}
                                                        disabled={isActioning}>
                                                        Batal
                                                    </button>
                                                    <button className="btn btn-secondary"
                                                        style={{ color: '#f87171', borderColor: 'rgba(248,113,113,0.4)', background: 'rgba(248,113,113,0.05)' }}
                                                        onClick={() => handleReject(req.requestId)} disabled={isActioning || !rejectReason.trim()}>
                                                        {isActioning
                                                            ? <><span className="spinner" style={{ width: 12, height: 12 }}></span> Menolak...</>
                                                            : '✕ Konfirmasi Penolakan'}
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap' }}>
                                                <p style={{ flex: 1, fontSize: 'var(--font-xs)', color: 'var(--text-muted)', margin: 0 }}>
                                                    Tinjau dokumen sebelum membuat keputusan
                                                </p>
                                                <button className="btn btn-secondary"
                                                    style={{ color: '#f87171', borderColor: 'rgba(248,113,113,0.35)', fontSize: 'var(--font-sm)' }}
                                                    onClick={() => { setRejectingId(req.requestId); setActionError(''); }}
                                                    disabled={isActioning}>
                                                    ✕ Tolak
                                                </button>
                                                <button className="btn btn-primary"
                                                    style={{ background: 'linear-gradient(135deg, #34d399, #10b981)', borderColor: 'transparent', fontSize: 'var(--font-sm)' }}
                                                    onClick={() => openMintModal(req)} disabled={isActioning}>
                                                    🪙 Setujui &amp; Mint NFT
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

export default MinistryDashboard;
