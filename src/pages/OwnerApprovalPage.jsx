import { useState, useEffect, useCallback } from 'react';
import { useWeb3 } from '../context/Web3Context';
import { useAuth, ROLE } from '../context/AuthContext';
import { ethers } from 'ethers';

function GradesTable({ grades }) {
    if (!grades?.length) return null;
    return (
        <div style={{ borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-sm)' }}>
                <thead>
                    <tr style={{ background: 'rgba(255,255,255,0.04)' }}>
                        <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--text-muted)', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>KMK</th>
                        <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--text-muted)', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>Mata Kuliah</th>
                        <th style={{ textAlign: 'center', padding: '8px 12px', color: 'var(--text-muted)', fontWeight: 600, borderBottom: '1px solid var(--border)', width: 60 }}>Nilai</th>
                    </tr>
                </thead>
                <tbody>
                    {grades.map((g, i) => (
                        <tr key={i} style={{ borderBottom: i < grades.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                            <td style={{ padding: '8px 12px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)' }}>{g.kmk}</td>
                            <td style={{ padding: '8px 12px' }}>{g.courseName}</td>
                            <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, color: g.grade === 'A' ? 'var(--success)' : g.grade === 'E' || g.grade === 'D' ? '#f87171' : 'var(--text-primary)' }}>{g.grade}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function StatusPill({ status }) {
    const map = {
        pending:          { text: 'Menunggu Persetujuan Anda', color: '#fbbf24', bg: 'rgba(251,191,36,0.12)', border: 'rgba(251,191,36,0.3)', icon: '⏳' },
        student_approved: { text: 'Diproses Kementerian',     color: '#60a5fa', bg: 'rgba(96,165,250,0.12)',  border: 'rgba(96,165,250,0.3)',  icon: '🏛️' },
        ministry_approved:{ text: 'Siap Di-Mint',             color: '#34d399', bg: 'rgba(52,211,153,0.12)', border: 'rgba(52,211,153,0.3)',  icon: '✅' },
        minted:           { text: 'NFT Ter-mint ✓',           color: '#4ade80', bg: 'rgba(74,222,128,0.12)', border: 'rgba(74,222,128,0.3)',  icon: '🎓' },
        rejected:         { text: 'Ditolak',                  color: '#f87171', bg: 'rgba(248,113,113,0.12)', border: 'rgba(248,113,113,0.3)', icon: '✕' },
    };
    const s = map[status] || map.pending;
    return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: s.bg, color: s.color, border: `1px solid ${s.border}`, borderRadius: 999, padding: '4px 12px', fontSize: 'var(--font-xs)', fontWeight: 600 }}>
            {s.icon} {s.text}
        </span>
    );
}

function OwnerApprovalPage() {
    const { account, contract, signer, connectWallet, loading: walletLoading } = useWeb3();
    const { role, roleLabel } = useAuth();

    const [activeTab, setActiveTab] = useState('approval');

    // All transcript records for this student wallet
    const [allRecords, setAllRecords] = useState([]);
    const [loadingRecords, setLoadingRecords] = useState(false);
    const [fetchError, setFetchError] = useState('');

    // Rejection UI state
    const [rejectingId, setRejectingId] = useState(null);
    const [rejectReason, setRejectReason] = useState('');
    const [rejectLoading, setRejectLoading] = useState(false);

    // Approve (student off-chain) UI state
    const [approvingId, setApprovingId] = useState(null);

    // (minting removed — now handled by Ministry)

    // Verify tab state
    const [verifications, setVerifications] = useState([]);
    const [loadingVerify, setLoadingVerify] = useState(false);
    const [verifyFetchError, setVerifyFetchError] = useState('');
    const [selectedVerify, setSelectedVerify] = useState(null);
    const [verifyStep, setVerifyStep] = useState('idle');
    const [verifyError, setVerifyError] = useState('');
    const [verifyResult, setVerifyResult] = useState(null);

    const formatDate = (iso) => {
        if (!iso) return '-';
        return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    };
    const formatTs = (ts) => {
        if (!ts) return '-';
        return new Date(Number(ts) * 1000).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    const fetchRecords = useCallback(async () => {
        if (!account) return;
        setLoadingRecords(true);
        setFetchError('');
        try {
            const res = await fetch(`/api/student/pending-transcripts?studentWallet=${account}`);
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.error || 'Gagal mengambil data.');
            setAllRecords(data.requests || []);
        } catch (err) {
            setFetchError(err.message || 'Gagal menghubungi server.');
        } finally {
            setLoadingRecords(false);
        }
    }, [account]);

    const fetchVerifications = useCallback(async () => {
        if (!account || !contract) return;
        setLoadingVerify(true);
        setVerifyFetchError('');
        try {
            const provider = contract.runner?.provider ?? contract.provider;
            const currentBlock = await provider.getBlockNumber();
            const fromBlock = Math.max(0, currentBlock - 100000);
            const filter = contract.filters.VerificationRequested(null, null, account);
            const events = await contract.queryFilter(filter, fromBlock);

            const pending = [];
            for (const ev of events) {
                const { tokenId, requester } = ev.args;
                const isPending = await contract.isVerificationPending(tokenId, requester);
                if (!isPending) continue;
                const [schoolName, studentName, ipfsCID, issuedBy, issuedAt] = await contract.getTranscriptData(tokenId);
                const uri = await contract.tokenURI(tokenId);
                let metadata = null;
                try {
                    const gwUrl = uri.replace('ipfs://', 'https://gateway.pinata.cloud/ipfs/');
                    const r = await fetch(gwUrl, { signal: AbortSignal.timeout(5000) });
                    if (r.ok) metadata = await r.json();
                } catch { /* non-fatal */ }
                pending.push({ tokenId: tokenId.toString(), verifier: requester, schoolName, studentName, ipfsCID, issuedBy, issuedAt: issuedAt.toString(), metadataURI: uri, metadata, txHash: ev.transactionHash });
            }
            setVerifications(pending);
        } catch (err) {
            setVerifyFetchError(err.message || 'Gagal memuat data verifikasi dari blockchain.');
        } finally {
            setLoadingVerify(false);
        }
    }, [account, contract]);

    useEffect(() => { fetchRecords(); }, [fetchRecords]);
    useEffect(() => { if (activeTab === 'verify') fetchVerifications(); }, [activeTab, fetchVerifications]);

    // Derived lists
    const pendingRecords          = allRecords.filter(r => r.status === 'pending');
    const studentApprovedRecords  = allRecords.filter(r => r.status === 'student_approved');
    const ministryApprovedRecords = allRecords.filter(r => r.status === 'ministry_approved');
    const mintedRecords           = allRecords.filter(r => r.status === 'minted');
    const approvalCount = pendingRecords.length;

    // ─── Access control ──────────────────────────────────────────
    if (role === ROLE.SCHOOL || role === ROLE.HR) {
        return (
            <div className="verify-container">
                <div className="glass-card-static">
                    <div className="alert alert-error">
                        <span className="alert-icon">🚫</span>
                        <div><strong>Akses Tidak Diizinkan</strong><p>Halaman ini hanya untuk Student. Akun Anda terdaftar sebagai {roleLabel}.</p></div>
                    </div>
                </div>
            </div>
        );
    }

    if (!account) {
        return (
            <div className="container">
                <div className="connect-prompt">
                    <div className="connect-prompt-icon">🦊</div>
                    <h2>Connect Wallet Anda</h2>
                    <p>Hubungkan wallet MetaMask untuk melihat transkrip dan ijazah Anda.</p>
                    <button className="btn btn-primary btn-lg" onClick={connectWallet} disabled={walletLoading}>
                        {walletLoading ? <><span className="spinner"></span> Connecting...</> : '🔗 Connect MetaMask'}
                    </button>
                </div>
            </div>
        );
    }

    // ─── Student: approve off-chain ──────────────────────────────
    const handleApprove = async (requestId) => {
        setApprovingId(requestId);
        try {
            await fetch('/api/student/approve-transcript', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ requestId, studentWallet: account, action: 'approve' }),
            });
            setAllRecords(prev => prev.map(r => r.requestId === requestId ? { ...r, status: 'student_approved' } : r));
        } catch { /* ignore */ }
        finally { setApprovingId(null); }
    };

    // ─── Student: reject ─────────────────────────────────────────
    const handleReject = async (requestId) => {
        setRejectLoading(true);
        try {
            await fetch('/api/student/approve-transcript', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ requestId, studentWallet: account, action: 'reject', reason: rejectReason }),
            });
            setAllRecords(prev => prev.filter(r => r.requestId !== requestId));
        } catch { /* ignore */ }
        finally { setRejectLoading(false); setRejectingId(null); setRejectReason(''); }
    };

    // Minting now handled by Ministry dashboard

    // ─── Verify flow ─────────────────────────────────────────────
    const handleApproveVerify = (v) => { setSelectedVerify(v); setVerifyError(''); setVerifyResult(null); setVerifyStep('idle'); };
    const closeVerifyModal = () => { setSelectedVerify(null); setVerifyStep('idle'); setVerifyError(''); setVerifyResult(null); };

    const confirmApproveVerify = async () => {
        if (!selectedVerify || !contract || !signer) return;
        setVerifyError('');
        try {
            setVerifyStep('signing');
            const msgHash = await contract.getVerificationMessage(selectedVerify.tokenId);
            const signature = await signer.signMessage(ethers.getBytes(msgHash));
            setVerifyStep('confirming');
            const tx = await contract.approveVerification(selectedVerify.tokenId, signature, selectedVerify.verifier);
            await tx.wait();
            setVerifyStep('done');
            setVerifyResult({ tokenId: selectedVerify.tokenId, txHash: tx.hash });
            setVerifications(prev => prev.filter(v => !(v.tokenId === selectedVerify.tokenId && v.verifier === selectedVerify.verifier)));
        } catch (err) {
            if (err.code === 4001 || err.message?.includes('user rejected')) {
                setVerifyError('Transaksi dibatalkan.');
            } else {
                setVerifyError(err.reason || err.message || 'Gagal menyetujui verifikasi.');
            }
            setVerifyStep('idle');
        }
    };

    // ─── Tab style helper ────────────────────────────────────────
    const tabStyle = (tab) => ({
        padding: '10px 20px', border: 'none',
        borderBottom: activeTab === tab ? '2px solid var(--primary)' : '2px solid transparent',
        background: 'none', color: activeTab === tab ? 'var(--primary)' : 'var(--text-muted)',
        fontWeight: activeTab === tab ? 600 : 400, cursor: 'pointer',
        fontSize: 'var(--font-sm)', display: 'flex', alignItems: 'center', gap: 6, transition: 'color 0.15s',
    });
    const badgeStyle = { background: 'var(--primary)', color: '#fff', borderRadius: 999, fontSize: 11, fontWeight: 700, padding: '1px 7px', lineHeight: 1.6 };

    // ─── Shared card header ──────────────────────────────────────
    const RequestHeader = ({ req }) => (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-md)' }}>
            <div>
                <h3 style={{ fontSize: 'var(--font-lg)', marginBottom: 4 }}>{req.studentName}</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: 'var(--font-sm)' }}>
                    NIM: {req.nim} · {req.schoolName || req.schoolWallet} · {formatDate(req.createdAt)}
                </p>
            </div>
            <StatusPill status={req.status} />
        </div>
    );

    const RequestInfo = ({ req }) => {
        const docVisible = req.status === 'ministry_approved' || req.status === 'minted';
        return (
            <div style={{ display: 'flex', gap: 'var(--space-lg)', marginTop: 'var(--space-lg)', alignItems: 'flex-start' }}>
                <div style={{ width: 72, height: 90, borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', overflow: 'hidden', flexShrink: 0, background: 'rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {docVisible && req.photoCID
                        ? <img src={`https://gateway.pinata.cloud/ipfs/${req.photoCID}`} alt="foto" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <span style={{ fontSize: '1.5rem', opacity: docVisible ? 1 : 0.3 }}>👤</span>}
                </div>
                <div className="metadata-grid" style={{ flex: 1 }}>
                    {req.faculty && <div className="metadata-item"><div className="metadata-label">Fakultas</div><div className="metadata-value">{req.faculty}</div></div>}
                    {req.major && <div className="metadata-item"><div className="metadata-label">Program Studi</div><div className="metadata-value">{req.major}</div></div>}
                    {req.degree && <div className="metadata-item"><div className="metadata-label">Gelar</div><div className="metadata-value">{req.degree}</div></div>}
                    {(req.birthPlace || req.birthDate) && <div className="metadata-item"><div className="metadata-label">TTL</div><div className="metadata-value">{[req.birthPlace, req.birthDate].filter(Boolean).join(', ')}</div></div>}
                    {docVisible && req.pdfCID && (
                        <div className="metadata-item">
                            <div className="metadata-label">Dokumen</div>
                            <div className="metadata-value"><a href={`https://gateway.pinata.cloud/ipfs/${req.pdfCID}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', textDecoration: 'underline' }}>📄 Lihat Ijazah & Transkrip ↗</a></div>
                        </div>
                    )}
                    {!docVisible && (
                        <div className="metadata-item" style={{ gridColumn: 'span 2' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--font-xs)', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '6px 12px' }}>
                                🔒 Dokumen ijazah akan tersedia setelah disetujui oleh Kementerian
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    // ─── Render ──────────────────────────────────────────────────
    return (
        <div className="container" style={{ paddingTop: 'var(--space-2xl)', paddingBottom: 'var(--space-3xl)' }}>
            <div className="dashboard-header">
                <h1>📋 Transkrip Saya</h1>
                <p>Kelola persetujuan transkrip dan koleksi ijazah digital Anda</p>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 'var(--space-xl)', overflowX: 'auto' }}>
                <button style={tabStyle('approval')} onClick={() => setActiveTab('approval')}>
                    📋 Persetujuan
                    {approvalCount > 0 && <span style={badgeStyle}>{approvalCount}</span>}
                </button>
                <button style={tabStyle('storage')} onClick={() => setActiveTab('storage')}>
                    🎓 Koleksi Ijazah
                    {mintedRecords.length > 0 && <span style={{ ...badgeStyle, background: '#22c55e' }}>{mintedRecords.length}</span>}
                </button>
                <button style={tabStyle('verify')} onClick={() => setActiveTab('verify')}>
                    ✅ Verifikasi
                    {verifications.length > 0 && <span style={badgeStyle}>{verifications.length}</span>}
                </button>
            </div>

            {/* ══════════════ APPROVAL TAB ══════════════ */}
            {activeTab === 'approval' && (
                <>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--space-lg)' }}>
                        <button className="btn btn-secondary" onClick={fetchRecords} disabled={loadingRecords}>
                            {loadingRecords ? <><span className="spinner"></span> Memuat...</> : '↻ Refresh'}
                        </button>
                    </div>

                    {fetchError && <div className="alert alert-error animate-fade-in"><span className="alert-icon">⚠️</span><div>{fetchError}</div></div>}
                    {loadingRecords && <div className="glass-card-static" style={{ textAlign: 'center', padding: 'var(--space-3xl)' }}><span className="spinner" style={{ width: 32, height: 32 }}></span></div>}

                    {!loadingRecords && !fetchError && (
                        <>
                            {/* — Section: Disetujui Kementerian — */}
                            {ministryApprovedRecords.length > 0 && (
                                <div style={{ marginBottom: 'var(--space-2xl)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 'var(--space-lg)' }}>
                                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#34d399' }}></div>
                                        <h2 style={{ fontSize: 'var(--font-lg)', color: '#34d399' }}>Disetujui — Proses Minting oleh Kementerian</h2>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
                                        {ministryApprovedRecords.map(req => (
                                            <div key={req.requestId} className="glass-card-static animate-fade-in" style={{ border: '1px solid rgba(52,211,153,0.2)', background: 'rgba(52,211,153,0.03)', opacity: 0.9 }}>
                                                <RequestHeader req={req} />
                                                <RequestInfo req={req} />
                                                <div style={{ marginTop: 'var(--space-md)', display: 'flex', alignItems: 'center', gap: 10, color: '#34d399', fontSize: 'var(--font-sm)' }}>
                                                    <span className="spinner" style={{ width: 14, height: 14 }}></span>
                                                    Kementerian sedang menerbitkan NFT ke blockchain...
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* — Section: Menunggu Persetujuan Anda — */}
                            {pendingRecords.length > 0 && (
                                <div style={{ marginBottom: 'var(--space-2xl)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 'var(--space-lg)' }}>
                                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#fbbf24' }}></div>
                                        <h2 style={{ fontSize: 'var(--font-lg)', color: 'var(--text-secondary)' }}>Menunggu Persetujuan Anda</h2>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
                                        {pendingRecords.map(req => (
                                            <div key={req.requestId} className="glass-card-static animate-fade-in">
                                                <RequestHeader req={req} />
                                                <RequestInfo req={req} />
                                                <div style={{ marginTop: 'var(--space-lg)', padding: 'var(--space-md)', background: 'rgba(99,102,241,0.07)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(99,102,241,0.2)', display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                                                    <span>🔒</span>
                                                    <span style={{ fontSize: 'var(--font-sm)', color: 'var(--text-muted)' }}>
                                                        Periksa data ijazah. Setelah Anda setujui, request akan diteruskan ke Kementerian untuk verifikasi akhir.
                                                    </span>
                                                </div>

                                                <div style={{ display: 'flex', gap: 'var(--space-md)', marginTop: 'var(--space-xl)', justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap' }}>
                                                    {rejectingId === req.requestId ? (
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                                                            <textarea className="form-input" placeholder="Tuliskan alasan penolakan... (opsional)"
                                                                value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
                                                                disabled={rejectLoading} rows={2} style={{ fontSize: 'var(--font-sm)', resize: 'vertical', minHeight: 60 }} />
                                                            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                                                                <button className="btn btn-secondary" onClick={() => { setRejectingId(null); setRejectReason(''); }} disabled={rejectLoading}>Batal</button>
                                                                <button className="btn btn-secondary" style={{ color: '#f87171', borderColor: 'rgba(248,113,113,0.4)' }}
                                                                    onClick={() => handleReject(req.requestId)} disabled={rejectLoading}>
                                                                    {rejectLoading ? <span className="spinner" style={{ width: 14, height: 14 }}></span> : 'Ya, Tolak'}
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <button className="btn btn-secondary" style={{ color: '#f87171', borderColor: 'rgba(248,113,113,0.4)' }}
                                                            onClick={() => setRejectingId(req.requestId)}>
                                                            ✕ Tolak
                                                        </button>
                                                    )}
                                                    <button className="btn btn-primary" onClick={() => handleApprove(req.requestId)} disabled={approvingId === req.requestId}>
                                                        {approvingId === req.requestId ? <><span className="spinner"></span> Menyetujui...</> : '✓ Setujui ke Kementerian'}
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* — Section: Diproses Kementerian — */}
                            {studentApprovedRecords.length > 0 && (
                                <div style={{ marginBottom: 'var(--space-2xl)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 'var(--space-lg)' }}>
                                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#60a5fa' }}></div>
                                        <h2 style={{ fontSize: 'var(--font-lg)', color: 'var(--text-secondary)' }}>Diproses Kementerian</h2>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
                                        {studentApprovedRecords.map(req => (
                                            <div key={req.requestId} className="glass-card-static animate-fade-in" style={{ opacity: 0.8 }}>
                                                <RequestHeader req={req} />
                                                <div style={{ marginTop: 'var(--space-md)', display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-muted)', fontSize: 'var(--font-sm)' }}>
                                                    <span className="spinner" style={{ width: 14, height: 14, opacity: 0.6 }}></span>
                                                    Menunggu verifikasi dari Kementerian Pendidikan...
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {approvalCount === 0 && studentApprovedRecords.length === 0 && (
                                <div className="glass-card-static" style={{ textAlign: 'center', padding: 'var(--space-3xl)' }}>
                                    <div style={{ fontSize: '3rem', marginBottom: 'var(--space-md)' }}>📭</div>
                                    <h3 style={{ color: 'var(--text-secondary)' }}>Tidak ada request aktif</h3>
                                    <p style={{ color: 'var(--text-muted)', fontSize: 'var(--font-sm)' }}>Universitas belum mengirimkan request transkrip ke wallet ini.</p>
                                </div>
                            )}
                        </>
                    )}
                </>
            )}

            {/* ══════════════ KOLEKSI IJAZAH TAB ══════════════ */}
            {activeTab === 'storage' && (
                <>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--space-lg)' }}>
                        <button className="btn btn-secondary" onClick={fetchRecords} disabled={loadingRecords}>
                            {loadingRecords ? <><span className="spinner"></span> Memuat...</> : '↻ Refresh'}
                        </button>
                    </div>

                    {loadingRecords && <div className="glass-card-static" style={{ textAlign: 'center', padding: 'var(--space-3xl)' }}><span className="spinner" style={{ width: 32, height: 32 }}></span></div>}

                    {!loadingRecords && mintedRecords.length === 0 && (
                        <div className="glass-card-static" style={{ textAlign: 'center', padding: 'var(--space-3xl)' }}>
                            <div style={{ fontSize: '3rem', marginBottom: 'var(--space-md)' }}>🎓</div>
                            <h3 style={{ color: 'var(--text-secondary)' }}>Belum ada ijazah</h3>
                            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--font-sm)' }}>Ijazah yang sudah di-mint akan muncul di sini.</p>
                        </div>
                    )}

                    {mintedRecords.length > 0 && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 'var(--space-lg)' }}>
                            {mintedRecords.map(req => (
                                <div key={req.requestId} className="glass-card-static animate-fade-in" style={{ border: '1px solid rgba(74,222,128,0.2)', position: 'relative', overflow: 'hidden' }}>
                                    {/* Decorative top bar */}
                                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg, #22c55e, #4ade80)' }}></div>

                                    <div style={{ display: 'flex', gap: 'var(--space-md)', alignItems: 'flex-start', marginBottom: 'var(--space-lg)' }}>
                                        <div style={{ width: 80, height: 100, borderRadius: 'var(--radius-md)', border: '2px solid rgba(74,222,128,0.3)', overflow: 'hidden', flexShrink: 0, background: 'rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            {req.photoCID
                                                ? <img src={`https://gateway.pinata.cloud/ipfs/${req.photoCID}`} alt="foto" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                : <span style={{ fontSize: '2rem' }}>🎓</span>}
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: 'var(--font-xs)', color: '#4ade80', fontWeight: 600, marginBottom: 4 }}>NFT TER-MINT ✓</div>
                                            <h3 style={{ fontSize: 'var(--font-md)', fontWeight: 700, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{req.studentName}</h3>
                                            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--font-xs)', marginBottom: 2 }}>NIM: {req.nim}</p>
                                            {req.degree && <p style={{ color: 'var(--text-muted)', fontSize: 'var(--font-xs)', marginBottom: 2 }}>{req.degree}</p>}
                                            {req.major && <p style={{ color: 'var(--text-muted)', fontSize: 'var(--font-xs)' }}>{req.major}</p>}
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 'var(--font-xs)' }}>
                                        <div style={{ display: 'flex', gap: 8 }}>
                                            <span style={{ color: 'var(--text-muted)', width: 90, flexShrink: 0 }}>Universitas</span>
                                            <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{req.schoolName || `${req.schoolWallet?.slice(0, 6)}…`}</span>
                                        </div>
                                        {req.faculty && <div style={{ display: 'flex', gap: 8 }}>
                                            <span style={{ color: 'var(--text-muted)', width: 90, flexShrink: 0 }}>Fakultas</span>
                                            <span>{req.faculty}</span>
                                        </div>}
                                        <div style={{ display: 'flex', gap: 8 }}>
                                            <span style={{ color: 'var(--text-muted)', width: 90, flexShrink: 0 }}>Terbit</span>
                                            <span>{formatDate(req.updatedAt || req.createdAt)}</span>
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', gap: 8, marginTop: 'var(--space-lg)', flexWrap: 'wrap' }}>
                                        {req.pdfCID && (
                                            <a href={`https://gateway.pinata.cloud/ipfs/${req.pdfCID}`} target="_blank" rel="noopener noreferrer"
                                                className="btn btn-secondary" style={{ flex: 1, textAlign: 'center', textDecoration: 'none', fontSize: 'var(--font-xs)' }}>
                                                📄 Lihat Ijazah
                                            </a>
                                        )}
                                        {req.txHash && (
                                            <a href={`https://sepolia.etherscan.io/tx/${req.txHash}`} target="_blank" rel="noopener noreferrer"
                                                className="btn btn-secondary" style={{ flex: 1, textAlign: 'center', textDecoration: 'none', fontSize: 'var(--font-xs)', color: 'var(--primary)' }}>
                                                ⛓ Etherscan ↗
                                            </a>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}

            {/* ══════════════ VERIFY TAB ══════════════ */}
            {activeTab === 'verify' && (
                <>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--space-lg)' }}>
                        <button className="btn btn-secondary" onClick={fetchVerifications} disabled={loadingVerify}>
                            {loadingVerify ? <><span className="spinner"></span> Memuat...</> : '↻ Refresh'}
                        </button>
                    </div>

                    {verifyFetchError && <div className="alert alert-error animate-fade-in"><span className="alert-icon">⚠️</span><div>{verifyFetchError}</div></div>}
                    {loadingVerify && <div className="glass-card-static" style={{ textAlign: 'center', padding: 'var(--space-3xl)' }}><span className="spinner" style={{ width: 32, height: 32 }}></span><p style={{ marginTop: 'var(--space-md)', color: 'var(--text-muted)' }}>Memindai blockchain...</p></div>}

                    {!loadingVerify && !verifyFetchError && verifications.length === 0 && (
                        <div className="glass-card-static" style={{ textAlign: 'center', padding: 'var(--space-3xl)' }}>
                            <div style={{ fontSize: '3rem', marginBottom: 'var(--space-md)' }}>🔍</div>
                            <h3 style={{ color: 'var(--text-secondary)' }}>Tidak ada request verifikasi</h3>
                            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--font-sm)' }}>Belum ada pihak ketiga yang meminta verifikasi transkrip NFT Anda.</p>
                        </div>
                    )}

                    {verifications.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
                            {verifications.map(v => (
                                <div key={`${v.tokenId}-${v.verifier}`} className="glass-card-static animate-fade-in">
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-md)' }}>
                                        <div>
                                            <h3 style={{ fontSize: 'var(--font-lg)', marginBottom: 4 }}>Token #{v.tokenId} — {v.studentName}</h3>
                                            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--font-sm)' }}>
                                                Diminta oleh: <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)' }}>{v.verifier}</span>
                                            </p>
                                        </div>
                                        <span className="status-badge" style={{ background: 'rgba(99,102,241,0.15)', color: 'var(--primary)', border: '1px solid rgba(99,102,241,0.3)' }}>🔍 Request Verifikasi</span>
                                    </div>
                                    <div className="metadata-grid" style={{ marginTop: 'var(--space-lg)' }}>
                                        <div className="metadata-item"><div className="metadata-label">Universitas Penerbit</div><div className="metadata-value">{v.schoolName}</div></div>
                                        <div className="metadata-item"><div className="metadata-label">Tanggal Terbit</div><div className="metadata-value">{formatTs(v.issuedAt)}</div></div>
                                        {v.ipfsCID && <div className="metadata-item"><div className="metadata-label">Dokumen PDF</div><div className="metadata-value"><a href={`https://gateway.pinata.cloud/ipfs/${v.ipfsCID}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', textDecoration: 'underline' }}>📄 Lihat PDF ↗</a></div></div>}
                                    </div>
                                    {v.metadata?.grades?.length > 0 && (
                                        <div style={{ marginTop: 'var(--space-lg)' }}>
                                            <p style={{ fontSize: 'var(--font-sm)', color: 'var(--text-muted)', marginBottom: 8 }}>Nilai Mata Kuliah ({v.metadata.grades.length} MK)</p>
                                            <GradesTable grades={v.metadata.grades} />
                                        </div>
                                    )}
                                    <div style={{ display: 'flex', gap: 'var(--space-md)', marginTop: 'var(--space-xl)', justifyContent: 'flex-end' }}>
                                        <button className="btn btn-primary" onClick={() => handleApproveVerify(v)}>✅ Setujui Verifikasi</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}


            {/* ── Verify Modal ── */}
            {selectedVerify && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-lg)', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
                    onClick={(e) => { if (e.target === e.currentTarget && verifyStep === 'idle') closeVerifyModal(); }}>
                    <div className="glass-card-static animate-fade-in" style={{ maxWidth: 520, width: '100%', zIndex: 1001, maxHeight: '90vh', overflowY: 'auto' }}>
                        {verifyStep === 'done' && verifyResult ? (
                            <div style={{ textAlign: 'center', padding: 'var(--space-xl) 0' }}>
                                <div style={{ fontSize: '3rem', marginBottom: 'var(--space-md)' }}>✅</div>
                                <h2 style={{ marginBottom: 'var(--space-sm)' }}>Verifikasi Berhasil Disetujui!</h2>
                                <div className="metadata-grid" style={{ textAlign: 'left', marginBottom: 'var(--space-xl)' }}>
                                    <div className="metadata-item"><div className="metadata-label">Token ID</div><div className="metadata-value">#{verifyResult.tokenId}</div></div>
                                    <div className="metadata-item"><div className="metadata-label">Transaction</div>
                                        <div className="metadata-value mono" style={{ fontSize: 'var(--font-xs)' }}>
                                            <a href={`https://sepolia.etherscan.io/tx/${verifyResult.txHash}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', textDecoration: 'underline' }}>
                                                {verifyResult.txHash.slice(0, 22)}... ↗
                                            </a>
                                        </div>
                                    </div>
                                </div>
                                <button className="btn btn-primary" onClick={closeVerifyModal}>Tutup</button>
                            </div>
                        ) : (
                            <>
                                <h2 style={{ fontSize: 'var(--font-xl)', marginBottom: 'var(--space-sm)' }}>Setujui Permintaan Verifikasi</h2>
                                <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-sm)', marginBottom: 'var(--space-lg)' }}>
                                    Dengan menyetujui, Anda mengizinkan verifier melihat status verifikasi transkrip ini di blockchain.
                                </p>
                                <div className="metadata-grid" style={{ marginBottom: 'var(--space-lg)' }}>
                                    <div className="metadata-item"><div className="metadata-label">Token ID</div><div className="metadata-value">#{selectedVerify.tokenId}</div></div>
                                    <div className="metadata-item"><div className="metadata-label">Nama</div><div className="metadata-value">{selectedVerify.studentName}</div></div>
                                    <div className="metadata-item"><div className="metadata-label">Universitas</div><div className="metadata-value">{selectedVerify.schoolName}</div></div>
                                    <div className="metadata-item"><div className="metadata-label">Tanggal Terbit</div><div className="metadata-value">{formatTs(selectedVerify.issuedAt)}</div></div>
                                    {selectedVerify.ipfsCID && <div className="metadata-item" style={{ gridColumn: 'span 2' }}><div className="metadata-label">Dokumen PDF</div><div className="metadata-value"><a href={`https://gateway.pinata.cloud/ipfs/${selectedVerify.ipfsCID}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', textDecoration: 'underline' }}>📄 Lihat PDF ↗</a></div></div>}
                                    <div className="metadata-item" style={{ gridColumn: 'span 2' }}><div className="metadata-label">Verifier</div><div className="metadata-value mono" style={{ fontSize: 'var(--font-xs)', wordBreak: 'break-all' }}>{selectedVerify.verifier}</div></div>
                                </div>
                                {selectedVerify.metadata?.grades?.length > 0 && (
                                    <div style={{ marginBottom: 'var(--space-lg)' }}>
                                        <p style={{ fontSize: 'var(--font-sm)', color: 'var(--text-muted)', marginBottom: 8 }}>📊 Nilai Mata Kuliah ({selectedVerify.metadata.grades.length} MK)</p>
                                        <GradesTable grades={selectedVerify.metadata.grades} />
                                    </div>
                                )}
                                {verifyError && <div className="alert alert-error" style={{ marginBottom: 'var(--space-md)' }}><span className="alert-icon">⚠️</span><div>{verifyError}</div></div>}
                                {(verifyStep === 'signing' || verifyStep === 'confirming') && (
                                    <div style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 'var(--radius-md)', padding: 'var(--space-md)', marginBottom: 'var(--space-md)', display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                                        <span className="spinner"></span>
                                        <span style={{ fontSize: 'var(--font-sm)', color: 'var(--text-secondary)' }}>
                                            {verifyStep === 'signing' ? 'Menunggu tanda tangan...' : 'Mengirim transaksi...'}
                                        </span>
                                    </div>
                                )}
                                <div style={{ display: 'flex', gap: 'var(--space-md)', justifyContent: 'flex-end' }}>
                                    <button className="btn btn-secondary" onClick={closeVerifyModal} disabled={verifyStep !== 'idle'}>Batal</button>
                                    <button className="btn btn-primary" onClick={confirmApproveVerify} disabled={verifyStep !== 'idle'}>
                                        {verifyStep !== 'idle' ? <><span className="spinner"></span> Proses...</> : '✅ Setujui Verifikasi'}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default OwnerApprovalPage;
