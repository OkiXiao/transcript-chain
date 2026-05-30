// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title TranscriptNFT
 * @notice ERC-721 NFT built FROM SCRATCH (tanpa OpenZeppelin) untuk verifikasi transkrip ijazah.
 *         Menggunakan ECDSA signature verification untuk approval verifikasi.
 * 
 * Custom implementation meliputi:
 * - Full ERC-721 standard (EIP-721)
 * - ERC-721 Metadata extension
 * - ERC-165 interface detection
 * - ECDSA signature recovery (ecrecover)
 * - School whitelist management
 * - Transcript metadata & verification flow
 */

// ============================================================
//                    INTERFACE DEFINITIONS
// ============================================================

/// @notice ERC-165: Standard Interface Detection
interface IERC165 {
    function supportsInterface(bytes4 interfaceId) external view returns (bool);
}

/// @notice ERC-721: Non-Fungible Token Standard
interface IERC721 {
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);

    function balanceOf(address owner) external view returns (uint256);
    function ownerOf(uint256 tokenId) external view returns (address);
    function safeTransferFrom(address from, address to, uint256 tokenId, bytes calldata data) external;
    function safeTransferFrom(address from, address to, uint256 tokenId) external;
    function transferFrom(address from, address to, uint256 tokenId) external;
    function approve(address to, uint256 tokenId) external;
    function setApprovalForAll(address operator, bool approved) external;
    function getApproved(uint256 tokenId) external view returns (address);
    function isApprovedForAll(address owner, address operator) external view returns (bool);
}

/// @notice ERC-721 Metadata Extension
interface IERC721Metadata {
    function name() external view returns (string memory);
    function symbol() external view returns (string memory);
    function tokenURI(uint256 tokenId) external view returns (string memory);
}

/// @notice ERC-721 Token Receiver Interface
interface IERC721Receiver {
    function onERC721Received(
        address operator,
        address from,
        uint256 tokenId,
        bytes calldata data
    ) external returns (bytes4);
}

// ============================================================
//                    ECDSA LIBRARY (FROM SCRATCH)
// ============================================================

/**
 * @title ECDSA
 * @notice ECDSA signature verification built from scratch.
 *         Implements signature recovery using ecrecover precompile,
 *         with manual message hash construction following EIP-191.
 *
 * Rumus ECDSA:
 *   1. Hash message: h = keccak256(message)
 *   2. EIP-191 prefix: h' = keccak256("\x19Ethereum Signed Message:\n32" + h)
 *   3. Recovery: Given signature (r, s, v), extract public key → address
 *
 * Signature format (65 bytes):
 *   - r: bytes 0-31  (x-coordinate of R point on secp256k1)
 *   - s: bytes 32-63 (signature proof value, computed as s = k^(-1) * (h + r*privKey) mod n)
 *   - v: byte 64     (recovery id, 27 or 28, determines which of two possible R points)
 *
 * secp256k1 curve: y² = x³ + 7 (mod p)
 *   p = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F
 *   n = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141
 *   G = (0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798,
 *        0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8)
 */
