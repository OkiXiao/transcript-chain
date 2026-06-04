// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title UserRegistry
 * @notice Sistem RBAC (Role-Based Access Control) untuk aplikasi TranscriptChain.
 *
 * Alur Registrasi (Hybrid Auth — Email + MetaMask):
 *   1. User mengisi form di frontend (email + pilih role)
 *   2. Backend memvalidasi email sesuai aturan role:
 *        School  → domain pendidikan (.ac.id, .edu, .sch.id, dll.)
 *        Student → email harus ada di database sekolah terkait
 *        HR      → domain korporat resmi (bukan webmail publik)
 *   3. Backend menandatangani (sign) parameter registrasi dengan private key-nya
 *   4. Frontend meneruskan signature + params ke fungsi register di kontrak ini
 *   5. Kontrak memverifikasi signature menggunakan ecrecover, lalu menyimpan mapping
 *
 * Pemetaan Utama:
 *   walletAddress → UserProfile  (role, emailHash, isActive, registeredAt)
 *   keccak256(email) → address   (mencegah satu email didaftarkan ke banyak wallet)
 *
 * Modifiers:
 *   onlySchool  — hanya wallet bertipe School
 *   onlyStudent — hanya wallet bertipe Student
 *   onlyHR      — hanya wallet bertipe HR
 */

// ============================================================
//                   ECDSA LIBRARY (SCRATCH)
// ============================================================

/**
 * @title ECDSA
 * @notice Verifikasi tanda tangan ECDSA menggunakan ecrecover.
 *
 * Implementasi EIP-191 ("Ethereum Signed Message"):
 *   h_eth = keccak256("\x19Ethereum Signed Message:\n32" || messageHash)
 *   signer = ecrecover(h_eth, v, r, s)
 *
 * Format signature (65 bytes):  r(32) || s(32) || v(1)
 *   r  = koordinat-x dari titik R = k·G pada kurva secp256k1
 *   s  = k⁻¹ · (hash + r · privKey) mod n
 *   v  = recovery id (27 atau 28) — menentukan paritas y dari titik R
 */
library ECDSA {
    bytes constant private PREFIX = "\x19Ethereum Signed Message:\n32";

    /// @notice Buat Ethereum Signed Message Hash (EIP-191)
    function toEthSignedMessageHash(bytes32 messageHash) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(PREFIX, messageHash));
    }

    /// @notice Pisah signature 65 byte menjadi (v, r, s)
    function splitSignature(bytes memory sig) internal pure returns (uint8 v, bytes32 r, bytes32 s) {
        require(sig.length == 65, "ECDSA: panjang signature tidak valid");
        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }
        if (v < 27) v += 27;
        require(v == 27 || v == 28, "ECDSA: nilai v tidak valid");
    }

    /**
     * @notice Pulihkan alamat penandatangan dari hash dan signature.
     * @dev Validasi malleable-signature: s harus <= n/2.
     *      n/2 (secp256k1) = 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0
     */
    function recover(bytes32 ethSignedHash, bytes memory sig) internal pure returns (address signer) {
        (uint8 v, bytes32 r, bytes32 s) = splitSignature(sig);

        require(
            uint256(s) <= 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0,
            "ECDSA: nilai s tidak valid (malleable)"
        );
        require(
            uint256(r) > 0 &&
            uint256(r) < 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141,
            "ECDSA: nilai r tidak valid"
        );

        signer = ecrecover(ethSignedHash, v, r, s);
        require(signer != address(0), "ECDSA: signature tidak valid (zero address)");
    }

    /// @notice Verifikasi bahwa `sig` berasal dari `expectedSigner` untuk `messageHash`.
    function verify(bytes32 messageHash, bytes memory sig, address expectedSigner) internal pure returns (bool) {
        bytes32 ethHash = toEthSignedMessageHash(messageHash);
        return recover(ethHash, sig) == expectedSigner;
    }
}

// ============================================================
//                   USER REGISTRY CONTRACT
// ============================================================

