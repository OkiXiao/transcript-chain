import { Link } from 'react-router-dom';

function LandingPage() {
    return (
        <>
            {/* Hero Section */}
            <section className="hero">
                <div className="container">
                    <div className="hero-content">
                        <div className="hero-badge">
                            ⛓️ Powered by Ethereum Blockchain + IPFS
                        </div>
                        <h1>
                            Verifikasi <span className="gradient-text">Transkrip Ijazah</span> dengan Teknologi Blockchain
                        </h1>
                        <p className="hero-subtitle">
                            TranscriptChain menggunakan NFT (ERC-721), IPFS, dan ECDSA signature untuk memastikan
                            keaslian dokumen akademik secara desentralisasi, transparan, dan anti-pemalsuan.
                        </p>
                        <div className="hero-buttons">
                            <Link to="/dashboard" className="btn btn-primary btn-lg">
                                🏫 School Dashboard
                            </Link>
                            <Link to="/verify" className="btn btn-secondary btn-lg">
                                🔍 Verifikasi Transkrip
                            </Link>
                        </div>
                    </div>
                </div>
                <div className="hero-visual">
                    <div className="hero-orb hero-orb-1"></div>
                    <div className="hero-orb hero-orb-2"></div>
                    <div className="hero-orb hero-orb-3"></div>
                </div>
            </section>

            {/* How it Works */}
            <section className="section">
                <div className="container">
                    <div className="section-header">
                        <h2>Bagaimana Cara Kerjanya?</h2>
                        <p>Proses verifikasi transkrip dalam 4 langkah sederhana</p>
                    </div>
                    <div className="steps-grid">
                        <div className="glass-card step-card">
                            <div className="step-number">1</div>
                            <h3>Upload Transkrip</h3>
                            <p>Sekolah yang terdaftar mengupload transkrip PDF melalui dashboard yang aman</p>
                        </div>
                        <div className="glass-card step-card">
                            <div className="step-number">2</div>
                            <h3>Simpan di IPFS</h3>
                            <p>Dokumen disimpan ke IPFS secara permanen dan mendapat Content ID (CID) unik</p>
                        </div>
                        <div className="glass-card step-card">
                            <div className="step-number">3</div>
                            <h3>Mint NFT</h3>
                            <p>Smart contract membuat NFT berisi metadata transkrip dan dikirim ke wallet penerima</p>
                        </div>
                        <div className="glass-card step-card">
                            <div className="step-number">4</div>
                            <h3>Verifikasi ECDSA</h3>
                            <p>HR memverifikasi, pemilik menyetujui dengan tanda tangan digital ECDSA</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Features */}
            <section className="section">
                <div className="container">
                    <div className="section-header">
                        <h2>Mengapa TranscriptChain?</h2>
                        <p>Dibangun dengan teknologi terdepan untuk keamanan maksimal</p>
                    </div>
                    <div className="features-grid">
                        <div className="glass-card feature-card">
                            <div className="feature-icon">🔐</div>
                            <h3>Custom ERC-721</h3>
                            <p>NFT dibangun dari scratch tanpa library eksternal, memberikan kontrol penuh atas logika kepemilikan dan transfer dokumen.</p>
                        </div>
                        <div className="glass-card feature-card">
                            <div className="feature-icon">✍️</div>
                            <h3>ECDSA dari Rumus</h3>
                            <p>Implementasi tanda tangan digital menggunakan kurva secp256k1 dari rumus matematika — bukan sekadar memanggil library.</p>
                        </div>
                        <div className="glass-card feature-card">
                            <div className="feature-icon">🌐</div>
                            <h3>IPFS Decentralized</h3>
                            <p>Dokumen disimpan di jaringan IPFS yang terdesentralisasi, memastikan ketersediaan dan integritas data secara permanen.</p>
                        </div>
                        <div className="glass-card feature-card">
                            <div className="feature-icon">🏫</div>
                            <h3>Wallet-Gated Access</h3>
                            <p>Hanya sekolah yang terdaftar di smart contract yang dapat mengupload transkrip, mencegah akses tidak sah.</p>
                        </div>
                        <div className="glass-card feature-card">
                            <div className="feature-icon">✅</div>
                            <h3>Owner Approval</h3>
                            <p>Pemilik transkrip harus menandatangani persetujuan verifikasi secara aktif menggunakan wallet mereka.</p>
                        </div>
                        <div className="glass-card feature-card">
                            <div className="feature-icon">🔗</div>
                            <h3>On-Chain Proof</h3>
                            <p>Setiap transkrip tercatat di blockchain Ethereum, memberikan bukti yang tidak dapat diubah atau dihapus.</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Tech Stack */}
            <section className="section">
                <div className="container">
                    <div className="section-header">
                        <h2>Tech Stack</h2>
                        <p>Teknologi yang digunakan dalam TranscriptChain</p>
                    </div>
                    <div className="steps-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
                        {[
                            { icon: '⚛️', name: 'React + Vite', desc: 'Frontend Framework' },
                            { icon: '💎', name: 'Solidity', desc: 'Smart Contract' },
                            { icon: '🔷', name: 'Ethereum Sepolia', desc: 'Testnet Blockchain' },
                            { icon: '📦', name: 'IPFS / Pinata', desc: 'Decentralized Storage' },
                            { icon: '🔑', name: 'ECDSA secp256k1', desc: 'Digital Signature' },
                            { icon: '🦊', name: 'MetaMask', desc: 'Wallet Provider' },
                        ].map((tech) => (
                            <div className="glass-card" key={tech.name} style={{ textAlign: 'center', padding: '1.5rem' }}>
                                <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>{tech.icon}</div>
                                <h3 style={{ fontSize: '1rem', marginBottom: '0.25rem' }}>{tech.name}</h3>
                                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{tech.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>
        </>
    );
}

export default LandingPage;
