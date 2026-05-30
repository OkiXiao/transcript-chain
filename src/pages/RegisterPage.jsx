/**
 * RegisterPage.jsx
 *
 * Halaman registrasi dengan tiga tab role: School / Student / HR.
 *
 * Alur per role (3 langkah eksplisit):
 *   Step 1 → Hubungkan MetaMask (WalletButton)
 *   Step 2 → Isi email + validasi ke backend (backend sign)
 *   Step 3 → Kirim transaksi ke blockchain via MetaMask
 */

import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useWeb3 } from '../context/Web3Context';
import { useAuth, ROLE_LABEL, ROLE } from '../context/AuthContext';
import { useRegistration, REG_STEP } from '../hooks/useRegistration';
import WalletButton from '../components/WalletButton';

// ─── Konstanta ────────────────────────────────────────────────

const ROLES = ['School', 'Student', 'HR'];

const ROLE_INFO = {
    School: {
        icon: '🏫',
        title: 'Institusi Pendidikan',
        desc: 'Universitas, sekolah, atau lembaga pendidikan yang ingin menerbitkan ijazah/transkrip di blockchain.',
        emailPlaceholder: 'admin@universitas.ac.id',
        emailHint: 'Gunakan email institusi: @universitas.ac.id, @sekolah.sch.id, @mit.edu',
        color: '#4f46e5',
    },
    Student: {
        icon: '🎓',
        title: 'Mahasiswa / Siswa',
        desc: 'Pemilik ijazah yang ingin mengelola dan membagikan transkrip akademik secara terverifikasi.',
        emailPlaceholder: 'nama@mahasiswa.ac.id',
        emailHint: 'Gunakan email yang sudah terdaftar di database sekolah Anda.',
        color: '#0891b2',
    },
    HR: {
        icon: '💼',
        title: 'HR / Perusahaan',
        desc: 'Tim rekrutmen yang ingin memverifikasi keaslian ijazah kandidat secara on-chain.',
        emailPlaceholder: 'hr@perusahaan.com',
        emailHint: 'Gunakan email domain perusahaan resmi. Webmail publik (Gmail, Yahoo) tidak diterima.',
        color: '#059669',
    },
};

// ─── Sub-component: Step Indicator ───────────────────────────

function StepIndicator({ currentStep, roleColor }) {
    const steps = [
        { label: 'Hubungkan Wallet' },
        { label: 'Verifikasi Email' },
        { label: 'Daftar ke Blockchain' },
    ];

    const activeIdx = currentStep === REG_STEP.IDLE         ? 0
                    : currentStep === REG_STEP.EMAIL_SENT    ? 1
                    : currentStep === REG_STEP.EMAIL_VALID   ? 2
                    : currentStep === REG_STEP.CONFIRMING    ? 2
                    : currentStep === REG_STEP.SUCCESS       ? 3
                    : 0;

    return (
        <div style={{ display: 'flex', gap: 0, marginBottom: 28 }}>
            {steps.map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                        <div style={{
                            width: 30, height: 30, borderRadius: '50%',
                            background: i < activeIdx ? roleColor : i === activeIdx ? roleColor : '#e2e8f0',
                            color: i <= activeIdx ? '#fff' : '#94a3b8',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontWeight: 700, fontSize: 13,
                        }}>
                            {i < activeIdx ? '✓' : i + 1}
                        </div>
                        <span style={{
                            fontSize: 11, marginTop: 4, textAlign: 'center',
                            color: i <= activeIdx ? roleColor : '#94a3b8',
                            fontWeight: i === activeIdx ? 600 : 400,
                        }}>
                            {s.label}
                        </span>
                    </div>
                    {i < steps.length - 1 && (
                        <div style={{
                            height: 2, flex: 1, marginBottom: 20,
                            background: i < activeIdx ? roleColor : '#e2e8f0',
                            transition: 'background .3s',
                        }} />
                    )}
                </div>
            ))}
        </div>
    );
}

// ─── Sub-component: Role Tab ──────────────────────────────────

