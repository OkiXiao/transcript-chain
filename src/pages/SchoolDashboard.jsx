import { useState, useRef, useEffect, useCallback } from 'react';
import { useWeb3 } from '../context/Web3Context';
import { useAuth, ROLE } from '../context/AuthContext';
import { ethers } from 'ethers';
import contractInfo from '../contracts/TranscriptNFT.json.js';
import * as pdfjsLib from 'pdfjs-dist';
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href;

const API_BASE = import.meta.env.VITE_API_URL !== undefined
    ? import.meta.env.VITE_API_URL
    : (import.meta.env.DEV ? 'http://localhost:3001' : '');

// ── PDF.js inline preview ─────────────────────────────────────────────────────
function PdfPreview({ file }) {
    const canvasRef = useRef(null);
    const [pageCount, setPageCount] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const pdfRef = useRef(null);

    useEffect(() => {
        if (!file) return;
        const url = URL.createObjectURL(file);
        pdfjsLib.getDocument(url).promise.then(pdf => {
            pdfRef.current = pdf;
            setPageCount(pdf.numPages);
            setCurrentPage(1);
            renderPage(pdf, 1);
        });
        return () => URL.revokeObjectURL(url);
    }, [file]);

    useEffect(() => {
        if (pdfRef.current) renderPage(pdfRef.current, currentPage);
    }, [currentPage]);

    function renderPage(pdf, num) {
        pdf.getPage(num).then(page => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const viewport = page.getViewport({ scale: 1.2 });
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            page.render({ canvasContext: canvas.getContext('2d'), viewport });
        });
    }

    if (!file) return null;

    return (
        <div style={{ marginTop: 16 }}>
            <canvas ref={canvasRef} style={{ width: '100%', borderRadius: 8, border: '1px solid var(--border)' }} />
            {pageCount > 1 && (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 8 }}>
                    <button className="btn btn-secondary" style={{ padding: '4px 12px', fontSize: 12 }}
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
                        ← Prev
                    </button>
                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                        Halaman {currentPage} / {pageCount}
                    </span>
                    <button className="btn btn-secondary" style={{ padding: '4px 12px', fontSize: 12 }}
                        onClick={() => setCurrentPage(p => Math.min(pageCount, p + 1))} disabled={currentPage === pageCount}>
                        Next →
                    </button>
                </div>
            )}
        </div>
    );
}

// ── History table ─────────────────────────────────────────────────────────────
const CACHE_KEY = (account) => `mintHistory_${account?.toLowerCase()}`;
const RPC_URLS = [
    'https://ethereum-sepolia-rpc.publicnode.com',
    'https://rpc2.sepolia.org',
    'https://sepolia.gateway.tenderly.co',
];

