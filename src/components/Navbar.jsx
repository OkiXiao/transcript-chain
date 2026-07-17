import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import WalletButton from './WalletButton';
import { useWeb3 } from '../context/Web3Context';
import { useAuth } from '../context/AuthContext';

function Navbar() {
    const location = useLocation();
    const { isCorrectNetwork, account } = useWeb3();
    const { role } = useAuth();
    const [menuOpen, setMenuOpen] = useState(false);

    const closeMenu = () => setMenuOpen(false);

    return (
        <nav className="navbar">
            <div className="navbar-inner">
                <Link to="/" className="navbar-logo" onClick={closeMenu}>
                    <span className="logo-icon">⛓</span>
                    TranscriptChain
                </Link>

                {/* Hamburger button for mobile */}
                <button
                    className={`hamburger ${menuOpen ? 'open' : ''}`}
                    onClick={() => setMenuOpen(!menuOpen)}
                    aria-label="Toggle menu"
                >
                    <span></span>
                    <span></span>
                    <span></span>
                </button>

                <ul className={`navbar-links ${menuOpen ? 'show' : ''}`}>
                    <li>
                        <Link to="/" className={location.pathname === '/' ? 'active' : ''} onClick={closeMenu}>
                            Home
                        </Link>
                    </li>
                    <li>
                        <Link to="/dashboard" className={location.pathname === '/dashboard' ? 'active' : ''} onClick={closeMenu}>
                            School Dashboard
                        </Link>
                    </li>
                    <li>
                        <Link to="/verify" className={location.pathname === '/verify' ? 'active' : ''} onClick={closeMenu}>
                            Verify Transcript
                        </Link>
                    </li>
                    <li>
                        <Link to="/admin" className={location.pathname === '/admin' ? 'active' : ''} onClick={closeMenu}>
                            Admin
                        </Link>
                    </li>
                    <li>
                        <Link to="/register" className={location.pathname === '/register' ? 'active' : ''} onClick={closeMenu}>
                            Register
                        </Link>
                    </li>
                    {/* Wallet button inside mobile menu */}
                    <li className="mobile-wallet-item">
                        {account && isCorrectNetwork && (
                            <div className="network-badge" style={{ marginBottom: 'var(--space-sm)' }}>
                                <span className="network-dot"></span>
                                Sepolia Testnet
                            </div>
                        )}
                        <WalletButton />
                    </li>
                </ul>

                <div className="navbar-right">
                    {account && isCorrectNetwork && (
                        <div className="network-badge">
                            <span className="network-dot"></span>
                            Sepolia Testnet
                        </div>
                    )}
                    <WalletButton />
                </div>
            </div>

            {/* Mobile overlay */}
            {menuOpen && <div className="mobile-overlay" onClick={closeMenu}></div>}
        </nav>
    );
}

export default Navbar;