function RoleTab({ role, selected, onClick, disabled }) {
    const info = ROLE_INFO[role];
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            style={{
                flex: 1, padding: '12px 8px', border: 'none',
                cursor: disabled ? 'default' : 'pointer',
                borderBottom: selected ? `3px solid ${info.color}` : '3px solid transparent',
                background: selected ? `${info.color}12` : 'transparent',
                color: selected ? info.color : '#64748b',
                fontWeight: selected ? 700 : 400,
                fontSize: 13, transition: 'all .15s',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
            }}
        >
            <span style={{ fontSize: 20 }}>{info.icon}</span>
            <span>{role}</span>
        </button>
    );
}

// ─── Sub-component: Status Banner ────────────────────────────

function StatusBanner({ step, status, error, txHash }) {
    if (step === REG_STEP.SUCCESS) {
        return (
            <div style={bannerStyle('#dcfce7', '#166534')}>
                <strong>Registrasi Berhasil!</strong> Wallet Anda telah terdaftar di blockchain.
                {txHash && (
                    <div style={{ marginTop: 6, fontSize: 12 }}>
                        Tx:{' '}
                        <a
                            href={`https://sepolia.etherscan.io/tx/${txHash}`}
                            target="_blank" rel="noreferrer"
                            style={{ color: '#166534' }}
                        >
                            {txHash.slice(0, 22)}...
                        </a>
                    </div>
                )}
            </div>
        );
    }
    if (error) {
        return <div style={bannerStyle('#fef2f2', '#991b1b')}><strong>Error:</strong> {error}</div>;
    }
    if (status) {
        return <div style={bannerStyle('#eff6ff', '#1e40af')}>{status}</div>;
    }
    return null;
}

function bannerStyle(bg, color) {
    return {
        background: bg, color, border: `1px solid ${color}33`,
        borderRadius: 8, padding: '12px 16px', marginBottom: 16, fontSize: 14,
    };
}

// ─── Main Component ───────────────────────────────────────────