contract UserRegistry {

    // ──────────────────── Role Definitions ────────────────────

    enum Role {
        None,       // belum terdaftar
        School,     // institusi pendidikan
        Student,    // mahasiswa/siswa
        HR          // Human Resources / perusahaan
    }

    // ──────────────────── Data Structures ────────────────────

    struct UserProfile {
        Role    role;
        bytes32 emailHash;       // keccak256(email) — email tidak disimpan plain-text on-chain
        bool    isActive;
        uint256 registeredAt;
        address verifiedBySchool; // khusus Student: alamat sekolah yang memverifikasi mereka
    }

    // ──────────────────── State Variables ────────────────────

    /// @notice Pemetaan wallet → profil pengguna
    mapping(address => UserProfile) public profiles;

    /// @notice Pemetaan email hash → wallet address (cegah duplikasi email)
    mapping(bytes32 => address) public emailHashToWallet;

    /// @notice Nonce per wallet untuk mencegah replay attack pada signature registrasi
    mapping(address => uint256) public nonces;

    /// @notice Alamat backend yang berwenang menandatangani registrasi
    address public trustedSigner;

    /// @notice Admin kontrak (hanya untuk manajemen darurat)
    address public contractAdmin;

    // ──────────────────── Events ────────────────────

    event SchoolRegistered(address indexed wallet, bytes32 indexed emailHash, uint256 timestamp);
    event StudentRegistered(address indexed wallet, bytes32 indexed emailHash, address indexed verifiedBySchool, uint256 timestamp);
    event HRRegistered(address indexed wallet, bytes32 indexed emailHash, uint256 timestamp);
    event UserDeactivated(address indexed wallet, address indexed byAdmin);
    event UserReactivated(address indexed wallet, address indexed byAdmin);
    event TrustedSignerUpdated(address indexed oldSigner, address indexed newSigner);

    // ──────────────────── Custom Errors ────────────────────

    error AlreadyRegistered(address wallet);
    error EmailAlreadyBound(bytes32 emailHash);
    error InvalidBackendSignature();
    error SchoolNotRegistered(address schoolWallet);
    error Unauthorized(string reason);
    error InactiveAccount(address wallet);

    // ──────────────────── Modifiers ────────────────────

    /**
     * @dev Izinkan akses hanya untuk wallet bertipe School yang aktif.
     *      Digunakan pada fungsi upload ijazah / pengelolaan data akademik.
     */
    modifier onlySchool() {
        if (profiles[msg.sender].role != Role.School) revert Unauthorized("Hanya School");
        if (!profiles[msg.sender].isActive) revert InactiveAccount(msg.sender);
        _;
    }

    /**
     * @dev Izinkan akses hanya untuk wallet bertipe Student yang aktif.
     *      Digunakan pada fungsi approve/revoke akses verifikasi.
     */
    modifier onlyStudent() {
        if (profiles[msg.sender].role != Role.Student) revert Unauthorized("Hanya Student");
        if (!profiles[msg.sender].isActive) revert InactiveAccount(msg.sender);
        _;
    }

    /**
     * @dev Izinkan akses hanya untuk wallet bertipe HR yang aktif.
     *      Digunakan pada fungsi verifikasi transkrip (dengan izin student).
     */
    modifier onlyHR() {
        if (profiles[msg.sender].role != Role.HR) revert Unauthorized("Hanya HR");
        if (!profiles[msg.sender].isActive) revert InactiveAccount(msg.sender);
        _;
    }

    modifier onlyAdmin() {
        if (msg.sender != contractAdmin) revert Unauthorized("Hanya Admin");
        _;
    }

    // ──────────────────── Constructor ────────────────────

    /**
     * @param _trustedSigner Alamat public key backend yang menandatangani registrasi.
     *                       Harus bersesuaian dengan REGISTRY_SIGNER_PRIVATE_KEY di .env server.
     */
    constructor(address _trustedSigner) {
        require(_trustedSigner != address(0), "Signer tidak boleh zero address");
        contractAdmin = msg.sender;
        trustedSigner = _trustedSigner;
    }

    // ============================================================
    //               REGISTRATION FUNCTIONS
    // ============================================================

    /**
     * @notice Daftarkan wallet sebagai SCHOOL (Institusi Pendidikan).
     *
     * Prasyarat (divalidasi backend sebelum signature diterbitkan):
     *   - Email harus menggunakan domain pendidikan yang valid
     *     (contoh: ui.ac.id, ugm.ac.id, mit.edu, sch.id, dll.)
     *
     * @param emailHash  keccak256(email) — dihitung di backend, bukan email plain-text
     * @param backendSig Signature dari trustedSigner yang membuktikan email telah divalidasi
     *
     * Pesan yang ditandatangani backend:
     *   keccak256("REGISTER_SCHOOL" || walletAddress || emailHash || nonce || chainId)
     */
    function registerSchool(
        bytes32 emailHash,
        bytes calldata backendSig
    ) external {
        _requireNotRegistered(msg.sender);
        _requireEmailFree(emailHash);

        bytes32 msgHash = keccak256(abi.encodePacked(
            "REGISTER_SCHOOL",
            msg.sender,
            emailHash,
            nonces[msg.sender],
            block.chainid
        ));
        _requireValidBackendSig(msgHash, backendSig);

        _writeProfile(msg.sender, Role.School, emailHash, address(0));

        emit SchoolRegistered(msg.sender, emailHash, block.timestamp);
    }

    /**
     * @notice Daftarkan wallet sebagai STUDENT (Mahasiswa/Siswa).
     *
     * Prasyarat (divalidasi backend sebelum signature diterbitkan):
     *   - Email harus ada dalam database mahasiswa milik `schoolWallet`
     *   - `schoolWallet` harus sudah terdaftar sebagai School di kontrak ini
     *
     * @param emailHash   keccak256(email mahasiswa)
     * @param schoolWallet Alamat wallet sekolah yang memiliki database mahasiswa ini
     * @param backendSig   Signature backend setelah validasi email vs. database sekolah
     *
     * Pesan yang ditandatangani backend:
     *   keccak256("REGISTER_STUDENT" || walletAddress || emailHash || schoolWallet || nonce || chainId)
     */
    function registerStudent(
        bytes32 emailHash,
        address schoolWallet,
        bytes calldata backendSig
    ) external {
        _requireNotRegistered(msg.sender);
        _requireEmailFree(emailHash);

        // Sekolah referensi HARUS sudah terdaftar dan aktif
        if (profiles[schoolWallet].role != Role.School) revert SchoolNotRegistered(schoolWallet);
        if (!profiles[schoolWallet].isActive) revert InactiveAccount(schoolWallet);

        bytes32 msgHash = keccak256(abi.encodePacked(
            "REGISTER_STUDENT",
            msg.sender,
            emailHash,
            schoolWallet,
            nonces[msg.sender],
            block.chainid
        ));
        _requireValidBackendSig(msgHash, backendSig);

        _writeProfile(msg.sender, Role.Student, emailHash, schoolWallet);

        emit StudentRegistered(msg.sender, emailHash, schoolWallet, block.timestamp);
    }

    /**
     * @notice Daftarkan wallet sebagai HR (Human Resources / Perusahaan).
     *
     * Prasyarat (divalidasi backend sebelum signature diterbitkan):
     *   - Email harus menggunakan domain korporat resmi
     *     (bukan webmail publik: gmail, yahoo, hotmail, outlook, dll.)
     *
     * @param emailHash  keccak256(email korporat)
     * @param backendSig Signature backend setelah validasi domain korporat
     *
     * Pesan yang ditandatangani backend:
     *   keccak256("REGISTER_HR" || walletAddress || emailHash || nonce || chainId)
     */
    function registerHR(
        bytes32 emailHash,
        bytes calldata backendSig
    ) external {
        _requireNotRegistered(msg.sender);
        _requireEmailFree(emailHash);

        bytes32 msgHash = keccak256(abi.encodePacked(
            "REGISTER_HR",
            msg.sender,
            emailHash,
            nonces[msg.sender],
            block.chainid
        ));
        _requireValidBackendSig(msgHash, backendSig);

        _writeProfile(msg.sender, Role.HR, emailHash, address(0));

        emit HRRegistered(msg.sender, emailHash, block.timestamp);
    }

    // ============================================================
    //               ROLE-GATED STUBS (contoh penggunaan modifier)
    // ============================================================

    /**
     * @notice Contoh penggunaan modifier onlySchool.
     *         Implementasi nyata ada di TranscriptNFT.sol (mintTranscript).
     *         Kontrak lain dapat memanggil `getRole(msg.sender)` untuk verifikasi role.
     */
    function schoolAction() external onlySchool view returns (string memory) {
        return "School: akses Upload Ijazah diizinkan";
    }

    /// @notice Contoh penggunaan modifier onlyStudent.
    function studentAction() external onlyStudent view returns (string memory) {
        return "Student: akses Verify Transcript & Owner Approval diizinkan";
    }

    /// @notice Contoh penggunaan modifier onlyHR.
    function hrAction() external onlyHR view returns (string memory) {
        return "HR: akses Verify Transcript (dengan izin student) diizinkan";
    }

    // ============================================================
    //               ADMIN FUNCTIONS
    // ============================================================

    function deactivateUser(address wallet) external onlyAdmin {
        profiles[wallet].isActive = false;
        emit UserDeactivated(wallet, msg.sender);
    }

    function reactivateUser(address wallet) external onlyAdmin {
        profiles[wallet].isActive = true;
        emit UserReactivated(wallet, msg.sender);
    }

    function updateTrustedSigner(address newSigner) external onlyAdmin {
        require(newSigner != address(0), "Signer tidak boleh zero address");
        emit TrustedSignerUpdated(trustedSigner, newSigner);
        trustedSigner = newSigner;
    }

    // ============================================================
    //               VIEW / QUERY FUNCTIONS
    // ============================================================

    function getProfile(address wallet) external view returns (UserProfile memory) {
        return profiles[wallet];
    }

    function getRole(address wallet) external view returns (Role) {
        return profiles[wallet].role;
    }

    function isSchool(address wallet) external view returns (bool) {
        return profiles[wallet].role == Role.School && profiles[wallet].isActive;
    }

    function isStudent(address wallet) external view returns (bool) {
        return profiles[wallet].role == Role.Student && profiles[wallet].isActive;
    }

    function isHR(address wallet) external view returns (bool) {
        return profiles[wallet].role == Role.HR && profiles[wallet].isActive;
    }

    function isRegistered(address wallet) external view returns (bool) {
        return profiles[wallet].role != Role.None;
    }

    function getCurrentNonce(address wallet) external view returns (uint256) {
        return nonces[wallet];
    }

    /**
     * @notice Kembalikan hash pesan registrasi yang harus ditandatangani backend.
     *         Frontend dapat menggunakan ini untuk debugging / verifikasi off-chain.
     */
    function getSchoolRegistrationHash(address wallet, bytes32 emailHash) external view returns (bytes32) {
        return keccak256(abi.encodePacked("REGISTER_SCHOOL", wallet, emailHash, nonces[wallet], block.chainid));
    }

    function getStudentRegistrationHash(address wallet, bytes32 emailHash, address schoolWallet) external view returns (bytes32) {
        return keccak256(abi.encodePacked("REGISTER_STUDENT", wallet, emailHash, schoolWallet, nonces[wallet], block.chainid));
    }

    function getHRRegistrationHash(address wallet, bytes32 emailHash) external view returns (bytes32) {
        return keccak256(abi.encodePacked("REGISTER_HR", wallet, emailHash, nonces[wallet], block.chainid));
    }

    // ============================================================
    //               INTERNAL HELPERS
    // ============================================================

    function _requireNotRegistered(address wallet) internal view {
        if (profiles[wallet].role != Role.None) revert AlreadyRegistered(wallet);
    }

    function _requireEmailFree(bytes32 emailHash) internal view {
        if (emailHashToWallet[emailHash] != address(0)) revert EmailAlreadyBound(emailHash);
    }

    function _requireValidBackendSig(bytes32 msgHash, bytes calldata sig) internal view {
        if (!ECDSA.verify(msgHash, sig, trustedSigner)) revert InvalidBackendSignature();
    }

    function _writeProfile(
        address wallet,
        Role role,
        bytes32 emailHash,
        address schoolWallet
    ) internal {
        profiles[wallet] = UserProfile({
            role: role,
            emailHash: emailHash,
            isActive: true,
            registeredAt: block.timestamp,
            verifiedBySchool: schoolWallet
        });
        emailHashToWallet[emailHash] = wallet;
        nonces[wallet]++;
    }
}
