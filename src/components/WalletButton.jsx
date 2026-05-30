import { useWeb3 } from '../context/Web3Context';

const SITE_URL = 'transcript-chain-six.vercel.app';

function WalletButton() {
    const { account, loading, connectWallet, disconnectWallet } = useWeb3();
    const hasMetaMask = typeof window !== 'undefined' && !!window.ethereum;

    const formatAddress = (addr) => {
        if (!addr) return '';
        return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
    };

    if (loading) {
        return (
            <button className="btn btn-primary wallet-btn" disabled>
                <span className="spinner"></span>
                Connecting...
            </button>
        );
    }

    if (account) {
        return (
            <button
                className="btn btn-secondary wallet-btn"
                onClick={disconnectWallet}
                title={account}
            >
                <span style={{ fontSize: '14px' }}>🦊</span>
                <span className="wallet-address">{formatAddress(account)}</span>
            </button>
        );
    }

    // MetaMask not installed — show deep link or install link
    if (!hasMetaMask) {
        const currentPath = window.location.pathname;
        const deepLink = `https://metamask.app.link/dapp/${SITE_URL}${currentPath}`;
        const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

        if (isMobile) {
            return (
                <a href={deepLink} className="btn btn-primary wallet-btn">
                    <span style={{ fontSize: '14px' }}>🦊</span>
                    Buka di MetaMask
                </a>
            );
        }

        return (
            <a
                href="https://metamask.io/download/"
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary wallet-btn"
            >
                <span style={{ fontSize: '14px' }}>🦊</span>
                Install MetaMask
            </a>
        );
    }

    return (
        <button className="btn btn-primary wallet-btn" onClick={connectWallet}>
            <span style={{ fontSize: '14px' }}>🦊</span>
            Connect Wallet
        </button>
    );
}

export default WalletButton;