library ECDSA {
    /// @notice Standard Ethereum signed message prefix
    /// @dev Follows EIP-191: "\x19Ethereum Signed Message:\n32"
    ///      This prefix prevents signed data from being valid Ethereum transactions
    bytes constant private ETH_SIGNED_MESSAGE_PREFIX = "\x19Ethereum Signed Message:\n32";

    /**
     * @notice Constructs Ethereum signed message hash following EIP-191
     * @dev h_prefixed = keccak256(prefix || messageHash)
     *      This is the actual hash that was signed by the private key
     * @param messageHash The keccak256 hash of the original message
     * @return The EIP-191 prefixed hash
     */
    function toEthSignedMessageHash(bytes32 messageHash) internal pure returns (bytes32) {
        // Concatenate prefix with message hash and compute keccak256
        // This recreates what MetaMask/wallets do when signing
        return keccak256(abi.encodePacked(ETH_SIGNED_MESSAGE_PREFIX, messageHash));
    }

    /**
     * @notice Decompose 65-byte signature into (v, r, s) components
     * @dev Signature layout in memory:
     *      [0:32]   → r (32 bytes) - x-coordinate of curve point R
     *      [32:64]  → s (32 bytes) - proof value
     *      [64:65]  → v (1 byte)   - recovery id
     *
     *      Mathematical meaning:
     *      - r: The x-coordinate of the ephemeral public key R = k*G (mod n)
     *        where k is the random nonce used during signing
     *      - s: Computed as s = k⁻¹ * (hash + r * privateKey) mod n
     *        This ties the message hash to the signer's private key
     *      - v: Recovery identifier (27 or 28)
     *        Since the curve equation y² = x³ + 7 has two y solutions for each x,
     *        v tells us which y-value (and thus which point R) was used
     *
     * @param sig The 65-byte signature
     * @return v Recovery id (27 or 28)
     * @return r X-coordinate of R point
     * @return s Signature proof value
     */
    function splitSignature(bytes memory sig) internal pure returns (uint8 v, bytes32 r, bytes32 s) {
        require(sig.length == 65, "ECDSA: invalid signature length");

        // Use inline assembly for efficient memory access
        // Signature is stored as: [length(32 bytes)][r(32 bytes)][s(32 bytes)][v(1 byte)]
        assembly {
            // Load r: first 32 bytes after the length prefix
            r := mload(add(sig, 32))
            // Load s: next 32 bytes
            s := mload(add(sig, 64))
            // Load v: single byte (rightmost byte of the next 32 bytes)
            v := byte(0, mload(add(sig, 96)))
        }

        // Normalize v value
        // Some signers return v as 0/1 instead of 27/28
        if (v < 27) {
            v += 27;
        }

        require(v == 27 || v == 28, "ECDSA: invalid v value");
    }

    /**
     * @notice Recover signer address from message hash and signature
     * @dev Uses the EVM ecrecover precompile (address 0x01)
     *
     *      Mathematical process (what ecrecover does internally):
     *      1. Given (h, v, r, s) where h is the message hash
     *      2. Compute R point from r and v:
     *         - x_R = r
     *         - y_R = sqrt(x_R³ + 7) mod p (v determines which root)
     *      3. Compute r_inv = r⁻¹ mod n (modular multiplicative inverse)
     *      4. Compute u1 = -h * r_inv mod n
     *      5. Compute u2 = s * r_inv mod n
     *      6. Recover public key: Q = u1*G + u2*R
     *         where G is the generator point of secp256k1
     *      7. Signer address = keccak256(Q.x || Q.y)[12:32]
     *         (last 20 bytes of the keccak256 hash of the uncompressed public key)
     *
     *      Security checks on s:
     *      For each valid signature (r, s), there exists another valid signature (r, n-s)
     *      To prevent signature malleability, we require s <= n/2
     *      n/2 = 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0
     *
     * @param ethSignedHash The EIP-191 prefixed message hash
     * @param sig The 65-byte signature
     * @return signer The recovered signer address
     */
    function recover(bytes32 ethSignedHash, bytes memory sig) internal pure returns (address signer) {
        (uint8 v, bytes32 r, bytes32 s) = splitSignature(sig);

        // Validate s value to prevent signature malleability
        // If s > n/2, the signature can be "flipped" to (r, n-s, 28-v+27)
        // This is a known attack vector (EIP-2)
        require(
            uint256(s) <= 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0,
            "ECDSA: s value too high (malleable)"
        );

        // Validate r is non-zero and within valid range
        require(uint256(r) > 0 && uint256(r) < 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141,
            "ECDSA: invalid r value"
        );

        // Call ecrecover precompile
        // ecrecover(hash, v, r, s) → address
        // This performs the elliptic curve point recovery described above
        signer = ecrecover(ethSignedHash, v, r, s);
        require(signer != address(0), "ECDSA: invalid signature (zero address recovered)");

        return signer;
    }

    /**
     * @notice Verify that a message was signed by the expected signer
     * @param messageHash The original message hash (before EIP-191 prefix)
     * @param sig The signature bytes
     * @param expectedSigner The address we expect signed the message
     * @return bool True if signature is valid and from expectedSigner
     */
    function verify(
        bytes32 messageHash,
        bytes memory sig,
        address expectedSigner
    ) internal pure returns (bool) {
        bytes32 ethHash = toEthSignedMessageHash(messageHash);
        address recovered = recover(ethHash, sig);
        return recovered == expectedSigner;
    }
}

