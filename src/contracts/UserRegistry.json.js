// UserRegistry contract info
// PENTING: Ganti `address` dengan alamat hasil deploy setelah menjalankan:
//   npx hardhat run scripts/deployRegistry.js --network sepolia
//
// Untuk mendapatkan alamat trustedSigner sebelum deploy, jalankan server lalu:
//   GET http://localhost:3001/api/auth/signer-address

const registryInfo = {
    address: '0x263e45ef0Aa91768505D0AE6cbCfa7C7E0Fa357d',
    network: 'sepolia',
    chainId: 11155111,
    abi: [
        // ─── Enums (tidak ada ABI entry, diperlakukan sebagai uint8) ───
        // Role: 0=None, 1=School, 2=Student, 3=HR

        // ─── State Variables (view functions) ───
        'function trustedSigner() view returns (address)',
        'function contractAdmin() view returns (address)',
        'function nonces(address wallet) view returns (uint256)',
        'function emailHashToWallet(bytes32 emailHash) view returns (address)',

        // ─── Profile Query ───
        'function getProfile(address wallet) view returns (tuple(uint8 role, bytes32 emailHash, bool isActive, uint256 registeredAt, address verifiedBySchool))',
        'function getRole(address wallet) view returns (uint8)',
        'function isSchool(address wallet) view returns (bool)',
        'function isStudent(address wallet) view returns (bool)',
        'function isHR(address wallet) view returns (bool)',
        'function isRegistered(address wallet) view returns (bool)',
        'function getCurrentNonce(address wallet) view returns (uint256)',

        // ─── Registration Hash Getters (untuk debugging) ───
        'function getSchoolRegistrationHash(address wallet, bytes32 emailHash) view returns (bytes32)',
        'function getStudentRegistrationHash(address wallet, bytes32 emailHash, address schoolWallet) view returns (bytes32)',
        'function getHRRegistrationHash(address wallet, bytes32 emailHash) view returns (bytes32)',

        // ─── Registration (requires backend signature) ───
        'function registerSchool(bytes32 emailHash, bytes backendSig)',
        'function registerStudent(bytes32 emailHash, address schoolWallet, bytes backendSig)',
        'function registerHR(bytes32 emailHash, bytes backendSig)',

        // ─── Admin ───
        'function deactivateUser(address wallet)',
        'function reactivateUser(address wallet)',
        'function updateTrustedSigner(address newSigner)',

        // ─── Events ───
        'event SchoolRegistered(address indexed wallet, bytes32 indexed emailHash, uint256 timestamp)',
        'event StudentRegistered(address indexed wallet, bytes32 indexed emailHash, address indexed verifiedBySchool, uint256 timestamp)',
        'event HRRegistered(address indexed wallet, bytes32 indexed emailHash, uint256 timestamp)',
        'event UserDeactivated(address indexed wallet, address indexed byAdmin)',
        'event UserReactivated(address indexed wallet, address indexed byAdmin)',

        // ─── Custom Errors ───
        'error AlreadyRegistered(address wallet)',
        'error EmailAlreadyBound(bytes32 emailHash)',
        'error InvalidBackendSignature()',
        'error SchoolNotRegistered(address schoolWallet)',
        'error Unauthorized(string reason)',
        'error InactiveAccount(address wallet)',
    ],
};

export default registryInfo;
