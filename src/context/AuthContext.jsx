/**
 * AuthContext.jsx
 *
 * React context untuk menyimpan status autentikasi pengguna:
 *   - role on-chain (School / Student / HR / None)
 *   - email yang sudah divalidasi backend
 *   - profile dari UserRegistry contract
 *
 * Cara pakai:
 *   const { role, userEmail, userProfile, refreshRole } = useAuth();
 *
 * Hubungan dengan Web3Context:
 *   - AuthContext membaca `account` dan `contract` (UserRegistry) dari Web3Context
 *   - Setiap kali account berubah, role di-refresh dari chain
 */

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useWeb3 } from './Web3Context';

// Role enum — harus sama dengan urutan di UserRegistry.sol
export const ROLE = {
    NONE:    0,
    SCHOOL:  1,
    STUDENT: 2,
    HR:      3,
};

export const ROLE_LABEL = {
    [ROLE.NONE]:    'Belum Terdaftar',
    [ROLE.SCHOOL]:  'School',
    [ROLE.STUDENT]: 'Student',
    [ROLE.HR]:      'HR',
};

const AuthContext = createContext(null);

export function AuthProvider({ children, registryContract }) {
    const { account } = useWeb3();

    const [role, setRole]               = useState(ROLE.NONE);
    const [userProfile, setUserProfile] = useState(null);
    const [userEmail, setUserEmail]     = useState('');     // email yang user input saat registrasi
    const [loading, setLoading]         = useState(false);
    const [error, setError]             = useState(null);

    /**
     * Ambil role dan profil dari UserRegistry contract di chain.
     * Dipanggil setiap kali account berubah atau setelah registrasi berhasil.
     */
    const refreshRole = useCallback(async () => {
        if (!account || !registryContract) {
            setRole(ROLE.NONE);
            setUserProfile(null);
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const profile = await registryContract.getProfile(account);
            // profile.role dari kontrak adalah BigInt (0–3)
            const roleNum = Number(profile.role);
            setRole(roleNum);
            setUserProfile({
                role:             roleNum,
                emailHash:        profile.emailHash,
                isActive:         profile.isActive,
                registeredAt:     Number(profile.registeredAt),
                verifiedBySchool: profile.verifiedBySchool,
            });
        } catch (err) {
            // Wallet belum terdaftar — anggap role None
            setRole(ROLE.NONE);
            setUserProfile(null);
        } finally {
            setLoading(false);
        }
    }, [account, registryContract]);

    // Re-fetch setiap kali account atau contract berubah
    useEffect(() => {
        refreshRole();
    }, [refreshRole]);

    const isSchool  = role === ROLE.SCHOOL;
    const isStudent = role === ROLE.STUDENT;
    const isHR      = role === ROLE.HR;
    const isRegistered = role !== ROLE.NONE;

    const value = {
        role,
        roleLabel:    ROLE_LABEL[role],
        userProfile,
        userEmail,
        setUserEmail,
        loading,
        error,
        isSchool,
        isStudent,
        isHR,
        isRegistered,
        refreshRole,
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth harus digunakan di dalam AuthProvider');
    return ctx;
}
