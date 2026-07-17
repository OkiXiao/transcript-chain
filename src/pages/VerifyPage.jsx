import { useState } from 'react';
import { useWeb3 } from '../context/Web3Context';
import { useAuth, ROLE } from '../context/AuthContext';

async function computeSha256(file) {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return '0x' + hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function formatDate(timestamp) {
    if (!timestamp) return '-';
    return new Date(timestamp * 1000).toLocaleDateString('id-ID', {
        day: 'numeric', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

function HashDisplay({ label, value }) {
    if (!value) return null;
    return (
        <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 3 }}>{label}</div>
            <div style={{ fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.03)', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)' }}>
                {value}
            </div>
        </div>
    );
}

export default function VerifyPage() {
    const { account, contract, connectWallet, getReadOnlyContract } = useWeb3();
    const { role, roleLabel, loading: authLoading } = useAuth();

    const [activeTab, setActiveTab] = useState('token');

    // ── Tab 1: By Token ID ────────────────────────────────────────────────────
    const [tokenInput, setTokenInput]     = useState('');
    const [searching, setSearching]       = useState(false);
    const [searchError, setSearchError]   = useState('');
    const [transcript, setTranscript]     = useState(null);  // on-chain data
    const [ownerAddr, setOwnerAddr]       = useState('');

    async function handleSearch(e) {
        e.preventDefault();
        setSearchError('');
        setTranscript(null);
        const tokenId = parseInt(tokenInput);
        if (isNaN(tokenId) || tokenId < 1) {
            setSearchError('Token ID harus berupa angka positif.');
            return;
        }
        setSearching(true);
        try {
            const c = contract || getReadOnlyContract();
            if (!c) throw new Error('Tidak dapat terhubung ke blockchain.');
            const [data, owner] = await Promise.all([
                c.getTranscriptData(tokenId),
                c.ownerOf(tokenId),
            ]);
            setTranscript({
                tokenId,
                schoolName:  data[0],
                studentName: data[1],
                pdfCID:      data[2],
                sha256Hash:  data[3],
                issuedBy:    data[4],
                issuedAt:    Number(data[5]),
            });
            setOwnerAddr(owner);
        } catch (err) {
            if (err.message?.includes('nonexistent')) {
                setSearchError('Token ID tidak ditemukan.');
            } else {
                setSearchError(err.reason || err.message || 'Gagal mengambil data dari blockchain.');
            }
        } finally {
            setSearching(false);
        }
    }

    // ── Tab 2: By PDF ─────────────────────────────────────────────────────────
    const [pdfFile, setPdfFile]           = useState(null);
    const [pdfTokenId, setPdfTokenId]     = useState('');
    const [computing, setComputing]       = useState(false);
    const [pdfHash, setPdfHash]           = useState('');
    const [pdfCheckResult, setPdfCheckResult] = useState(null); // null | 'valid' | 'invalid' | 'hash_only'
    const [pdfError, setPdfError]         = useState('');

    async function handlePdfVerify(e) {
        e.preventDefault();
        if (!pdfFile) return;
        setPdfHash('');
        setPdfCheckResult(null);
        setPdfError('');
        setComputing(true);

        try {
            const localHash = await computeSha256(pdfFile);
            setPdfHash(localHash);

            if (pdfTokenId) {
                const tokenId = parseInt(pdfTokenId);
                if (isNaN(tokenId) || tokenId < 1) {
                    setPdfError('Token ID tidak valid.');
                    setComputing(false);
                    return;
                }
                const c = contract || getReadOnlyContract();
                if (!c) throw new Error('Tidak dapat terhubung ke blockchain.');
                const data = await c.getTranscriptData(tokenId);
                const onChainHash = data[3]; // sha256Hash
                setPdfCheckResult(localHash.toLowerCase() === onChainHash.toLowerCase() ? 'valid' : 'invalid');
            } else {
                setPdfCheckResult('hash_only');
            }
        } catch (err) {
            if (err.message?.includes('nonexistent')) {
                setPdfError('Token ID tidak ditemukan di blockchain.');
            } else {
                setPdfError(err.message || 'Terjadi kesalahan.');
            }
        } finally {
            setComputing(false);
        }
    }

    // ── Guards ────────────────────────────────────────────────────────────────
    if (authLoading) {
        return (
            <div className="container" style={{ paddingTop: 'var(--space-3xl)', textAlign: 'center' }}>
                <span className="spinner" style={{ width: 36, height: 36 }}></span>
            </div>
        );
    }

    if (!account) {
        return (
            <div className="container">
                <div className="connect-prompt">
                    <div className="connect-prompt-icon">🏢</div>
                    <h2>Akses HR</h2>
                    <p>Hubungkan wallet yang terdaftar sebagai <strong>HR</strong> untuk mengakses halaman verifikasi.</p>
                    <button className="btn btn-primary btn-lg" onClick={connectWallet}>🔗 Connect MetaMask</button>
                </div>
            </div>
        );
    }

    if (role !== ROLE.HR) {
        return (
            <div className="container">
                <div className="access-denied">
                    <div className="access-denied-icon">🚫</div>
                    <h2>Akses Ditolak</h2>
                    <p>Halaman ini hanya untuk <strong>HR / Perusahaan</strong>. Akun Anda terdaftar sebagai <strong>{roleLabel || 'Belum Terdaftar'}</strong>.</p>
                    <div className="wallet-display">{account}</div>
                </div>
            </div>
        );
    }

    return (
        <div className="container" style={{ paddingTop: 'var(--space-2xl)', paddingBottom: 'var(--space-3xl)' }}>
            {/* Header */}
            <div style={{ marginBottom: 'var(--space-2xl)' }}>
                <h1 style={{ fontSize: 'var(--font-2xl)', fontWeight: 700, margin: 0 }}>🔍 Verifikasi Transkrip</h1>
                <p style={{ color: 'var(--text-muted)', marginTop: 6, fontSize: 'var(--font-sm)' }}>
                    Verifikasi keaslian transkrip NFT secara on-chain
                </p>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 'var(--space-xl)', borderBottom: '1px solid var(--border)' }}>
                {[['token', '🔢 Cari by Token ID'], ['pdf', '📄 Verifikasi PDF']].map(([id, label]) => (
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

            {/* ══ Tab 1: By Token ID ══ */}
            {activeTab === 'token' && (
                <div>
                    <form onSubmit={handleSearch} className="glass-card-static" style={{ marginBottom: 'var(--space-xl)' }}>
                        <div style={{ display: 'flex', gap: 10 }}>
                            <input type="number" className="form-input mono" placeholder="Masukkan Token ID (contoh: 1)"
                                value={tokenInput} onChange={e => setTokenInput(e.target.value)} min="1" required
                                style={{ flex: 1 }} />
                            <button type="submit" className="btn btn-primary" disabled={searching}>
                                {searching ? <span className="spinner"></span> : '🔍'} Cari
                            </button>
                        </div>
                        {searchError && (
                            <div className="alert alert-error" style={{ marginTop: 12, marginBottom: 0 }}>
                                <span className="alert-icon">⚠️</span>
                                <div>{searchError}</div>
                            </div>
                        )}
                    </form>

                    {transcript && (
                        <div className="glass-card-static animate-fade-in-up">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-lg)', flexWrap: 'wrap', gap: 10 }}>
                                <h3 style={{ fontSize: 'var(--font-xl)', margin: 0 }}>
                                    📜 Transkrip #{transcript.tokenId}
                                </h3>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(74,222,128,0.1)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.25)', borderRadius: 999, padding: '4px 14px', fontSize: 13, fontWeight: 600 }}>
                                    ✅ On-chain
                                </span>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14, marginBottom: 20 }}>
                                {[
                                    ['Nama Penerima',  transcript.studentName || '(tidak tersedia)'],
                                    ['Institusi',      transcript.schoolName],
                                    ['Tanggal Mint',   formatDate(transcript.issuedAt)],
                                ].map(([label, value]) => (
                                    <div key={label} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px' }}>
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
                                        <div style={{ fontWeight: 600, fontSize: 'var(--font-sm)' }}>{value}</div>
                                    </div>
                                ))}
                            </div>

                            {[
                                ['Wallet Penerima (Owner)', ownerAddr],
                                ['Diterbitkan oleh (Sekolah)', transcript.issuedBy],
                            ].map(([label, addr]) => (
                                <div key={label} style={{ marginBottom: 10 }}>
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 3 }}>{label}</div>
                                    <a href={`https://sepolia.etherscan.io/address/${addr}`} target="_blank" rel="noreferrer"
                                        style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--primary)', wordBreak: 'break-all' }}>
                                        {addr}
                                    </a>
                                </div>
                            ))}

                            <HashDisplay label="SHA-256 Hash (tersimpan on-chain)" value={transcript.sha256Hash} />

                            {transcript.pdfCID && (
                                <div style={{ marginTop: 16 }}>
                                    <a href={`https://ipfs.io/ipfs/${transcript.pdfCID}`} target="_blank" rel="noreferrer"
                                        className="btn btn-secondary" style={{ marginRight: 8, fontSize: 13 }}>
                                        📄 Lihat PDF
                                    </a>
                                    <a href={`https://sepolia.etherscan.io/token/${contract?.target || ''}?a=${transcript.tokenId}`}
                                        target="_blank" rel="noreferrer"
                                        className="btn btn-secondary" style={{ fontSize: 13 }}>
                                        ⛓ Etherscan ↗
                                    </a>
                                </div>
                            )}

                            <div style={{ marginTop: 14, padding: '10px 14px', background: 'rgba(99,102,241,0.06)', borderRadius: 8, border: '1px solid rgba(99,102,241,0.15)', fontSize: 12, color: 'var(--text-muted)' }}>
                                💡 Untuk memverifikasi keaslian file PDF, gunakan tab <strong>Verifikasi PDF</strong> dan masukkan Token ID <strong>#{transcript.tokenId}</strong>.
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ══ Tab 2: PDF Verification ══ */}
            {activeTab === 'pdf' && (
                <div style={{ maxWidth: 600 }}>
                    <div className="glass-card-static">
                        <h3 style={{ fontSize: 'var(--font-md)', marginBottom: 8 }}>Verifikasi Integritas PDF</h3>
                        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 'var(--space-lg)', lineHeight: 1.6 }}>
                            Upload file PDF transkrip, lalu masukkan Token ID-nya. Sistem akan menghitung SHA-256 hash dari PDF dan membandingkannya dengan hash yang tersimpan di blockchain. Jika cocok, berarti dokumen <strong>tidak diubah</strong> sejak diterbitkan.
                        </p>

                        <form onSubmit={handlePdfVerify} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                            <div>
                                <label style={labelStyle}>File PDF Transkrip *</label>
                                <input type="file" accept="application/pdf" required
                                    onChange={e => {
                                        setPdfFile(e.target.files[0] || null);
                                        setPdfHash('');
                                        setPdfCheckResult(null);
                                        setPdfError('');
                                    }}
                                    style={{ fontSize: 13, marginTop: 6, width: '100%' }} />
                            </div>

                            <div>
                                <label style={labelStyle}>Token ID NFT (opsional — untuk perbandingan on-chain)</label>
                                <input type="number" className="form-input mono" placeholder="Kosongkan untuk hanya hitung hash"
                                    value={pdfTokenId} onChange={e => setPdfTokenId(e.target.value)} min="1" />
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                                    Jika diisi, hash PDF akan dibandingkan dengan hash NFT di blockchain.
                                </div>
                            </div>

                            {pdfError && (
                                <div className="alert alert-error">
                                    <span className="alert-icon">⚠️</span>
                                    <div>{pdfError}</div>
                                </div>
                            )}

                            <button type="submit" className="btn btn-primary" disabled={!pdfFile || computing}>
                                {computing ? <><span className="spinner"></span> Menghitung SHA-256...</> : '🔍 Verifikasi PDF'}
                            </button>
                        </form>

                        {/* Result */}
                        {pdfCheckResult && (
                            <div style={{ marginTop: 20 }}>
                                <HashDisplay label="SHA-256 hash dari file PDF yang Anda upload:" value={pdfHash} />

                                {pdfCheckResult === 'valid' && (
                                    <div style={{ background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: 10, padding: '16px 20px', textAlign: 'center' }}>
                                        <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
                                        <div style={{ fontWeight: 700, color: '#4ade80', fontSize: 'var(--font-md)', marginBottom: 6 }}>
                                            DOKUMEN VALID
                                        </div>
                                        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                                            Hash PDF cocok dengan yang tersimpan di blockchain. Dokumen ini <strong>tidak diubah</strong> sejak diterbitkan.
                                        </div>
                                    </div>
                                )}

                                {pdfCheckResult === 'invalid' && (
                                    <div style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 10, padding: '16px 20px', textAlign: 'center' }}>
                                        <div style={{ fontSize: 40, marginBottom: 8 }}>❌</div>
                                        <div style={{ fontWeight: 700, color: '#f87171', fontSize: 'var(--font-md)', marginBottom: 6 }}>
                                            HASH TIDAK COCOK
                                        </div>
                                        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                                            Hash PDF berbeda dari yang tersimpan di blockchain. Dokumen ini mungkin telah <strong>dimodifikasi</strong> setelah diterbitkan, atau ini bukan file yang benar.
                                        </div>
                                    </div>
                                )}

                                {pdfCheckResult === 'hash_only' && (
                                    <div style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 10, padding: '14px 18px' }}>
                                        <div style={{ fontWeight: 600, color: 'var(--primary)', marginBottom: 6 }}>
                                            ℹ️ Hash berhasil dihitung
                                        </div>
                                        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                                            Masukkan Token ID NFT untuk membandingkan dengan data on-chain.
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

const labelStyle = {
    display: 'block', fontSize: 13, fontWeight: 600,
    color: 'var(--text-secondary)', marginBottom: 4,
};
