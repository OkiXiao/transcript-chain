import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useWeb3 } from './Web3Context';

// Role enum — harus sama dengan urutan di UserRegistry.sol
// None=0, School=1, HR=2
export const ROLE = {
    NONE:   0,
    SCHOOL: 1,
    HR:     2,
};

export const ROLE_LABEL = {
    [ROLE.NONE]:   'Belum Terdaftar',
    [ROLE.SCHOOL]: 'School',
    [ROLE.HR]:     'HR',
};

const AuthContext = createContext(null);

export function AuthProvider({ children, registryContract }) {
    const { account } = useWeb3();

    const [role, setRole]               = useState(ROLE.NONE);
    const [userProfile, setUserProfile] = useState(null);
    const [userEmail, setUserEmail]     = useState('');
    const [loading, setLoading]         = useState(false);
    const [error, setError]             = useState(null);

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
            const roleNum = profile.isActive ? Number(profile.role) : ROLE.NONE;
            setRole(roleNum);
            setUserProfile({
                role:         roleNum,
                emailHash:    profile.emailHash,
                isActive:     profile.isActive,
                registeredAt: Number(profile.registeredAt),
            });
        } catch {
            setRole(ROLE.NONE);
            setUserProfile(null);
        } finally {
            setLoading(false);
        }
    }, [account, registryContract]);

    useEffect(() => {
        refreshRole();
    }, [refreshRole]);

    const isSchool     = role === ROLE.SCHOOL;
    const isHR         = role === ROLE.HR;
    const isRegistered = role !== ROLE.NONE;

    const value = {
        role,
        roleLabel: ROLE_LABEL[role],
        userProfile,
        userEmail,
        setUserEmail,
        loading,
        error,
        isSchool,
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