export default function RegisterPage({ registryContract }) {
    const navigate = useNavigate();
    const { account, isCorrectNetwork } = useWeb3();
    const { isRegistered, roleLabel } = useAuth();

    const {
        step, status, error, txHash, pendingData,
        validateEmail, verifyEmailToken, submitOnChain, reset,
    } = useRegistration(registryContract);

    const [selectedRole, setSelectedRole] = useState('School');
    const [email, setEmail]               = useState('');
    const [schoolWallet, setSchoolWallet] = useState('');
    const [submitting, setSubmitting]     = useState(false);
    const [searchParams] = useSearchParams();

    // Auto-verify token from email link
    useEffect(() => {
        const token = searchParams.get('token');
        if (token && step === REG_STEP.IDLE) {
            verifyEmailToken(token);
        }
    }, []);

    const info = ROLE_INFO[selectedRole];

    // ── Jika sudah terdaftar ──
    if (isRegistered) {
        return (
            <div style={pageStyle}>
                <div style={cardStyle}>
                    <div style={{ textAlign: 'center', padding: '24px 0' }}>
                        <div style={{ fontSize: 56, marginBottom: 12 }}>✅</div>
                        <h2 style={{ color: '#1e293b', marginBottom: 8 }}>
                            Anda sudah terdaftar sebagai <em>{roleLabel}</em>
                        </h2>
                        <p style={{ color: '#64748b', marginBottom: 24, fontSize: 14 }}>
                            Wallet <code style={codeStyle}>{account}</code> sudah memiliki role di blockchain.
                        </p>
                        <button style={primaryBtn('#4f46e5')} onClick={() => navigate('/')}>
                            Ke Dashboard
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ── Derived state ──
    const walletConnected = !!account && isCorrectNetwork;
    const emailSent       = step === REG_STEP.EMAIL_SENT;
    const emailStepDone   = step === REG_STEP.EMAIL_VALID;
    const isSuccess       = step === REG_STEP.SUCCESS;
    const isConfirming    = step === REG_STEP.CONFIRMING;

    // ── Handler: ganti role ──
    function handleRoleChange(role) {
        if (emailSent || emailStepDone || isSuccess) return;
        setSelectedRole(role);
        setEmail('');
        setSchoolWallet('');
        reset();
    }

    // ── Handler: validasi email (Step 2) ──
    async function handleValidateEmail(e) {
        e.preventDefault();
        if (!walletConnected) return;
        setSubmitting(true);
        await validateEmail({
            role: selectedRole,
            email,
            walletAddress: account,
            schoolWallet,
        });
        setSubmitting(false);
    }

    // ── Handler: submit ke chain (Step 3) ──
    async function handleSubmitOnChain() {
        setSubmitting(true);
        await submitOnChain();
        setSubmitting(false);
    }

    return (
        <div style={pageStyle}>
            <div style={cardStyle}>

                {/* Header */}
                <div style={{ marginBottom: 24 }}>
                    <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', margin: 0 }}>
                        Daftar ke TranscriptChain
                    </h1>
                    <p style={{ color: '#64748b', margin: '6px 0 0', fontSize: 13 }}>
                        Autentikasi hybrid: Email (divalidasi backend) + MetaMask Wallet (on-chain)
                    </p>
                </div>

                {/* Step Indicator */}
                <StepIndicator currentStep={step} roleColor={info.color} />

                {/* ─── STEP 1: Hubungkan MetaMask ─── */}
                <div style={{
                    border: `1px solid ${walletConnected ? '#86efac' : '#e2e8f0'}`,
                    borderRadius: 10, padding: 16, marginBottom: 20,
                    background: walletConnected ? '#f0fdf4' : '#f8fafc',
                }}>
                    <div style={{
                        display: 'flex', justifyContent: 'space-between',
                        alignItems: 'center', flexWrap: 'wrap', gap: 12,
                    }}>
                        <div>
                            <div style={{
                                fontWeight: 600, fontSize: 14,
                                color: walletConnected ? '#166534' : '#374151',
                            }}>
                                {walletConnected ? '🦊 Wallet Terhubung' : 'Langkah 1 — Hubungkan MetaMask'}
                            </div>
                            {walletConnected ? (
                                <code style={{ ...codeStyle, fontSize: 12, display: 'block', marginTop: 4 }}>
                                    {account.slice(0, 10)}...{account.slice(-8)}
                                </code>
                            ) : (
                                <p style={{ fontSize: 12, color: '#64748b', margin: '4px 0 0' }}>
                                    Wallet address Anda akan di-bind ke role yang dipilih.
                                </p>
                            )}
                        </div>
                        {/* Pakai WalletButton yang sudah ada */}
                        <WalletButton />
                    </div>
                    {account && !isCorrectNetwork && (
                        <div style={{ marginTop: 10, fontSize: 12, color: '#b45309', background: '#fffbeb', padding: '8px 12px', borderRadius: 6 }}>
                            ⚠️ Jaringan salah. Klik <strong>Connect Wallet</strong> lagi untuk pindah ke Sepolia Testnet.
                        </div>
                    )}
                </div>

                {/* Role Tabs — hanya aktif di step 1 */}
                <div style={{
                    display: 'flex',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px 8px 0 0',
                    overflow: 'hidden',
                    opacity: walletConnected ? 1 : 0.5,
                }}>
                    {ROLES.map(r => (
                        <RoleTab
                            key={r} role={r}
                            selected={selectedRole === r}
                            onClick={() => handleRoleChange(r)}
                            disabled={!walletConnected || emailStepDone || isSuccess}
                        />
                    ))}
                </div>

                {/* Role Info */}
                <div style={{
                    background: `${info.color}0d`,
                    border: `1px solid ${info.color}33`,
                    borderTop: 'none',
                    borderRadius: '0 0 8px 8px',
                    padding: '12px 16px', marginBottom: 20,
                }}>
                    <div style={{ fontWeight: 600, color: info.color, marginBottom: 4, fontSize: 14 }}>
                        {info.icon} {info.title}
                    </div>
                    <p style={{ fontSize: 12, color: '#475569', margin: 0 }}>{info.desc}</p>
                </div>

                {/* Status Banner */}
                <StatusBanner step={step} status={status} error={error} txHash={txHash} />

                {/* ─── EMAIL SENT: Tunggu verifikasi ─── */}
                {emailSent && (
                    <div style={{ textAlign: 'center', padding: '8px 0 16px' }}>
                        <div style={{ fontSize: 52, marginBottom: 12 }}>✉️</div>
                        <h3 style={{ color: '#1e293b', marginBottom: 8 }}>Cek Email Anda</h3>
                        <p style={{ color: '#475569', fontSize: 14, marginBottom: 8 }}>
                            Link verifikasi dikirim ke:
                        </p>
                        <p style={{ color: '#4f46e5', fontWeight: 700, fontSize: 15, marginBottom: 16 }}>
                            {pendingData?.email || email}
                        </p>
                        <p style={{ color: '#64748b', fontSize: 13, marginBottom: 24 }}>
                            Klik link di email untuk melanjutkan pendaftaran.<br />
                            Link berlaku <strong>15 menit</strong>. Cek folder <em>Spam</em> jika tidak muncul.
                        </p>
                        <button onClick={reset} style={secondaryBtn()}>
                            ← Masukkan email lain
                        </button>
                    </div>
                )}

                {/* ─── STEP 2: Form email (hanya aktif setelah wallet connect) ─── */}
                {!emailSent && !emailStepDone && !isSuccess && (
                    <form onSubmit={handleValidateEmail}>
                        <fieldset
                            disabled={!walletConnected || submitting}
                            style={{ border: 'none', padding: 0, margin: 0 }}
                        >
                            <label style={labelStyle}>
                                {selectedRole === 'School' ? 'Email Institusi' :
                                 selectedRole === 'HR'     ? 'Email Perusahaan' :
                                                             'Email Mahasiswa'}
                            </label>
                            <input
                                type="email"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                placeholder={info.emailPlaceholder}
                                required
                                style={{
                                    ...inputStyle,
                                    opacity: walletConnected ? 1 : 0.5,
                                    cursor: walletConnected ? 'text' : 'not-allowed',
                                }}
                            />
                            <p style={{ fontSize: 11, color: '#94a3b8', margin: '4px 0 14px' }}>
                                {info.emailHint}
                            </p>

                            {/* Field tambahan untuk Student: schoolWallet */}
                            {selectedRole === 'Student' && (
                                <>
                                    <label style={labelStyle}>Wallet Address Sekolah Anda</label>
                                    <input
                                        type="text"
                                        value={schoolWallet}
                                        onChange={e => setSchoolWallet(e.target.value)}
                                        placeholder="0x... (wallet sekolah yang mendaftarkan email Anda)"
                                        required
                                        style={{
                                            ...inputStyle,
                                            opacity: walletConnected ? 1 : 0.5,
                                        }}
                                    />
                                    <p style={{ fontSize: 11, color: '#94a3b8', margin: '4px 0 14px' }}>
                                        Dapatkan alamat ini dari administrator sekolah Anda.
                                    </p>
                                </>
                            )}

                            <button
                                type="submit"
                                disabled={!walletConnected || !email || submitting}
                                style={primaryBtn(info.color, !walletConnected || !email || submitting)}
                            >
                                {submitting ? 'Memvalidasi email...' :
                                 !walletConnected ? 'Hubungkan MetaMask dulu (lihat di atas)' :
                                 'Langkah 2 — Validasi Email'}
                            </button>
                        </fieldset>
                    </form>
                )}

                {/* ─── STEP 3: Konfirmasi on-chain via MetaMask ─── */}
                {emailStepDone && !isSuccess && (
                    <div>
                        <div style={{
                            background: '#f8fafc', border: '1px solid #e2e8f0',
                            borderRadius: 8, padding: 16, marginBottom: 16,
                        }}>
                            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10, fontWeight: 600 }}>
                                Ringkasan Registrasi
                            </div>
                            <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                                <tbody>
                                    <tr>
                                        <td style={tdLabel}>Role</td>
                                        <td><strong>{info.icon} {selectedRole}</strong></td>
                                    </tr>
                                    <tr>
                                        <td style={tdLabel}>Email</td>
                                        <td><code style={codeStyle}>{pendingData?.email}</code></td>
                                    </tr>
                                    <tr>
                                        <td style={tdLabel}>Wallet</td>
                                        <td>
                                            <code style={codeStyle}>
                                                {account?.slice(0, 10)}...{account?.slice(-8)}
                                            </code>
                                        </td>
                                    </tr>
                                    {selectedRole === 'Student' && pendingData?.schoolWallet && (
                                        <tr>
                                            <td style={tdLabel}>Sekolah</td>
                                            <td>
                                                <code style={codeStyle}>
                                                    {pendingData.schoolWallet.slice(0, 10)}...
                                                </code>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        <p style={{ fontSize: 12, color: '#64748b', marginBottom: 16 }}>
                            MetaMask 🦊 akan muncul meminta konfirmasi transaksi.
                            Pastikan Anda memiliki cukup <strong>Sepolia ETH</strong> untuk gas fee.
                        </p>

                        <div style={{ display: 'flex', gap: 10 }}>
                            <button
                                onClick={reset}
                                disabled={isConfirming}
                                style={secondaryBtn(isConfirming)}
                            >
                                ← Kembali
                            </button>
                            <button
                                onClick={handleSubmitOnChain}
                                disabled={isConfirming || submitting}
                                style={{ ...primaryBtn(info.color, isConfirming || submitting), flex: 1 }}
                            >
                                {isConfirming
                                    ? '⏳ Menunggu konfirmasi MetaMask...'
                                    : `🦊 Langkah 3 — Daftarkan ke Blockchain`}
                            </button>
                        </div>
                    </div>
                )}

                {/* ─── SUCCESS ─── */}
                {isSuccess && (
                    <div style={{ textAlign: 'center', padding: '16px 0' }}>
                        <div style={{ fontSize: 52, marginBottom: 10 }}>{info.icon}</div>
                        <h3 style={{ color: '#166534', marginBottom: 8 }}>
                            Selamat datang di TranscriptChain!
                        </h3>
                        <p style={{ color: '#475569', marginBottom: 24, fontSize: 14 }}>
                            Anda kini terdaftar sebagai <strong>{selectedRole}</strong>.
                            Role tersimpan permanen di blockchain.
                        </p>
                        <button style={primaryBtn('#4f46e5')} onClick={() => navigate('/')}>
                            Ke Dashboard →
                        </button>
                    </div>
                )}

            </div>
        </div>
    );
}

// ─── Styles ──────────────────────────────────────────────────

const pageStyle = {
    minHeight: '100vh', display: 'flex', alignItems: 'center',
    justifyContent: 'center', padding: '32px 16px',
    background: 'linear-gradient(135deg, #f0f4ff 0%, #fafafa 100%)',
};

const cardStyle = {
    background: '#ffffff', borderRadius: 16,
    boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
    padding: '36px 40px', width: '100%', maxWidth: 540,
};

const inputStyle = {
    width: '100%', padding: '10px 14px', fontSize: 14,
    border: '1px solid #cbd5e1', borderRadius: 8,
    outline: 'none', boxSizing: 'border-box',
    fontFamily: 'inherit', marginTop: 4,
};

const labelStyle = {
    display: 'block', fontSize: 13, fontWeight: 600,
    color: '#374151', marginBottom: 0,
};

const codeStyle = {
    background: '#f1f5f9', padding: '2px 6px',
    borderRadius: 4, fontSize: 12, fontFamily: 'monospace',
};

const tdLabel = {
    color: '#94a3b8', paddingRight: 14, paddingBottom: 6,
    fontSize: 12, whiteSpace: 'nowrap',
};

function primaryBtn(color, disabled = false) {
    return {
        display: 'block', width: '100%', padding: '12px',
        background: disabled ? '#cbd5e1' : color,
        color: '#fff', border: 'none', borderRadius: 8,
        fontSize: 14, fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background .15s',
    };
}

function secondaryBtn(disabled = false) {
    return {
        padding: '12px 18px', background: '#f1f5f9',
        color: disabled ? '#94a3b8' : '#374151',
        border: '1px solid #e2e8f0', borderRadius: 8,
        fontSize: 13, cursor: disabled ? 'not-allowed' : 'pointer',
    };
}