// ============================================================
//                    TRANSCRIPT NFT CONTRACT
// ============================================================

/**
 * @title TranscriptNFT
 * @notice Full ERC-721 implementation from scratch with transcript verification
 */
contract TranscriptNFT is IERC165, IERC721, IERC721Metadata {

    // ──────────────────── State Variables ────────────────────

    // ERC-721 Core State
    string private _name;
    string private _symbol;
    
    // Token ownership: tokenId → owner address
    mapping(uint256 => address) private _owners;
    
    // Owner balance: address → token count
    mapping(address => uint256) private _balances;
    
    // Token approvals: tokenId → approved address
    mapping(uint256 => address) private _tokenApprovals;
    
    // Operator approvals: owner → operator → approved
    mapping(address => mapping(address => bool)) private _operatorApprovals;
    
    // Token URIs: tokenId → metadata URI (IPFS)
    mapping(uint256 => string) private _tokenURIs;

    // ──────────────────── Admin & School State ────────────────────

    /// @notice Contract deployer / admin
    address public admin;

    /// @notice Ministry address authorized to mint on behalf of students
    address public ministryAddress;

    /// @notice Registered school addresses
    mapping(address => bool) public registeredSchools;
    
    /// @notice School metadata
    mapping(address => string) public schoolNames;

    // ──────────────────── Transcript Data ────────────────────

    struct TranscriptData {
        string schoolName;      // Nama sekolah
        string studentName;     // Nama siswa
        string ipfsCID;         // IPFS Content Identifier untuk PDF
        address issuedBy;       // Address sekolah yang issued
        uint256 issuedAt;       // Timestamp issued
    }

    // tokenId → transcript data
    mapping(uint256 => TranscriptData) public transcripts;

    // Auto-incrementing token counter
    uint256 private _tokenIdCounter;

    // ──────────────────── Verification State (Per-Verifier) ────────────────────

    // Per-verifier verification: tokenId → verifier → verified
    mapping(uint256 => mapping(address => bool)) public verifiedBy;
    
    // Per-verifier verification timestamp: tokenId → verifier → timestamp
    mapping(uint256 => mapping(address => uint256)) public verifiedByAt;
    
    // Pending requests: tokenId → verifier → pending
    mapping(uint256 => mapping(address => bool)) public verificationPending;

    // ──────────────────── Events ────────────────────

    event SchoolRegistered(address indexed school, string name);
    event SchoolRemoved(address indexed school);
    event MinistryAddressUpdated(address indexed ministry);
    event TranscriptMinted(
        uint256 indexed tokenId,
        address indexed school,
        address indexed recipient,
        string studentName,
        string ipfsCID
    );
    event VerificationRequested(
        uint256 indexed tokenId,
        address indexed requester,
        address indexed owner
    );
    event VerificationApproved(
        uint256 indexed tokenId,
        address indexed owner,
        address indexed verifier
    );

    // ──────────────────── Modifiers ────────────────────

    modifier onlyAdmin() {
        require(msg.sender == admin, "TranscriptNFT: caller is not admin");
        _;
    }

    modifier onlyRegisteredSchool() {
        require(registeredSchools[msg.sender], "TranscriptNFT: caller is not a registered school");
        _;
    }

    // ──────────────────── Constructor ────────────────────

    constructor() {
        _name = "TranscriptChain";
        _symbol = "TCNFT";
        admin = msg.sender;
        _tokenIdCounter = 1; // Start from token ID 1
    }

    // ============================================================
    //                    ERC-165 IMPLEMENTATION
    // ============================================================

    /**
     * @notice Check if contract supports an interface
     * @dev ERC-165: Returns true for supported interfaces
     *      - 0x01ffc9a7: ERC-165
     *      - 0x80ac58cd: ERC-721
     *      - 0x5b5e139f: ERC-721 Metadata
     */
    function supportsInterface(bytes4 interfaceId) external pure override returns (bool) {
        return
            interfaceId == 0x01ffc9a7 || // ERC-165
            interfaceId == 0x80ac58cd || // ERC-721
            interfaceId == 0x5b5e139f;   // ERC-721 Metadata
    }

    // ============================================================
    //                    ERC-721 CORE IMPLEMENTATION
    // ============================================================

    /// @notice Get token count for an owner
    function balanceOf(address owner) external view override returns (uint256) {
        require(owner != address(0), "ERC721: zero address query");
        return _balances[owner];
    }

    /// @notice Get owner of a token
    function ownerOf(uint256 tokenId) public view override returns (address) {
        address owner = _owners[tokenId];
        require(owner != address(0), "ERC721: nonexistent token");
        return owner;
    }

    /// @notice Get approved address for a token
    function getApproved(uint256 tokenId) public view override returns (address) {
        require(_owners[tokenId] != address(0), "ERC721: nonexistent token");
        return _tokenApprovals[tokenId];
    }

    /// @notice Check if operator is approved for all tokens
    function isApprovedForAll(address owner, address operator) public view override returns (bool) {
        return _operatorApprovals[owner][operator];
    }

    /// @notice Approve an address to transfer a specific token
    function approve(address to, uint256 tokenId) external override {
        address owner = ownerOf(tokenId);
        require(to != owner, "ERC721: approval to current owner");
        require(
            msg.sender == owner || isApprovedForAll(owner, msg.sender),
            "ERC721: not owner or approved operator"
        );
        _tokenApprovals[tokenId] = to;
        emit Approval(owner, to, tokenId);
    }

    /// @notice Set operator approval for all tokens
    function setApprovalForAll(address operator, bool approved) external override {
        require(operator != msg.sender, "ERC721: approve to caller");
        _operatorApprovals[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    /// @notice Transfer token (unsafe - no receiver check)
    function transferFrom(address from, address to, uint256 tokenId) public override {
        require(_isApprovedOrOwner(msg.sender, tokenId), "ERC721: not owner or approved");
        _transfer(from, to, tokenId);
    }

    /// @notice Safe transfer with receiver check & data
    function safeTransferFrom(address from, address to, uint256 tokenId, bytes calldata data) public override {
        require(_isApprovedOrOwner(msg.sender, tokenId), "ERC721: not owner or approved");
        _transfer(from, to, tokenId);
        _checkOnERC721Received(from, to, tokenId, data);
    }

    /// @notice Safe transfer without data
    function safeTransferFrom(address from, address to, uint256 tokenId) external override {
        require(_isApprovedOrOwner(msg.sender, tokenId), "ERC721: not owner or approved");
        _transfer(from, to, tokenId);
        _checkOnERC721Received(from, to, tokenId, "");
    }

    // ============================================================
    //                    ERC-721 METADATA
    // ============================================================

    function name() external view override returns (string memory) {
        return _name;
    }

    function symbol() external view override returns (string memory) {
        return _symbol;
    }

    function tokenURI(uint256 tokenId) external view override returns (string memory) {
        require(_owners[tokenId] != address(0), "ERC721: nonexistent token");
        return _tokenURIs[tokenId];
    }

    // ============================================================
    //                    INTERNAL ERC-721 FUNCTIONS
    // ============================================================

    /// @notice Check if spender is owner or approved
    function _isApprovedOrOwner(address spender, uint256 tokenId) internal view returns (bool) {
        address owner = ownerOf(tokenId);
        return (
            spender == owner ||
            getApproved(tokenId) == spender ||
            isApprovedForAll(owner, spender)
        );
    }

    /// @notice Internal transfer logic
    function _transfer(address from, address to, uint256 tokenId) internal {
        require(ownerOf(tokenId) == from, "ERC721: transfer from incorrect owner");
        require(to != address(0), "ERC721: transfer to zero address");

        // Clear approval
        _tokenApprovals[tokenId] = address(0);
        emit Approval(from, address(0), tokenId);

        // Update balances
        _balances[from] -= 1;
        _balances[to] += 1;

        // Transfer ownership
        _owners[tokenId] = to;

        emit Transfer(from, to, tokenId);
    }

    /**
     * @notice Internal mint - creates a new token
     * @dev Assigns ownership, updates balance, emits Transfer from address(0)
     */
    function _mint(address to, uint256 tokenId) internal {
        require(to != address(0), "ERC721: mint to zero address");
        require(_owners[tokenId] == address(0), "ERC721: token already minted");

        _balances[to] += 1;
        _owners[tokenId] = to;

        emit Transfer(address(0), to, tokenId);
    }

    /**
     * @notice Check if receiver contract implements IERC721Receiver
     * @dev Prevents tokens from being locked in contracts that don't handle them
     */
    function _checkOnERC721Received(
        address from,
        address to,
        uint256 tokenId,
        bytes memory data
    ) private {
        // Only check if `to` is a contract (has code)
        if (to.code.length > 0) {
            try IERC721Receiver(to).onERC721Received(msg.sender, from, tokenId, data) returns (bytes4 retval) {
                require(
                    retval == IERC721Receiver.onERC721Received.selector,
                    "ERC721: transfer to non-receiver"
                );
            } catch (bytes memory reason) {
                if (reason.length == 0) {
                    revert("ERC721: transfer to non-receiver");
                } else {
                    assembly {
                        revert(add(32, reason), mload(reason))
                    }
                }
            }
        }
    }

    // ============================================================
    //              SCHOOL MANAGEMENT (ADMIN ONLY)
    // ============================================================

    /// @notice Register a school wallet address
    function registerSchool(address school, string calldata schoolName) external onlyAdmin {
        require(school != address(0), "TranscriptNFT: zero address");
        require(!registeredSchools[school], "TranscriptNFT: school already registered");
        
        registeredSchools[school] = true;
        schoolNames[school] = schoolName;
        
        emit SchoolRegistered(school, schoolName);
    }

    /// @notice Set the ministry address authorized to mint on behalf of students
    function setMinistryAddress(address _ministry) external onlyAdmin {
        ministryAddress = _ministry;
        emit MinistryAddressUpdated(_ministry);
    }

    /// @notice Remove a school from whitelist
    function removeSchool(address school) external onlyAdmin {
        require(registeredSchools[school], "TranscriptNFT: school not registered");
        
        registeredSchools[school] = false;
        delete schoolNames[school];
        
        emit SchoolRemoved(school);
    }

    /// @notice Check if an address is a registered school
    function isSchoolRegistered(address school) external view returns (bool) {
        return registeredSchools[school];
    }

    // ============================================================
    //              TRANSCRIPT MINTING (SCHOOL ONLY)
    // ============================================================

    /**
     * @notice Mint a transcript NFT
     * @dev Only registered schools can mint. The NFT is sent directly to the recipient.
     * @param recipient Wallet address of the transcript recipient (student/alumni)
     * @param metadataURI IPFS URI for the full metadata JSON
     * @param studentName Name of the student
     * @param ipfsCID IPFS CID of the original PDF document
     * @return tokenId The ID of the minted token
     */
    function mintTranscript(
        address recipient,
        string calldata metadataURI,
        string calldata studentName,
        string calldata ipfsCID
    ) external onlyRegisteredSchool returns (uint256) {
        uint256 tokenId = _tokenIdCounter;
        _tokenIdCounter += 1;

        // Mint the NFT to the recipient
        _mint(recipient, tokenId);

        // Set the token URI to the IPFS metadata
        _tokenURIs[tokenId] = metadataURI;

        // Store transcript data on-chain
        transcripts[tokenId] = TranscriptData({
            schoolName: schoolNames[msg.sender],
            studentName: studentName,
            ipfsCID: ipfsCID,
            issuedBy: msg.sender,
            issuedAt: block.timestamp
        });

        emit TranscriptMinted(tokenId, msg.sender, recipient, studentName, ipfsCID);

        return tokenId;
    }

    // ============================================================
    //       STUDENT-TRIGGERED MINT WITH SCHOOL APPROVAL (ECDSA)
    // ============================================================

    /**
     * @notice Returns the hash that the school must sign to pre-approve a mint.
     * @dev Frontend calls this to construct the message before asking school to sign.
     *      Hash includes chainId to prevent cross-chain replay.
     */
    function getMintApprovalHash(
        address recipient,
        string calldata metadataURI,
        string calldata studentName,
        string calldata ipfsCID
    ) external view returns (bytes32) {
        return keccak256(abi.encodePacked(
            "MINT_APPROVAL_V1",
            recipient,
            metadataURI,
            studentName,
            ipfsCID,
            block.chainid
        ));
    }

    /**
     * @notice Mint a transcript NFT triggered by the student using a school's off-chain signature.
     * @dev The school signs the mint parameters off-chain (MetaMask personal_sign).
     *      The student calls this function; the contract recovers the school's address from the
     *      signature and verifies it is a registered school before minting.
     *
     *      Flow:
     *      1. School inputs data on their dashboard, calls getMintApprovalHash (or replicates it)
     *      2. School signs the hash with MetaMask → schoolSignature
     *      3. School signature + params stored in Firebase as pending request
     *      4. Student sees the pending request, reviews, then calls this function
     *      5. Contract verifies school signature and mints NFT to student
     *
     * @param recipient Wallet address of the student (must be msg.sender)
     * @param metadataURI IPFS URI of the full metadata JSON
     * @param studentName Student's name
     * @param ipfsCID IPFS CID of the PDF document
     * @param schoolSignature 65-byte ECDSA signature from the registered school
     * @return tokenId The ID of the newly minted token
     */
    function mintTranscriptWithApproval(
        address recipient,
        string calldata metadataURI,
        string calldata studentName,
        string calldata ipfsCID,
        bytes calldata schoolSignature
    ) external returns (uint256) {
        require(recipient != address(0), "TranscriptNFT: invalid recipient");
        require(
            msg.sender == recipient || (ministryAddress != address(0) && msg.sender == ministryAddress),
            "TranscriptNFT: caller must be recipient or ministry"
        );

        bytes32 msgHash = keccak256(abi.encodePacked(
            "MINT_APPROVAL_V1",
            recipient,
            metadataURI,
            studentName,
            ipfsCID,
            block.chainid
        ));

        address school = ECDSA.recover(ECDSA.toEthSignedMessageHash(msgHash), schoolSignature);
        require(registeredSchools[school], "TranscriptNFT: signature not from a registered school");

        uint256 tokenId = _tokenIdCounter;
        _tokenIdCounter += 1;

        _mint(recipient, tokenId);
        _tokenURIs[tokenId] = metadataURI;

        transcripts[tokenId] = TranscriptData({
            schoolName: schoolNames[school],
            studentName: studentName,
            ipfsCID: ipfsCID,
            issuedBy: school,
            issuedAt: block.timestamp
        });

        emit TranscriptMinted(tokenId, school, recipient, studentName, ipfsCID);

        return tokenId;
    }

    // ============================================================
    //              VERIFICATION SYSTEM (ECDSA - Cross-Device)
    // ============================================================

    /**
     * @notice Request verification for a transcript NFT
     * @dev Anyone (HR/verifier) can request verification from their own device.
     *      The owner will see this request on their device and approve it.
     * @param tokenId The token to verify
     */
    function requestVerification(uint256 tokenId) external {
        require(_owners[tokenId] != address(0), "TranscriptNFT: nonexistent token");
        require(!verificationPending[tokenId][msg.sender], "TranscriptNFT: already pending for this verifier");

        // Reset previous verification for this verifier (allows re-verification)
        verifiedBy[tokenId][msg.sender] = false;
        verifiedByAt[tokenId][msg.sender] = 0;

        verificationPending[tokenId][msg.sender] = true;

        emit VerificationRequested(tokenId, msg.sender, ownerOf(tokenId));
    }

    /**
     * @notice Approve verification using ECDSA signature (called by owner from their own device)
     * @dev The owner signs a message on their OWN device and submits it.
     *      This enables cross-device verification — owner doesn't need to be on verifier's device.
     *
     *      Verification process using ECDSA:
     *      1. Message = keccak256(abi.encodePacked(tokenId, address(this), "VERIFY_TRANSCRIPT"))
     *         - tokenId: prevents cross-token replay
     *         - address(this): prevents cross-contract replay
     *         - "VERIFY_TRANSCRIPT": domain separator for this specific action
     *      2. Owner signs the message with their private key using ECDSA:
     *         - Choose random k
     *         - Compute R = k*G on secp256k1 curve
     *         - r = R.x mod n
     *         - s = k⁻¹ * (hash + r * privateKey) mod n
     *         - Signature = (r, s, v)
     *      3. Contract recovers signer from signature using ecrecover
     *      4. Verifies recovered address == token owner
     *
     * @param tokenId The token being verified
     * @param signature The ECDSA signature from the OWNER (65 bytes: r || s || v)
     * @param verifier The address of the verifier whose request is being approved
     */
    function approveVerification(uint256 tokenId, bytes calldata signature, address verifier) external {
        require(verificationPending[tokenId][verifier], "TranscriptNFT: no pending verification for this verifier");

        address owner = ownerOf(tokenId);

        // Construct the verification message
        bytes32 messageHash = keccak256(
            abi.encodePacked(tokenId, address(this), "VERIFY_TRANSCRIPT")
        );

        // Verify ECDSA signature — must be signed by the token OWNER
        bool isValid = ECDSA.verify(messageHash, signature, owner);
        require(isValid, "TranscriptNFT: invalid owner signature");

        // Mark as verified for this specific verifier
        verifiedBy[tokenId][verifier] = true;
        verifiedByAt[tokenId][verifier] = block.timestamp;
        verificationPending[tokenId][verifier] = false;

        emit VerificationApproved(tokenId, owner, verifier);
    }

    // ============================================================
    //                    VIEW FUNCTIONS
    // ============================================================

    /// @notice Get transcript data for a token
    function getTranscriptData(uint256 tokenId) external view returns (
        string memory schoolName_,
        string memory studentName_,
        string memory ipfsCID_,
        address issuedBy_,
        uint256 issuedAt_
    ) {
        require(_owners[tokenId] != address(0), "TranscriptNFT: nonexistent token");
        TranscriptData storage data = transcripts[tokenId];
        return (
            data.schoolName,
            data.studentName,
            data.ipfsCID,
            data.issuedBy,
            data.issuedAt
        );
    }

    /// @notice Check if a specific verifier has verified a token
    function isVerifiedBy(uint256 tokenId, address verifier) external view returns (bool verified_, uint256 verifiedAt_) {
        return (verifiedBy[tokenId][verifier], verifiedByAt[tokenId][verifier]);
    }

    /// @notice Reset own verification for a token (allows re-verification)
    function resetVerification(uint256 tokenId) external {
        verifiedBy[tokenId][msg.sender] = false;
        verifiedByAt[tokenId][msg.sender] = 0;
        verificationPending[tokenId][msg.sender] = false;
    }

    /// @notice Get the current token counter (total minted)
    function totalSupply() external view returns (uint256) {
        return _tokenIdCounter - 1;
    }

    /// @notice Get the verification message hash for signing
    /// @dev Frontend uses this to get the message for the owner to sign
    function getVerificationMessage(uint256 tokenId) external view returns (bytes32) {
        require(_owners[tokenId] != address(0), "TranscriptNFT: nonexistent token");
        return keccak256(
            abi.encodePacked(tokenId, address(this), "VERIFY_TRANSCRIPT")
        );
    }

    /// @notice Check if a verification request is pending for a specific verifier
    function isVerificationPending(uint256 tokenId, address verifier) external view returns (bool) {
        return verificationPending[tokenId][verifier];
    }
}
