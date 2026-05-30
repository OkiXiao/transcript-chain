import { useState, useEffect, useCallback } from 'react';
import { useWeb3 } from '../context/Web3Context';

const API_BASE = import.meta.env.VITE_API_URL !== undefined
    ? import.meta.env.VITE_API_URL
    : (import.meta.env.DEV ? 'http://localhost:3001' : '');

function AdminDashboard() {
    const { account, connectWallet, loading: walletLoading } = useWeb3();

    const [activeTab, setActiveTab] = useState('schools');
    const [accessStatus, setAccessStatus] = useState('idle'); // idle | checking | ok | forbidden | unconfigured
    const [schools, setSchools] = useState([]);
    const [hr, setHr] = useState([]);
    const [listLoading, setListLoading] = useState(false);

    // Whitelist add form
    const [addEmail, setAddEmail] = useState('');
    const [addName, setAddName] = useState('');
    const [addLoading, setAddLoading] = useState(false);
    const [addError, setAddError] = useState('');
    const [addSuccess, setAddSuccess] = useState('');

    // Ministry tab
    const [ministryWallet, setMinistryWallet] = useState('');
    const [ministryInput, setMinistryInput] = useState('');
    const [ministryLoading, setMinistryLoading] = useState(false);
    const [ministryError, setMinistryError] = useState('');
    const [ministrySuccess, setMinistrySuccess] = useState('');

    const fetchWhitelist = useCallback(async () => {
        if (!account || accessStatus !== 'ok') return;
        setListLoading(true);
        try {
            const res = await fetch(`${API_BASE}/api/admin?adminWallet=${account}`);
            const data = await res.json();
            if (data.success) {
                setSchools(data.schools || []);
                setHr(data.hr || []);
            }
        } catch { /* ignore */ }
        finally { setListLoading(false); }
    }, [account, accessStatus]);

    const fetchMinistryConfig = useCallback(async () => {
        if (!account || accessStatus !== 'ok') return;
        try {
            const res = await fetch(`${API_BASE}/api/admin?adminWallet=${account}&type=config`);
            const data = await res.json();
            if (data.success) {
                setMinistryWallet(data.ministryWallet || '');
                setMinistryInput(data.ministryWallet || '');
            }
        } catch { /* ignore */ }
    }, [account, accessStatus]);

    // Verify admin access when wallet connects
    useEffect(() => {
        if (!account) { setAccessStatus('idle'); return; }
        setAccessStatus('checking');
        fetch(`${API_BASE}/api/admin?adminWallet=${account}&type=schools`)
            .then(res => res.json().then(data => ({ ok: res.ok, status: res.status, data })))
            .then(({ ok, status, data }) => {
                if (ok && data.success) setAccessStatus('ok');
                else if (status === 503) setAccessStatus('unconfigured');
                else if (status === 403) setAccessStatus('forbidden');
                else setAccessStatus('forbidden');
            })
            .catch(() => setAccessStatus('forbidden'));
    }, [account]);

    useEffect(() => {
        if (accessStatus === 'ok') {
            fetchWhitelist();
            fetchMinistryConfig();
        }
    }, [accessStatus, fetchWhitelist, fetchMinistryConfig]);

    useEffect(() => {
        if (activeTab === 'ministry') fetchMinistryConfig();
    }, [activeTab, fetchMinistryConfig]);

    const handleAdd = async (e) => {
        e.preventDefault();
        setAddError(''); setAddSuccess('');
        const email = addEmail.trim().toLowerCase();
        if (!email || !email.includes('@')) { setAddError('Masukkan email yang valid.'); return; }

        setAddLoading(true);
        try {
            const action = activeTab === 'schools' ? 'add_school' : 'add_hr';
            const body = { adminWallet: account, action, email };
            if (activeTab === 'schools') body.schoolName = addName.trim();
            else body.companyName = addName.trim();

            const res = await fetch(`${API_BASE}/api/admin`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.error || 'Gagal menambahkan.');
            setAddSuccess(data.message || 'Berhasil ditambahkan.');
            setAddEmail(''); setAddName('');
            fetchWhitelist();
        } catch (err) {
            setAddError(err.message || 'Terjadi kesalahan.');
        } finally { setAddLoading(false); }
    };

    const handleRemove = async (email) => {
        if (!confirm(`Hapus "${email}" dari whitelist?`)) return;
        const action = activeTab === 'schools' ? 'remove_school' : 'remove_hr';
        try {
            const res = await fetch(`${API_BASE}/api/admin`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ adminWallet: account, action, email }),
            });
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.error || 'Gagal menghapus.');
            fetchWhitelist();
        } catch (err) {
            alert(`Gagal: ${err.message}`);
        }
    };

    const handleSetMinistry = async (e) => {
        e.preventDefault();
        setMinistryError(''); setMinistrySuccess('');
        const w = ministryInput.trim();
        if (!w) { setMinistryError('Masukkan wallet address.'); return; }

        setMinistryLoading(true);
        try {
            const res = await fetch(`${API_BASE}/api/admin`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ adminWallet: account, action: 'set_ministry', ministryWallet: w }),
            });
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.error || 'Gagal menyimpan.');
            setMinistryWallet(w.toLowerCase());
            setMinistrySuccess('Wallet Kementerian berhasil disimpan.');
        } catch (err) {
            setMinistryError(err.message || 'Terjadi kesalahan.');
        } finally { setMinistryLoading(false); }
    };

    // ── Not connected ─────────────────────────────────────────────
    if (!account) {
        return (
            <div className="container">
                <div className="connect-prompt">
                    <div className="connect-prompt-icon">🦊</div>
                    <h2>Connect Wallet Anda</h2>
                    <p>Hubungkan wallet MetaMask untuk mengakses Admin Dashboard.</p>
                    <button className="btn btn-primary btn-lg" onClick={connectWallet} disabled={walletLoading}>
                        {walletLoading ? <><span className="spinner"></span> Connecting...</> : '🔗 Connect MetaMask'}
                    </button>
                </div>
            </div>
        );
    }

    if (accessStatus === 'checking') {
        return (
            <div className="container" style={{ paddingTop: 'var(--space-3xl)', textAlign: 'center' }}>
                <span className="spinner" style={{ width: 32, height: 32 }}></span>
                <p style={{ color: 'var(--text-muted)', marginTop: 16 }}>Memverifikasi akses admin...</p>
            </div>
        );
    }

    if (accessStatus === 'unconfigured') {
        return (
            <div className="container">
                <div className="access-denied">
                    <div className="access-denied-icon">⚙️</div>
                    <h2>Konfigurasi Belum Diatur</h2>
                    <p>Environment variable <code>ADMIN_WALLET</code> belum diset di server.</p>
                </div>
            </div>
        );
    }

    if (accessStatus === 'forbidden') {
        return (
            <div className="container">
                <div className="access-denied">
                    <div className="access-denied-icon">🚫</div>
                    <h2>Akses Ditolak</h2>
                    <p>Wallet Anda tidak terdaftar sebagai Admin sistem.</p>
                    <div className="wallet-display">{account}</div>
                </div>
            </div>
        );
    }

    const list = activeTab === 'schools' ? schools : hr;
    const namePlaceholder = activeTab === 'schools' ? 'Nama Institusi (opsional)' : 'Nama Perusahaan (opsional)';

    return (
        <div className="container" style={{ paddingTop: 'var(--space-2xl)', paddingBottom: 'var(--space-3xl)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-2xl)', flexWrap: 'wrap', gap: 'var(--space-md)' }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                        <div style={{ width: 44, height: 44, borderRadius: 'var(--radius-md)', background: 'linear-gradient(135deg, rgba(99,102,241,0.3), rgba(139,92,246,0.3))', border: '1px solid rgba(99,102,241,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem' }}>
                            🛡️
                        </div>
                        <div>
                            <h1 style={{ fontSize: 'var(--font-2xl)', fontWeight: 700, margin: 0 }}>Admin Dashboard</h1>
                            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--font-sm)', margin: 0 }}>Kelola akses institusi, HR, dan Kementerian</p>
                        </div>
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.25)', borderRadius: 'var(--radius-md)', padding: '6px 12px', fontSize: 'var(--font-xs)', color: '#34d399' }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#34d399' }}></span>
                        {account.slice(0, 6)}…{account.slice(-4)}
                    </div>
                    <button className="btn btn-secondary" style={{ fontSize: 'var(--font-xs)', padding: '6px 12px' }}
                        onClick={() => { fetchWhitelist(); fetchMinistryConfig(); }} disabled={listLoading}>
                        {listLoading ? <span className="spinner" style={{ width: 12, height: 12 }}></span> : '↻ Refresh'}
                    </button>
                </div>
            </div>

            {/* Tab navigation */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 'var(--space-xl)', borderBottom: '1px solid var(--border)' }}>
                {[
                    ['schools', '🏫 Sekolah / Institusi', schools.length],
                    ['hr',      '🏢 HR / Perusahaan',    hr.length],
                    ['ministry','🏛️ Kementerian',         null],
                ].map(([id, label, count]) => (
                    <button key={id} type="button"
                        onClick={() => { setActiveTab(id); setAddEmail(''); setAddName(''); setAddError(''); setAddSuccess(''); }}
                        style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            padding: '10px 20px', fontSize: 'var(--font-sm)', fontWeight: 600,
                            color: activeTab === id ? 'var(--primary)' : 'var(--text-muted)',
                            borderBottom: `2px solid ${activeTab === id ? 'var(--primary)' : 'transparent'}`,
                            marginBottom: -1, transition: 'color 0.15s',
                        }}>
                        {label}
                        {count !== null && (
                            <span style={{ marginLeft: 8, fontSize: 'var(--font-xs)', background: 'rgba(255,255,255,0.06)', padding: '1px 8px', borderRadius: 999, color: 'var(--text-muted)' }}>
                                {count}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* ══ Tab: Sekolah / HR ══ */}
            {(activeTab === 'schools' || activeTab === 'hr') && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: 'var(--space-xl)', alignItems: 'start' }}>
                    {/* Add form */}
                    <div className="glass-card-static">
                        <h3 style={{ fontSize: 'var(--font-md)', marginBottom: 'var(--space-lg)' }}>
                            {activeTab === 'schools' ? '➕ Tambah Institusi' : '➕ Tambah HR'}
                        </h3>
                        <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label className="form-label">Email *</label>
                                <input type="email" className="form-input"
                                    placeholder={activeTab === 'schools' ? 'admin@universitas.ac.id' : 'hr@perusahaan.com'}
                                    value={addEmail} onChange={e => setAddEmail(e.target.value)}
                                    disabled={addLoading} required />
                            </div>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label className="form-label">{activeTab === 'schools' ? 'Nama Institusi' : 'Nama Perusahaan'}</label>
                                <input type="text" className="form-input" placeholder={namePlaceholder}
                                    value={addName} onChange={e => setAddName(e.target.value)}
                                    disabled={addLoading} />
                            </div>

                            {addError && (
                                <div className="alert alert-error" style={{ margin: 0 }}>
                                    <span className="alert-icon">⚠️</span>
                                    <div style={{ fontSize: 'var(--font-sm)' }}>{addError}</div>
                                </div>
                            )}
                            {addSuccess && (
                                <div style={{ background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: 'var(--radius-md)', padding: 'var(--space-sm) var(--space-md)', fontSize: 'var(--font-sm)', color: 'var(--success)' }}>
                                    ✓ {addSuccess}
                                </div>
                            )}

                            <button type="submit" className="btn btn-primary" disabled={addLoading || !addEmail.trim()}>
                                {addLoading ? <><span className="spinner"></span> Menyimpan...</> : '💾 Tambahkan ke Whitelist'}
                            </button>
                        </form>
                    </div>

                    {/* Whitelist */}
                    <div className="glass-card-static">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
                            <h3 style={{ fontSize: 'var(--font-md)' }}>
                                {activeTab === 'schools' ? '🏫 Daftar Institusi' : '🏢 Daftar HR'}
                            </h3>
                            <span style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.06)', padding: '2px 10px', borderRadius: 999 }}>
                                {list.length} terdaftar
                            </span>
                        </div>

                        {listLoading && list.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: 'var(--space-xl)' }}>
                                <span className="spinner" style={{ width: 24, height: 24 }}></span>
                            </div>
                        ) : list.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: 'var(--space-xl)', color: 'var(--text-muted)' }}>
                                <p style={{ fontSize: '2rem', marginBottom: 8 }}>{activeTab === 'schools' ? '🏫' : '🏢'}</p>
                                <p style={{ fontSize: 'var(--font-sm)' }}>Belum ada yang terdaftar.</p>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {list.map((item) => (
                                    <div key={item.email} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 'var(--radius-md)', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontWeight: 500, fontSize: 'var(--font-sm)', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {item.email}
                                            </div>
                                            {(item.schoolName || item.companyName) && (
                                                <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginTop: 2 }}>
                                                    {item.schoolName || item.companyName}
                                                </div>
                                            )}
                                            <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginTop: 2 }}>
                                                {item.addedAt ? new Date(item.addedAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'}
                                            </div>
                                        </div>
                                        <button type="button" className="btn btn-secondary"
                                            style={{ fontSize: 'var(--font-xs)', padding: '4px 10px', flexShrink: 0, color: '#f87171', borderColor: 'rgba(248,113,113,0.3)' }}
                                            onClick={() => handleRemove(item.email)}>
                                            🗑️ Hapus
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ══ Tab: Kementerian ══ */}
            {activeTab === 'ministry' && (
                <div style={{ maxWidth: 560 }}>
                    <div className="glass-card-static">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 'var(--space-lg)' }}>
                            <span style={{ fontSize: '1.5rem' }}>🏛️</span>
                            <div>
                                <h3 style={{ fontSize: 'var(--font-md)', margin: 0 }}>Wallet Kementerian Pendidikan</h3>
                                <p style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)', margin: 0, marginTop: 2 }}>
                                    Wallet ini yang berhak menyetujui atau menolak ijazah dari halaman Kementerian.
                                </p>
                            </div>
                        </div>

                        {/* Current wallet display */}
                        <div style={{ marginBottom: 'var(--space-xl)', padding: 'var(--space-md)', borderRadius: 'var(--radius-md)', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}>
                            <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
                                Wallet Aktif Saat Ini
                            </div>
                            {ministryWallet ? (
                                <div style={{ fontFamily: 'monospace', fontSize: 'var(--font-sm)', color: '#34d399', display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#34d399', flexShrink: 0 }}></span>
                                    {ministryWallet}
                                </div>
                            ) : (
                                <div style={{ fontSize: 'var(--font-sm)', color: '#fbbf24', display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#fbbf24', flexShrink: 0 }}></span>
                                    Belum diatur (menggunakan env var default)
                                </div>
                            )}
                        </div>

                        {/* Set form */}
                        <form onSubmit={handleSetMinistry} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label className="form-label">Wallet Address Baru *</label>
                                <input type="text" className="form-input mono"
                                    placeholder="0x..."
                                    value={ministryInput}
                                    onChange={e => { setMinistryInput(e.target.value); setMinistryError(''); setMinistrySuccess(''); }}
                                    disabled={ministryLoading} />
                                <small style={{ color: 'var(--text-muted)', fontSize: 'var(--font-xs)' }}>
                                    Wallet ini tidak perlu melakukan registrasi — langsung bisa akses halaman Kementerian.
                                </small>
                            </div>

                            {ministryError && (
                                <div className="alert alert-error" style={{ margin: 0 }}>
                                    <span className="alert-icon">⚠️</span>
                                    <div style={{ fontSize: 'var(--font-sm)' }}>{ministryError}</div>
                                </div>
                            )}
                            {ministrySuccess && (
                                <div style={{ background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: 'var(--radius-md)', padding: 'var(--space-sm) var(--space-md)', fontSize: 'var(--font-sm)', color: 'var(--success)' }}>
                                    ✓ {ministrySuccess}
                                </div>
                            )}

                            <button type="submit" className="btn btn-primary" disabled={ministryLoading || !ministryInput.trim()}>
                                {ministryLoading ? <><span className="spinner"></span> Menyimpan...</> : '💾 Simpan Wallet Kementerian'}
                            </button>
                        </form>
                    </div>

                    <div style={{ marginTop: 'var(--space-md)', padding: 'var(--space-md)', borderRadius: 'var(--radius-md)', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                        ℹ️ <strong style={{ color: 'var(--text-secondary)' }}>Cara kerja:</strong> Wallet yang didaftarkan di sini langsung dapat mengakses halaman <strong>/ministry</strong> tanpa perlu registrasi terlebih dahulu. Perubahan berlaku segera tanpa perlu deploy ulang.
                    </div>
                </div>
            )}
        </div>
    );
}

export default AdminDashboard;
