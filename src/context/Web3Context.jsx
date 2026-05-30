import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import contractInfo from '../contracts/TranscriptNFT.json.js';
import registryInfo from '../contracts/UserRegistry.json.js';

const Web3Context = createContext(null);

const SEPOLIA_CHAIN_ID = '0xaa36a7'; // 11155111 in hex
const SEPOLIA_CHAIN_CONFIG = {
    chainId: SEPOLIA_CHAIN_ID,
    chainName: 'Sepolia Testnet',
    nativeCurrency: { name: 'SepoliaETH', symbol: 'ETH', decimals: 18 },
    rpcUrls: ['https://rpc.sepolia.org'],
    blockExplorerUrls: ['https://sepolia.etherscan.io'],
};

export function Web3Provider({ children }) {
    const [account, setAccount] = useState(null);
    const [provider, setProvider] = useState(null);
    const [signer, setSigner] = useState(null);
    const [contract, setContract] = useState(null);
    const [isSchool, setIsSchool] = useState(false);
    const [isAdmin, setIsAdmin] = useState(false);
    const [chainId, setChainId] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // UserRegistry contract (RBAC)
    const [registryContract, setRegistryContract] = useState(null);

    const isCorrectNetwork = chainId === SEPOLIA_CHAIN_ID;

    // Initialize contracts with signer or provider
    const initContract = useCallback((signerOrProvider) => {
        try {
            const c = new ethers.Contract(contractInfo.address, contractInfo.abi, signerOrProvider);
            setContract(c);

            // Inisialisasi UserRegistry jika sudah di-deploy (alamat bukan zero)
            const zeroAddr = '0x0000000000000000000000000000000000000000';
            if (registryInfo.address && registryInfo.address !== zeroAddr) {
                const reg = new ethers.Contract(registryInfo.address, registryInfo.abi, signerOrProvider);
                setRegistryContract(reg);
            }

            return c;
        } catch (err) {
            console.error('Failed to init contract:', err);
            return null;
        }
    }, []);

    // Check if connected wallet is a registered school or admin
    const checkRole = useCallback(async (address, contractInstance) => {
        if (!contractInstance || !address) return;
        try {
            const [schoolStatus, adminAddress] = await Promise.all([
                contractInstance.isSchoolRegistered(address),
                contractInstance.admin(),
            ]);
            setIsSchool(schoolStatus);
            setIsAdmin(adminAddress.toLowerCase() === address.toLowerCase());
        } catch (err) {
            console.error('Role check failed:', err);
            setIsSchool(false);
            setIsAdmin(false);
        }
    }, []);

    // Connect wallet
    const connectWallet = useCallback(async () => {
        if (!window.ethereum) {
            setError('MetaMask tidak ditemukan. Silakan install MetaMask terlebih dahulu.');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
            const currentChainId = await window.ethereum.request({ method: 'eth_chainId' });

            setChainId(currentChainId);

            // Switch to Sepolia if not already
            if (currentChainId !== SEPOLIA_CHAIN_ID) {
                try {
                    await window.ethereum.request({
                        method: 'wallet_switchEthereumChain',
                        params: [{ chainId: SEPOLIA_CHAIN_ID }],
                    });
                } catch (switchError) {
                    if (switchError.code === 4902) {
                        await window.ethereum.request({
                            method: 'wallet_addEthereumChain',
                            params: [SEPOLIA_CHAIN_CONFIG],
                        });
                    } else {
                        throw switchError;
                    }
                }
                setChainId(SEPOLIA_CHAIN_ID);
            }

            const browserProvider = new ethers.BrowserProvider(window.ethereum);
            const walletSigner = await browserProvider.getSigner();

            setAccount(accounts[0]);
            setProvider(browserProvider);
            setSigner(walletSigner);

            const c = initContract(walletSigner);
            if (c) await checkRole(accounts[0], c);
        } catch (err) {
            console.error('Connect failed:', err);
            setError(err.message || 'Gagal connect wallet');
        } finally {
            setLoading(false);
        }
    }, [initContract, checkRole]);

    // Disconnect
    const disconnectWallet = useCallback(() => {
        setAccount(null);
        setProvider(null);
        setSigner(null);
        setContract(null);
        setRegistryContract(null);
        setIsSchool(false);
        setIsAdmin(false);
        setChainId(null);
        setError(null);
    }, []);

    // Listen for account/chain changes
    useEffect(() => {
        if (!window.ethereum) return;

        const handleAccountsChanged = async (accounts) => {
            if (accounts.length === 0) {
                disconnectWallet();
            } else {
                setAccount(accounts[0]);
                const browserProvider = new ethers.BrowserProvider(window.ethereum);
                const walletSigner = await browserProvider.getSigner();
                setSigner(walletSigner);
                const c = initContract(walletSigner);
                if (c) await checkRole(accounts[0], c);
            }
        };

        const handleChainChanged = (newChainId) => {
            setChainId(newChainId);
            window.location.reload();
        };

        window.ethereum.on('accountsChanged', handleAccountsChanged);
        window.ethereum.on('chainChanged', handleChainChanged);

        return () => {
            window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
            window.ethereum.removeListener('chainChanged', handleChainChanged);
        };
    }, [disconnectWallet, initContract, checkRole]);

    // Get a read-only contract (for verification page, no wallet needed)
    const getReadOnlyContract = useCallback(() => {
        // Try multiple RPC endpoints for reliability
        const rpcUrls = [
            'https://ethereum-sepolia-rpc.publicnode.com',
            'https://rpc2.sepolia.org',
            'https://rpc.sepolia.org',
            'https://sepolia.gateway.tenderly.co',
        ];
        for (const url of rpcUrls) {
            try {
                const rpcProvider = new ethers.JsonRpcProvider(url);
                return new ethers.Contract(contractInfo.address, contractInfo.abi, rpcProvider);
            } catch {
                continue;
            }
        }
        return null;
    }, []);

    const value = {
        account,
        provider,
        signer,
        contract,
        registryContract,   // UserRegistry contract untuk RBAC
        isSchool,
        isAdmin,
        chainId,
        isCorrectNetwork,
        loading,
        error,
        connectWallet,
        disconnectWallet,
        getReadOnlyContract,
        setError,
    };

    return <Web3Context.Provider value={value}>{children}</Web3Context.Provider>;
}

export function useWeb3() {
    const context = useContext(Web3Context);
    if (!context) throw new Error('useWeb3 must be used within Web3Provider');
    return context;
}
