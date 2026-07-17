// UserRegistry contract — deployed 2026-07-17 (v7 - 3-role refactor)
// Address: 0xcD7C661a227E8311fEc6d4f87e728dEAb1fE27Cf
// Roles: 0=None, 1=School, 2=HR

const registryInfo = {
    address: '0xcD7C661a227E8311fEc6d4f87e728dEAb1fE27Cf',
    network: 'sepolia',
    chainId: 11155111,
    abi: [
        // ─── State Variables ───
        'function trustedSigner() view returns (address)',
        'function contractAdmin() view returns (address)',
        'function nonces(address wallet) view returns (uint256)',
        'function emailHashToWallet(bytes32 emailHash) view returns (address)',

        // ─── Profile Query ───
        'function getProfile(address wallet) view returns (tuple(uint8 role, bytes32 emailHash, bool isActive, uint256 registeredAt))',
        'function getRole(address wallet) view returns (uint8)',
        'function isSchool(address wallet) view returns (bool)',
        'function isHR(address wallet) view returns (bool)',
        'function isRegistered(address wallet) view returns (bool)',
        'function getCurrentNonce(address wallet) view returns (uint256)',

        // ─── Registration Hash Getters ───
        'function getSchoolRegistrationHash(address wallet, bytes32 emailHash) view returns (bytes32)',
        'function getHRRegistrationHash(address wallet, bytes32 emailHash) view returns (bytes32)',

        // ─── Registration ───
        'function registerSchool(bytes32 emailHash, bytes backendSig)',
        'function registerHR(bytes32 emailHash, bytes backendSig)',

        // ─── Admin ───
        'function deactivateUser(address wallet)',
        'function reactivateUser(address wallet)',
        'function purgeUser(address wallet)',
        'function updateTrustedSigner(address newSigner)',

        // ─── Events ───
        'event SchoolRegistered(address indexed wallet, bytes32 indexed emailHash, uint256 timestamp)',
        'event HRRegistered(address indexed wallet, bytes32 indexed emailHash, uint256 timestamp)',
        'event UserDeactivated(address indexed wallet, address indexed byAdmin)',
        'event UserReactivated(address indexed wallet, address indexed byAdmin)',
        'event UserPurged(address indexed wallet, address indexed byAdmin)',

        // ─── Custom Errors ───
        'error AlreadyRegistered(address wallet)',
        'error EmailAlreadyBound(bytes32 emailHash)',
        'error InvalidBackendSignature()',
        'error Unauthorized(string reason)',
        'error InactiveAccount(address wallet)',
    ],
};

export default registryInfo;
