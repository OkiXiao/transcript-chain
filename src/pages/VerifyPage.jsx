import { useState, useEffect, useRef } from 'react';
import { useWeb3 } from '../context/Web3Context';
import { ethers } from 'ethers';

function VerifyPage() {
    const { account, contract, connectWallet, getReadOnlyContract } = useWeb3();

    // Search state
    const [tokenIdInput, setTokenIdInput] = useState('');
    const [searching, setSearching] = useState(false);
    const [searchError, setSearchError] = useState('');

    // Transcript data
    const [transcriptData, setTranscriptData] = useState(null);
    const [ownerAddress, setOwnerAddress] = useState('');
    const [tokenURI, setTokenURI] = useState('');
    const [metadata, setMetadata] = useState(null); // parsed IPFS metadata JSON
    const [metaLoading, setMetaLoading] = useState(false);

    // Per-verifier verification state
    const [myVerification, setMyVerification] = useState(null); // { verified, verifiedAt }
    const [verifyStep, setVerifyStep] = useState('idle');
    // idle | requesting | waiting-owner | done | error
    const [verifyError, setVerifyError] = useState('');

    // Polling ref
    const pollingRef = useRef(null);

    // Check my verification status
    const checkMyVerification = async (tokenId) => {
        if (!account) {
            setMyVerification(null);
            return false;
        }
        try {
            const readContract = contract || getReadOnlyContract();
            if (!readContract) return false;

            const [verified, verifiedAt] = await readContract.isVerifiedBy(tokenId, account);
            setMyVerification({ verified, verifiedAt: Number(verifiedAt) });
            return verified;
        } catch (err) {
            console.error('Check verification failed:', err);
            setMyVerification(null);
            return false;
        }
    };

    // Re-check verification when account changes
    useEffect(() => {
        if (transcriptData && tokenIdInput) {
            checkMyVerification(parseInt(tokenIdInput));
        }
    }, [account]);

    // Cleanup polling on unmount
    useEffect(() => {
        return () => {
            if (pollingRef.current) clearInterval(pollingRef.current);
        };
    }, []);

    // Start polling for owner approval
    const startPolling = (tokenId) => {
        if (pollingRef.current) clearInterval(pollingRef.current);

        pollingRef.current = setInterval(async () => {
            try {
                const readContract = getReadOnlyContract();
                if (!readContract || !account) return;

                const [verified, verifiedAt] = await readContract.isVerifiedBy(tokenId, account);
                if (verified) {
                    clearInterval(pollingRef.current);
                    pollingRef.current = null;
                    setMyVerification({ verified: true, verifiedAt: Number(verifiedAt) });
                    setVerifyStep('done');
                }
            } catch (err) {
                console.error('Polling error:', err);
            }
        }, 5000); // Poll every 5 seconds
    };

    // Fetch transcript data by tokenId
    const handleSearch = async (e) => {
        e.preventDefault();
        setSearchError('');
        setTranscriptData(null);
        setOwnerAddress('');
        setTokenURI('');
        setMetadata(null);
        setVerifyStep('idle');
        setVerifyError('');
        setMyVerification(null);
        if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
        }

        const tokenId = parseInt(tokenIdInput);
        if (isNaN(tokenId) || tokenId < 1) {
            setSearchError('Token ID harus berupa angka positif');
            return;
        }

        setSearching(true);
        try {
            const readContract = contract || getReadOnlyContract();
            if (!readContract) throw new Error('Tidak dapat terhubung ke blockchain');

            const [data, owner, uri] = await Promise.all([
                readContract.getTranscriptData(tokenId),
                readContract.ownerOf(tokenId),
                readContract.tokenURI(tokenId),
            ]);

            const td = {
                schoolName: data[0],
                studentName: data[1],
                ipfsCID: data[2],
                issuedBy: data[3],
                issuedAt: Number(data[4]),
            };
            setTranscriptData(td);
            setOwnerAddress(owner);
            setTokenURI(uri);

            // Fetch IPFS metadata JSON for grades & NIM
            if (uri) {
                const gatewayUrl = uri.replace('ipfs://', 'https://gateway.pinata.cloud/ipfs/');
                setMetaLoading(true);
                fetch(gatewayUrl)
                    .then(r => r.ok ? r.json() : null)
                    .then(json => setMetadata(json))
                    .catch(() => setMetadata(null))
                    .finally(() => setMetaLoading(false));
            }

            // Check verification status for connected wallet
            if (account) {
                const [verified, verifiedAt] = await readContract.isVerifiedBy(tokenId, account);
                setMyVerification({ verified, verifiedAt: Number(verifiedAt) });

                // If there's a pending request, start polling
                const pending = await readContract.isVerificationPending(tokenId, account);
                if (pending && !verified) {
                    setVerifyStep('waiting-owner');
                    startPolling(tokenId);
                }
            }
        } catch (err) {
            console.error('Search failed:', err);
            if (err.message?.includes('nonexistent')) {
                setSearchError('Token ID tidak ditemukan. Pastikan ID yang dimasukkan benar.');
            } else {
                setSearchError(err.reason || err.message || 'Gagal mengambil data dari blockchain');
            }
        } finally {
            setSearching(false);
        }
    };

    const formatDate = (timestamp) => {
        if (!timestamp) return '-';
        return new Date(timestamp * 1000).toLocaleDateString('id-ID', {
            day: 'numeric', month: 'long', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    };

    const formatAddress = (addr) => `${addr.slice(0, 8)}...${addr.slice(-6)}`;

    // ─── Verification Flow ───

    const handleStartVerification = async () => {
        if (!contract) {
            setVerifyError('Silakan connect wallet untuk memulai verifikasi');
            return;
        }

        const tokenId = parseInt(tokenIdInput);
        setVerifyStep('requesting');
        setVerifyError('');

        try {
            // If already verified, reset first
            if (myVerification?.verified) {
                const resetTx = await contract.resetVerification(tokenId);
                await resetTx.wait();
                setMyVerification(null);
            }

            // Request verification on blockchain
            const tx = await contract.requestVerification(tokenId);
            await tx.wait();

            // Start polling for owner approval
            setVerifyStep('waiting-owner');
            startPolling(tokenId);
        } catch (err) {
            console.error('Request verification failed:', err);

            if (err.reason?.includes('already pending')) {
                // Already pending, start polling
                setVerifyStep('waiting-owner');
                startPolling(tokenId);
                return;
            }

            setVerifyStep('error');
            setVerifyError(err.reason || err.message || 'Gagal request verifikasi');
        }
    };

    return (
        <div className="verify-container">
            <div className="section-header" style={{ textAlign: 'left' }}>
                <h2>🔍 Verifikasi Transkrip</h2>
                <p style={{ margin: 0 }}>Masukkan Token ID untuk memverifikasi keaslian transkrip ijazah</p>
            </div>

            {/* Search Form */}
            <form onSubmit={handleSearch} className="glass-card-static" style={{ marginBottom: 'var(--space-xl)' }}>
                <div className="verify-search">
                    <input
                        type="number"
                        className="form-input mono"
                        placeholder="Masukkan Token ID (contoh: 1)"
                        value={tokenIdInput}
                        onChange={(e) => setTokenIdInput(e.target.value)}
                        min="1"
                        required
                    />
                    <button type="submit" className="btn btn-primary" disabled={searching}>
                        {searching ? <span className="spinner"></span> : '🔍'} Cari
                    </button>
                </div>
                {searchError && (
                    <div className="alert alert-error" style={{ marginTop: 'var(--space-md)', marginBottom: 0 }}>
                        <span className="alert-icon">⚠️</span>
                        <div>{searchError}</div>
                    </div>
                )}
            </form>

            {/* Transcript Data Display */}
            {transcriptData && (
                <div className="animate-fade-in-up">
                    {/* Header with per-verifier verification status */}
                    <div className="glass-card-static" style={{ marginBottom: 'var(--space-lg)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-lg)' }}>
                            <div>
                                <h3 style={{ fontSize: 'var(--font-xl)' }}>📜 Data Transkrip</h3>
                                <div className="token-id-display" style={{ margin: 'var(--space-md) 0 0', padding: 'var(--space-sm) var(--space-md)' }}>
                                    <div>
                                        <span className="token-label">Token ID</span>
                                        <span className="token-value" style={{ fontSize: 'var(--font-xl)' }}>#{tokenIdInput}</span>
                                    </div>
                                </div>
                            </div>
                            <div className={`status-badge ${myVerification?.verified ? 'verified' : 'unverified'}`}>
                                {!account
                                    ? '🔌 Connect wallet untuk verifikasi'
                                    : myVerification?.verified
                                        ? '✅ Verified oleh Anda'
                                        : verifyStep === 'waiting-owner'
                                            ? '⏳ Menunggu owner approve...'
                                            : '⏳ Belum diverifikasi oleh Anda'
                                }
                            </div>
                        </div>

                        {/* ── Core info ── */}
                        <div className="metadata-grid">
                            <div className="metadata-item">
                                <div className="metadata-label">Nama Mahasiswa</div>
                                <div className="metadata-value">{transcriptData.studentName}</div>
                            </div>
                            {metadata?.attributes?.find(a => a.trait_type === 'NIM') && (
                                <div className="metadata-item">
                                    <div className="metadata-label">NIM</div>
                                    <div className="metadata-value">{metadata.attributes.find(a => a.trait_type === 'NIM').value}</div>
                                </div>
                            )}
                            <div className="metadata-item">
                                <div className="metadata-label">Universitas</div>
                                <div className="metadata-value">{transcriptData.schoolName}</div>
                            </div>
                            <div className="metadata-item">
                                <div className="metadata-label">Tanggal Diterbitkan</div>
                                <div className="metadata-value">{formatDate(transcriptData.issuedAt)}</div>
                            </div>
                            <div className="metadata-item">
                                <div className="metadata-label">Wallet Mahasiswa (Owner)</div>
                                <div className="metadata-value mono" style={{ fontSize: 'var(--font-xs)' }}>
                                    <a href={`https://sepolia.etherscan.io/address/${ownerAddress}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)' }}>
                                        {ownerAddress}
                                    </a>
                                </div>
                            </div>
                            <div className="metadata-item">
                                <div className="metadata-label">Wallet Universitas</div>
                                <div className="metadata-value mono" style={{ fontSize: 'var(--font-xs)' }}>
                                    <a href={`https://sepolia.etherscan.io/address/${transcriptData.issuedBy}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)' }}>
                                        {transcriptData.issuedBy}
                                    </a>
                                </div>
                            </div>
                            {myVerification?.verified && (
                                <div className="metadata-item">
                                    <div className="metadata-label">Terverifikasi oleh Anda</div>
                                    <div className="metadata-value">{formatDate(myVerification.verifiedAt)}</div>
                                </div>
                            )}
                        </div>

                        {/* ── Grades table ── */}
                        {metaLoading && (
                            <div style={{ marginTop: 'var(--space-lg)', display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', color: 'var(--text-muted)', fontSize: 'var(--font-sm)' }}>
                                <span className="spinner" style={{ width: 16, height: 16 }}></span> Memuat data nilai dari IPFS...
                            </div>
                        )}

                        {!metaLoading && metadata?.grades?.length > 0 && (
                            <div style={{ marginTop: 'var(--space-xl)' }}>
                                <h4 style={{ fontSize: 'var(--font-md)', color: 'var(--text-secondary)', marginBottom: 'var(--space-md)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    📊 Nilai Mata Kuliah
                                    <span style={{ fontSize: 'var(--font-xs)', background: 'rgba(99,102,241,0.15)', color: 'var(--primary)', padding: '2px 8px', borderRadius: 12, fontWeight: 400 }}>
                                        {metadata.grades.length} MK
                                    </span>
                                </h4>
                                <div style={{ overflowX: 'auto', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-sm)' }}>
                                        <thead>
                                            <tr style={{ background: 'rgba(255,255,255,0.04)' }}>
                                                <th style={{ textAlign: 'left', padding: '10px 14px', color: 'var(--text-muted)', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>KMK</th>
                                                <th style={{ textAlign: 'left', padding: '10px 14px', color: 'var(--text-muted)', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>Mata Kuliah</th>
                                                <th style={{ textAlign: 'center', padding: '10px 14px', color: 'var(--text-muted)', fontWeight: 600, borderBottom: '1px solid var(--border)', width: 70 }}>Nilai</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {metadata.grades.map((g, i) => (
                                                <tr key={i} style={{ borderBottom: i < metadata.grades.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                                                    <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)' }}>{g.kmk}</td>
                                                    <td style={{ padding: '10px 14px' }}>{g.courseName}</td>
                                                    <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700, color: g.grade === 'A' ? 'var(--success)' : g.grade?.startsWith('A') ? '#86efac' : g.grade === 'E' || g.grade === 'D' ? '#f87171' : 'var(--text-primary)' }}>
                                                        {g.grade}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* ── PDF & Metadata buttons ── */}
                        <div style={{ marginTop: 'var(--space-lg)', display: 'flex', gap: 'var(--space-md)', flexWrap: 'wrap' }}>
                            {transcriptData.ipfsCID && (
                                <a href={`https://gateway.pinata.cloud/ipfs/${transcriptData.ipfsCID}`}
                                    target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
                                    📄 Lihat PDF Ijazah
                                </a>
                            )}
                            {tokenURI && (
                                <a href={tokenURI.replace('ipfs://', 'https://gateway.pinata.cloud/ipfs/')}
                                    target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
                                    📋 Metadata JSON
                                </a>
                            )}
                            <a href={`https://sepolia.etherscan.io/token/${contract?.target || ''}?a=${tokenIdInput}`}
                                target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
                                ⛓ Etherscan
                            </a>
                        </div>
                    </div>

                    {/* Verification Actions */}
                    {verifyStep !== 'done' && (
                        <div className="glass-card-static" style={{ marginBottom: 'var(--space-lg)' }}>
                            <h3 style={{ fontSize: 'var(--font-xl)', marginBottom: 'var(--space-lg)' }}>✍️ Proses Verifikasi</h3>

                            {/* Cross-device info banner */}
                            <div className="alert alert-info" style={{ marginBottom: 'var(--space-lg)' }}>
                                <span className="alert-icon">🌐</span>
                                <div>
                                    Verifikasi bersifat <strong>cross-device</strong>. Anda request verifikasi di sini, lalu <strong>pemilik transkrip</strong> akan meng-approve dari device mereka sendiri via halaman <strong>Owner Approval</strong>.
                                    {myVerification?.verified && (
                                        <span> Anda sudah pernah memverifikasi ({formatDate(myVerification.verifiedAt)}), tapi bisa <strong>verifikasi ulang</strong>.</span>
                                    )}
                                </div>
                            </div>

                            {/* Not connected */}
                            {!account && (
                                <div>
                                    <div className="alert alert-info" style={{ marginBottom: 'var(--space-md)' }}>
                                        <span className="alert-icon">ℹ️</span>
                                        <div>Connect wallet Anda untuk memulai proses verifikasi.</div>
                                    </div>
                                    <button className="btn btn-primary btn-lg" onClick={connectWallet}>
                                        🔗 Connect Wallet
                                    </button>
                                </div>
                            )}

                            {/* Step: Ready to request */}
                            {account && verifyStep === 'idle' && (
                                <div>
                                    <div className="alert alert-info" style={{ marginBottom: 'var(--space-lg)' }}>
                                        <span className="alert-icon">ℹ️</span>
                                        <div>
                                            <strong>Langkah 1:</strong> Request verifikasi. Setelah request terkirim, pemilik transkrip akan melihat request ini di halaman <strong>Owner Approval</strong> dan meng-approve dengan ECDSA signature dari device mereka.
                                        </div>
                                    </div>
                                    <button className="btn btn-primary btn-lg" onClick={handleStartVerification}>
                                        {myVerification?.verified ? '🔄 Verifikasi Ulang' : '📨 Request Verifikasi'}
                                    </button>
                                </div>
                            )}

                            {/* Step: Requesting... */}
                            {verifyStep === 'requesting' && (
                                <div className="alert alert-info">
                                    <span className="spinner"></span>
                                    <div>Mengirim request verifikasi ke blockchain...</div>
                                </div>
                            )}

                            {/* Step: Waiting for owner to approve from their device */}
                            {verifyStep === 'waiting-owner' && (
                                <div>
                                    <div className="alert alert-warning" style={{ marginBottom: 'var(--space-lg)' }}>
                                        <span className="spinner"></span>
                                        <div>
                                            <strong>Menunggu pemilik transkrip meng-approve...</strong>
                                            <br /><br />
                                            Pemilik transkrip (
                                            <code style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)' }}>
                                                {formatAddress(ownerAddress)}
                                            </code>
                                            ) harus membuka halaman <strong>Owner Approval</strong> dari device mereka dan meng-approve request Anda.
                                            <br /><br />
                                            <em>Halaman ini akan otomatis terupdate saat owner meng-approve (polling setiap 5 detik).</em>
                                        </div>
                                    </div>

                                    <div className="alert alert-info">
                                        <span className="alert-icon">📱</span>
                                        <div>
                                            <strong>Beritahu pemilik:</strong> Buka <code style={{ fontFamily: 'var(--font-mono)' }}>TranscriptChain → Owner Approval</code> dan connect wallet <code style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)' }}>{formatAddress(ownerAddress)}</code> untuk melihat dan approve request ini.
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Error */}
                            {verifyStep === 'error' && (
                                <div>
                                    <div className="alert alert-error" style={{ marginBottom: 'var(--space-md)' }}>
                                        <span className="alert-icon">❌</span>
                                        <div>{verifyError}</div>
                                    </div>
                                    <button className="btn btn-secondary" onClick={() => setVerifyStep('idle')}>
                                        🔄 Coba Lagi
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Verification Success */}
                    {verifyStep === 'done' && (
                        <div className="verify-result valid animate-fade-in-up">
                            <div className="verify-icon">✅</div>
                            <h2 style={{ marginBottom: 'var(--space-md)' }}>Transkrip Terverifikasi!</h2>
                            <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-xl)' }}>
                                Transkrip ini telah diverifikasi secara kriptografis.
                                Pemilik transkrip (<strong>{formatAddress(ownerAddress)}</strong>) telah menandatangani persetujuan menggunakan ECDSA signature di blockchain Ethereum.
                            </p>

                            <div className="alert alert-success" style={{ marginBottom: 'var(--space-lg)', textAlign: 'left' }}>
                                <span className="alert-icon">🔑</span>
                                <div>
                                    <strong>Cross-Device ECDSA Verification:</strong> Owner telah sign dari device mereka menggunakan
                                    operasi elliptic curve secp256k1. Signature diverifikasi on-chain oleh smart contract.
                                    <br /><br />
                                    <strong>Verifier:</strong> {account ? formatAddress(account) : ''}<br />
                                    <strong>Owner:</strong> {formatAddress(ownerAddress)}<br />
                                    <strong>Verified At:</strong> {myVerification ? formatDate(myVerification.verifiedAt) : '-'}
                                </div>
                            </div>

                            {/* Button to verify again */}
                            <div style={{ marginTop: 'var(--space-xl)', textAlign: 'center' }}>
                                <button className="btn btn-secondary btn-lg" onClick={() => {
                                    setVerifyStep('idle');
                                    checkMyVerification(parseInt(tokenIdInput));
                                }}>
                                    🔄 Verifikasi Ulang
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default VerifyPage;