function MintHistory({ account }) {
    const cacheKey = CACHE_KEY(account);
    const cached = (() => { try { return JSON.parse(localStorage.getItem(cacheKey) || '[]'); } catch { return []; } })();
    const [history, setHistory] = useState(cached);
    const [loading, setLoading] = useState(false);
    const [fetchError, setFetchError] = useState('');

    const load = useCallback(async () => {
        if (!account) return;
        setLoading(true);
        setFetchError('');
        let lastErr = null;
        for (const rpcUrl of RPC_URLS) {
            try {
                const rpcProvider = new ethers.JsonRpcProvider(rpcUrl);
                const readContract = new ethers.Contract(contractInfo.address, contractInfo.abi, rpcProvider);
                const filter = readContract.filters.TranscriptMinted(null, account);
                const currentBlock = await rpcProvider.getBlockNumber();
                const fromBlock = Math.max(0, currentBlock - 9000);
                const events = await readContract.queryFilter(filter, fromBlock, 'latest');
                const rows = events.reverse().map(e => ({
                    tokenId:     e.args[0]?.toString(),
                    recipient:   e.args[2],
                    studentName: e.args[3],
                    pdfCID:      e.args[4],
                    sha256Hash:  e.args[5],
                    txHash:      e.transactionHash,
                }));
                setHistory(rows);
                try { localStorage.setItem(cacheKey, JSON.stringify(rows)); } catch {}
                setLoading(false);
                return;
            } catch (err) {
                lastErr = err;
            }
        }
        console.error('[MintHistory]', lastErr);
        setFetchError('Gagal memuat riwayat dari blockchain. Menampilkan cache terakhir.');
        setLoading(false);
    }, [account, cacheKey]);

    useEffect(() => { load(); }, [load]);

    if (loading && !history.length) return (
        <div style={{ textAlign: 'center', padding: 32 }}>
            <span className="spinner" style={{ width: 28, height: 28 }}></span>
        </div>
    );

    if (!history.length) return (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
            {fetchError && <p style={{ color: '#f87171', fontSize: 13, marginBottom: 12 }}>⚠️ {fetchError}</p>}
            <p style={{ fontSize: '2.5rem', marginBottom: 8 }}>📄</p>
            <p>Belum ada transkrip yang di-mint dari wallet ini.</p>
            <button className="btn btn-secondary" style={{ marginTop: 12, fontSize: 13 }} onClick={load}>
                ↻ Refresh
            </button>
        </div>
    );

    return (
        <div>
            {fetchError && (
                <div style={{ marginBottom: 10, fontSize: 13, color: '#f87171' }}>⚠️ {fetchError}</div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                <button className="btn btn-secondary" style={{ fontSize: 13 }} onClick={load} disabled={loading}>
                    {loading ? <span className="spinner" style={{ width: 12, height: 12 }}></span> : '↻ Refresh'}
                </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {history.map((item, i) => (
                    <div key={i} style={{ padding: '14px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                            <div>
                                <span style={{ display: 'inline-block', background: 'rgba(99,102,241,0.12)', color: 'var(--primary)', borderRadius: 6, padding: '2px 8px', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                                    Token #{item.tokenId}
                                </span>
                                {item.studentName && (
                                    <div style={{ fontWeight: 600, fontSize: 'var(--font-sm)', marginBottom: 4 }}>{item.studentName}</div>
                                )}
                                <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                                    → {item.recipient?.slice(0, 10)}...{item.recipient?.slice(-8)}
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                {item.pdfCID && (
                                    <a href={`https://ipfs.io/ipfs/${item.pdfCID}`} target="_blank" rel="noreferrer"
                                        className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }}>
                                        📄 PDF
                                    </a>
                                )}
                                <a href={`https://sepolia.etherscan.io/tx/${item.txHash}`} target="_blank" rel="noreferrer"
                                    className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }}>
                                    Etherscan ↗
                                </a>
                            </div>
                        </div>
                        {item.sha256Hash && (
                            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                                SHA-256: {item.sha256Hash}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function SchoolDashboard() {
    const { account, contract, signer, connectWallet, loading: walletLoading } = useWeb3();
    const { role, loading: authLoading } = useAuth();

    const [activeTab, setActiveTab] = useState('mint');

    // Form state
    const [pdfFile, setPdfFile]         = useState(null);
    const [recipient, setRecipient]     = useState('');
    const [studentName, setStudentName] = useState('');
    const [confirmed, setConfirmed]     = useState(false);

    // Upload state
    const [uploading, setUploading]     = useState(false);
    const [uploadResult, setUploadResult] = useState(null); // { sha256Hash, pdfCID, metadataURI }
    const [uploadError, setUploadError] = useState('');

    // Mint state
    const [minting, setMinting]     = useState(false);
    const [mintTx, setMintTx]       = useState('');
    const [mintError, setMintError] = useState('');
    const [mintSuccess, setMintSuccess] = useState(false);

    // Institution name from contract
    const [institution, setInstitution] = useState('');

    useEffect(() => {
        if (!contract || !account) return;
        contract.schoolNames(account).then(name => setInstitution(name || '')).catch(() => {});
    }, [contract, account]);

    function handleFileChange(e) {
        const file = e.target.files[0];
        if (!file || file.type !== 'application/pdf') return;
        setPdfFile(file);
        setUploadResult(null);
        setUploadError('');
        setConfirmed(false);
        setMintTx('');
        setMintError('');
        setMintSuccess(false);
    }

    async function handleUpload() {
        if (!pdfFile || !account) return;
        setUploading(true);
        setUploadError('');
        setUploadResult(null);

        try {
            const form = new FormData();
            form.append('pdf', pdfFile);
            form.append('recipientName', studentName);
            form.append('institution', institution);
            form.append('schoolWallet', account);

            const res = await fetch(`${API_BASE}/api/school/upload-pdf`, {
                method: 'POST',
                body: form,
            });
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.error || 'Upload gagal.');
            setUploadResult(data);
        } catch (err) {
            setUploadError(err.message || 'Terjadi kesalahan saat upload.');
        } finally {
            setUploading(false);
        }
    }

    async function handleMint() {
        if (!uploadResult || !contract || !signer || !confirmed) return;
        if (!ethers.isAddress(recipient)) {
            setMintError('Wallet address penerima tidak valid.');
            return;
        }

        setMinting(true);
        setMintError('');
        setMintTx('');

        try {
            const contractWithSigner = contract.connect(signer);
            const tx = await contractWithSigner.mintTranscriptNamed(
                recipient,
                uploadResult.metadataURI,
                uploadResult.sha256Hash,
                uploadResult.pdfCID,
                studentName,
            );
            setMintTx(tx.hash);
            const receipt = await tx.wait();
            if (receipt.status === 1) {
                setMintSuccess(true);
            } else {
                throw new Error('Transaksi gagal (status 0).');
            }
        } catch (err) {
            if (err.code === 4001 || err.code === 'ACTION_REJECTED') {
                setMintError('Transaksi dibatalkan oleh pengguna.');
            } else {
                setMintError(err.reason || err.message || 'Mint gagal.');
            }
        } finally {
            setMinting(false);
        }
    }

    function resetForm() {
        setPdfFile(null);
        setRecipient('');
        setStudentName('');
        setConfirmed(false);
        setUploadResult(null);
        setUploadError('');
        setMintTx('');
        setMintError('');
        setMintSuccess(false);
    }

    // ── Guards ────────────────────────────────────────────────────────────────
    if (!account) {
        return (
            <div className="container">
                <div className="connect-prompt">
                    <div className="connect-prompt-icon">🦊</div>
                    <h2>Connect Wallet Anda</h2>
                    <p>Hubungkan MetaMask untuk mengakses School Dashboard.</p>
                    <button className="btn btn-primary btn-lg" onClick={connectWallet} disabled={walletLoading}>
                        {walletLoading ? <><span className="spinner"></span> Connecting...</> : '🔗 Connect MetaMask'}
                    </button>
                </div>
            </div>
        );
    }

    if (authLoading) {
        return (
            <div className="container" style={{ paddingTop: 'var(--space-3xl)', textAlign: 'center' }}>
                <span className="spinner" style={{ width: 32, height: 32 }}></span>
            </div>
        );
    }

    if (role !== ROLE.SCHOOL) {
        return (
            <div className="container">
                <div className="access-denied">
                    <div className="access-denied-icon">🚫</div>
                    <h2>Akses Ditolak</h2>
                    <p>Halaman ini hanya untuk wallet yang terdaftar sebagai <strong>Sekolah / Institusi</strong>.</p>
                    <div className="wallet-display">{account}</div>
                </div>
            </div>
        );
    }

    const canUpload = !!pdfFile && !uploading && !uploadResult;
    const canMint   = !!uploadResult && confirmed && ethers.isAddress(recipient) && !minting && !mintSuccess;

    return (
        <div className="container" style={{ paddingTop: 'var(--space-2xl)', paddingBottom: 'var(--space-3xl)' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 'var(--space-2xl)' }}>
                <div style={{ width: 44, height: 44, borderRadius: 'var(--radius-md)', background: 'linear-gradient(135deg, rgba(99,102,241,0.3), rgba(139,92,246,0.3))', border: '1px solid rgba(99,102,241,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem' }}>
                    🏫
                </div>
                <div>
                    <h1 style={{ fontSize: 'var(--font-2xl)', fontWeight: 700, margin: 0 }}>School Dashboard</h1>
                    <p style={{ color: 'var(--text-muted)', fontSize: 'var(--font-sm)', margin: 0 }}>
                        {institution || account.slice(0, 10) + '...' + account.slice(-8)}
                    </p>
                </div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 'var(--space-xl)', borderBottom: '1px solid var(--border)' }}>
                {[['mint', '📤 Mint Transkrip'], ['history', '📋 Riwayat Mint']].map(([id, label]) => (
                    <button key={id} type="button" onClick={() => setActiveTab(id)} style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        padding: '10px 20px', fontSize: 'var(--font-sm)', fontWeight: 600,
                        color: activeTab === id ? 'var(--primary)' : 'var(--text-muted)',
                        borderBottom: `2px solid ${activeTab === id ? 'var(--primary)' : 'transparent'}`,
                        marginBottom: -1, transition: 'color 0.15s',
                    }}>
                        {label}
                    </button>
                ))}
            </div>

            {/* ══ Tab: Mint Transkrip ══ */}
            {activeTab === 'mint' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-xl)', alignItems: 'start' }}>
                    {/* Left: form */}
                    <div className="glass-card-static">
                        {mintSuccess ? (
                            <div style={{ textAlign: 'center', padding: '24px 0' }}>
                                <div style={{ fontSize: 56, marginBottom: 12 }}>🎓</div>
                                <h3 style={{ color: '#4ade80', marginBottom: 8 }}>NFT Berhasil Di-Mint!</h3>
                                {mintTx && (
                                    <a href={`https://sepolia.etherscan.io/tx/${mintTx}`} target="_blank" rel="noreferrer"
                                        style={{ display: 'inline-block', color: 'var(--primary)', fontSize: 13, marginBottom: 20 }}>
                                        Lihat di Etherscan ↗
                                    </a>
                                )}
                                <br />
                                <button className="btn btn-primary" onClick={resetForm} style={{ marginTop: 12 }}>
                                    + Mint Transkrip Baru
                                </button>
                            </div>
                        ) : (
                            <>
                                <h3 style={{ fontSize: 'var(--font-md)', marginBottom: 'var(--space-lg)' }}>
                                    Upload & Mint Transkrip
                                </h3>

                                {/* Step 1: Upload PDF */}
                                <div style={sectionStyle}>
                                    <label style={labelStyle}>① File PDF Transkrip *</label>
                                    <input type="file" accept="application/pdf" onChange={handleFileChange}
                                        style={{ fontSize: 13, marginTop: 6, width: '100%' }} />
                                    {pdfFile && (
                                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
                                            📄 {pdfFile.name} ({(pdfFile.size / 1024).toFixed(1)} KB)
                                        </div>
                                    )}
                                </div>

                                {/* Step 2: Recipient info */}
                                <div style={sectionStyle}>
                                    <label style={labelStyle}>② Wallet Address Penerima *</label>
                                    <input type="text" className="form-input" placeholder="0x..."
                                        value={recipient} onChange={e => setRecipient(e.target.value)} />
                                    {recipient && !ethers.isAddress(recipient) && (
                                        <div style={{ fontSize: 12, color: '#f87171', marginTop: 4 }}>Address tidak valid.</div>
                                    )}
                                </div>

                                <div style={sectionStyle}>
                                    <label style={labelStyle}>③ Nama Penerima</label>
                                    <input type="text" className="form-input" placeholder="Nama lengkap penerima"
                                        value={studentName} onChange={e => setStudentName(e.target.value)} />
                                </div>

                                {/* Upload button */}
                                {!uploadResult && (
                                    <>
                                        {uploadError && (
                                            <div className="alert alert-error" style={{ marginBottom: 12 }}>
                                                <span className="alert-icon">⚠️</span>
                                                <div style={{ fontSize: 'var(--font-sm)' }}>{uploadError}</div>
                                            </div>
                                        )}
                                        <button className="btn btn-primary" onClick={handleUpload}
                                            disabled={!canUpload} style={{ width: '100%', marginBottom: 0 }}>
                                            {uploading
                                                ? <><span className="spinner"></span> Menghitung hash & upload ke IPFS...</>
                                                : '📤 Upload PDF ke IPFS'}
                                        </button>
                                    </>
                                )}

                                {/* Upload result */}
                                {uploadResult && (
                                    <div style={{ marginTop: 8 }}>
                                        <div style={{ background: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.25)', borderRadius: 8, padding: '12px 14px', marginBottom: 12 }}>
                                            <div style={{ fontSize: 12, color: '#4ade80', fontWeight: 600, marginBottom: 8 }}>✓ PDF terupload ke IPFS</div>
                                            <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-muted)', wordBreak: 'break-all', marginBottom: 6 }}>
                                                <strong>SHA-256:</strong><br />{uploadResult.sha256Hash}
                                            </div>
                                            <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-muted)', wordBreak: 'break-all' }}>
                                                <strong>CID:</strong> {uploadResult.pdfCID}
                                            </div>
                                        </div>

                                        {/* Confirmation checkbox */}
                                        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', marginBottom: 14 }}>
                                            <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}
                                                style={{ marginTop: 2, width: 16, height: 16, cursor: 'pointer', flexShrink: 0 }} />
                                            <span style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                                                Saya konfirmasi bahwa dokumen PDF ini benar dan akan di-mint sebagai NFT permanen di blockchain. Tindakan ini <strong>tidak dapat dibatalkan</strong>.
                                            </span>
                                        </label>

                                        {mintError && (
                                            <div className="alert alert-error" style={{ marginBottom: 12 }}>
                                                <span className="alert-icon">⚠️</span>
                                                <div style={{ fontSize: 'var(--font-sm)' }}>{mintError}</div>
                                            </div>
                                        )}

                                        <div style={{ display: 'flex', gap: 8 }}>
                                            <button className="btn btn-secondary" onClick={resetForm} disabled={minting}>
                                                ← Ulang
                                            </button>
                                            <button className="btn btn-primary" onClick={handleMint}
                                                disabled={!canMint} style={{ flex: 1 }}>
                                                {minting
                                                    ? <><span className="spinner"></span> Menunggu MetaMask...</>
                                                    : '🎓 Mint NFT Transkrip'}
                                            </button>
                                        </div>

                                        {mintTx && !mintSuccess && (
                                            <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-muted)' }}>
                                                Tx: <a href={`https://sepolia.etherscan.io/tx/${mintTx}`} target="_blank" rel="noreferrer"
                                                    style={{ color: 'var(--primary)' }}>{mintTx.slice(0, 18)}...</a>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    {/* Right: PDF preview */}
                    <div className="glass-card-static">
                        <h3 style={{ fontSize: 'var(--font-md)', marginBottom: 'var(--space-md)' }}>Preview PDF</h3>
                        {pdfFile ? (
                            <PdfPreview file={pdfFile} />
                        ) : (
                            <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-muted)' }}>
                                <p style={{ fontSize: '3rem', marginBottom: 8 }}>📄</p>
                                <p style={{ fontSize: 13 }}>Upload PDF untuk melihat preview di sini.</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ══ Tab: Riwayat Mint ══ */}
            {activeTab === 'history' && (
                <div className="glass-card-static">
                    <h3 style={{ fontSize: 'var(--font-md)', marginBottom: 'var(--space-lg)' }}>Riwayat Transkrip yang Di-Mint</h3>
                    <MintHistory account={account} />
                </div>
            )}
        </div>
    );
}

const sectionStyle = { marginBottom: 'var(--space-md)' };

const labelStyle = {
    display: 'block', fontSize: 13, fontWeight: 600,
    color: 'var(--text-secondary)', marginBottom: 4,
};
