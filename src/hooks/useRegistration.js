import { useState, useCallback, useEffect, useRef } from 'react';
import { useWeb3 } from '../context/Web3Context';
import { useAuth } from '../context/AuthContext';

const API_BASE = import.meta.env.VITE_API_URL !== undefined
    ? import.meta.env.VITE_API_URL
    : (import.meta.env.DEV ? 'http://localhost:3001' : '');

export const REG_STEP = {
    IDLE:         'IDLE',
    EMAIL_SENT:   'EMAIL_SENT',
    EMAIL_VALID:  'EMAIL_VALID',
    WALLET_READY: 'WALLET_READY',
    CONFIRMING:   'CONFIRMING',
    SUCCESS:      'SUCCESS',
    ERROR:        'ERROR',
};

export function useRegistration(registryContract) {
    const { account, connectWallet, chainId } = useWeb3();
    const { refreshRole, setUserEmail } = useAuth();

    const [step, setStep]               = useState(REG_STEP.IDLE);
    const [status, setStatus]           = useState('');
    const [error, setError]             = useState('');
    const [txHash, setTxHash]           = useState('');
    const [pendingData, setPendingData] = useState(null);

    const sessionIdRef = useRef(crypto.randomUUID().replace(/-/g, ''));

    const reset = useCallback(() => {
        setStep(REG_STEP.IDLE);
        setStatus('');
        setError('');
        setTxHash('');
        setPendingData(null);
        sessionIdRef.current = crypto.randomUUID().replace(/-/g, '');
    }, []);

    // Poll backend while waiting for email link click
    useEffect(() => {
        if (step !== REG_STEP.EMAIL_SENT) return;
        const sid = sessionIdRef.current;
        let active = true;

        const poll = async () => {
            try {
                const res = await fetch(`${API_BASE}/api/auth/validate-email`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'check_session', sessionId: sid }),
                });
                const data = await res.json();
                if (!active || !data.verified) return;
                setPendingData({
                    role:          data.role,
                    email:         data.email,
                    emailHash:     data.emailHash,
                    signature:     data.signature,
                    signerAddress: data.signerAddress,
                    walletAddress: account || '',
                });
                setUserEmail(data.email);
                setStatus('Email terverifikasi. Siap mendaftar ke blockchain.');
                setStep(REG_STEP.EMAIL_VALID);
            } catch { /* ignore */ }
        };

        const interval = setInterval(poll, 2500);
        return () => { active = false; clearInterval(interval); };
    }, [step, account, setUserEmail]);

    // Step 1: Validate email with backend and get signature
    const validateEmail = useCallback(async ({ role, email, walletAddress }) => {
        setError('');
        setStatus('Memvalidasi email ke server...');

        let wallet = walletAddress || account;
        if (!wallet) {
            setStatus('Menghubungkan wallet...');
            await connectWallet();
            wallet = account;
            if (!wallet) {
                setError('Wallet harus terhubung sebelum validasi email.');
                setStep(REG_STEP.ERROR);
                return;
            }
        }

        const numericChainId = chainId ? parseInt(chainId, 16) : 11155111;

        try {
            const res = await fetch(`${API_BASE}/api/auth/validate-email`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    role, email, walletAddress: wallet,
                    chainId: numericChainId,
                    sessionId: sessionIdRef.current,
                }),
            });

            const data = await res.json();

            if (!res.ok || !data.success) {
                setError(data.error || 'Validasi email gagal.');
                setStep(REG_STEP.ERROR);
                return;
            }

            if (data.status === 'email_sent') {
                setUserEmail(email);
                setStatus(data.message || 'Link verifikasi dikirim. Cek email Anda.');
                setStep(REG_STEP.EMAIL_SENT);
                return;
            }

            // Dev mode: no email sent, proceed directly
            setPendingData({
                role,
                email,
                emailHash:     data.emailHash,
                signature:     data.signature,
                walletAddress: wallet,
            });
            setUserEmail(email);
            setStatus('Email valid. Siap mendaftar ke blockchain.');
            setStep(REG_STEP.EMAIL_VALID);

        } catch (err) {
            setError(`Gagal menghubungi server: ${err.message}`);
            setStep(REG_STEP.ERROR);
        }
    }, [account, chainId, connectWallet, setUserEmail]);

    // Step 2: Send transaction to chain
    const submitOnChain = useCallback(async () => {
        if (!pendingData) {
            setError('Tidak ada data pending. Jalankan validateEmail terlebih dahulu.');
            return;
        }
        if (!registryContract) {
            setError('Contract UserRegistry belum terhubung.');
            setStep(REG_STEP.ERROR);
            return;
        }

        const { role, emailHash, signature } = pendingData;

        setStep(REG_STEP.CONFIRMING);
        setStatus('Menunggu konfirmasi transaksi di MetaMask...');
        setError('');

        try {
            let tx;
            if (role === 'School') {
                tx = await registryContract.registerSchool(emailHash, signature);
            } else if (role === 'HR') {
                tx = await registryContract.registerHR(emailHash, signature);
            } else {
                throw new Error(`Role tidak dikenal: ${role}`);
            }

            setStatus('Transaksi terkirim. Menunggu konfirmasi block...');
            setTxHash(tx.hash);

            const receipt = await tx.wait();

            if (receipt.status === 1) {
                setStatus('Registrasi berhasil!');
                setStep(REG_STEP.SUCCESS);
                await refreshRole();
                const confirmBody = JSON.stringify({
                    action: 'confirm',
                    email:         pendingData.email,
                    walletAddress: pendingData.walletAddress,
                    role,
                });
                const doConfirm = () => fetch(`${API_BASE}/api/auth/validate-email`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: confirmBody,
                });
                doConfirm().catch(() => setTimeout(() => doConfirm().catch(() => {}), 5000));
            } else {
                throw new Error('Transaksi gagal (status 0).');
            }

        } catch (err) {
            if (err.code === 4001 || err.code === 'ACTION_REJECTED') {
                setError('Transaksi ditolak oleh pengguna.');
                setStep(REG_STEP.EMAIL_VALID);
            } else {
                const contractError = err.reason || err.data?.message || err.message || 'Transaksi gagal.';
                setError(contractError);
                setStep(REG_STEP.ERROR);
            }
        }
    }, [pendingData, registryContract, refreshRole]);

    const verifyEmailToken = useCallback(async (token) => {
        setError('');
        setStatus('Memverifikasi link...');
        try {
            const res = await fetch(`${API_BASE}/api/auth/validate-email`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'verify_token', token }),
            });
            const data = await res.json();
            if (!res.ok || !data.success) {
                setError(data.error || 'Token tidak valid.');
                setStep(REG_STEP.ERROR);
                return;
            }
            setPendingData({
                role:          data.role,
                email:         data.email,
                emailHash:     data.emailHash,
                signature:     data.signature,
                walletAddress: account || '',
            });
            setUserEmail(data.email);
            setStatus('Email terverifikasi. Siap mendaftar ke blockchain.');
            setStep(REG_STEP.EMAIL_VALID);
        } catch (err) {
            setError(`Gagal memverifikasi: ${err.message}`);
            setStep(REG_STEP.ERROR);
        }
    }, [account, setUserEmail]);

    return {
        step, status, error, txHash, pendingData,
        validateEmail, verifyEmailToken, submitOnChain, reset,
    };
}
