import { Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
import LandingPage from './pages/LandingPage'
import SchoolDashboard from './pages/SchoolDashboard'
import VerifyPage from './pages/VerifyPage'
import OwnerApprovalPage from './pages/OwnerApprovalPage'
import MinistryDashboard from './pages/MinistryDashboard'
import AdminDashboard from './pages/AdminDashboard'
import RegisterPage from './pages/RegisterPage'
import { AuthProvider } from './context/AuthContext'
import { useWeb3 } from './context/Web3Context'

function AppRoutes() {
    const { registryContract } = useWeb3()

    return (
        <AuthProvider registryContract={registryContract}>
            <Navbar />
            <main className="page">
                <Routes>
                    <Route path="/" element={<LandingPage />} />
                    <Route path="/register" element={<RegisterPage registryContract={registryContract} />} />
                    <Route path="/dashboard" element={<SchoolDashboard />} />
                    <Route path="/verify" element={<VerifyPage />} />
                    <Route path="/owner" element={<OwnerApprovalPage />} />
                    <Route path="/ministry" element={<MinistryDashboard />} />
                    <Route path="/admin" element={<AdminDashboard />} />
                </Routes>
            </main>
            <footer className="footer">
                <div className="container">
                    <p>© 2026 TranscriptChain — Powered by Ethereum & IPFS. Built with custom ERC-721 & ECDSA.</p>
                </div>
            </footer>
        </AuthProvider>
    )
}

function App() {
    return <AppRoutes />
}

export default App
