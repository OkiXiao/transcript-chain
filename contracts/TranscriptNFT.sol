// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title TranscriptNFT
 * @notice ERC-721 NFT built FROM SCRATCH (tanpa OpenZeppelin) untuk verifikasi transkrip ijazah.
 *
 * Custom implementation meliputi:
 * - Full ERC-721 standard (EIP-721)
 * - ERC-721 Metadata extension
 * - ERC-165 interface detection
 * - School whitelist management
 * - Transcript metadata dengan SHA-256 hash untuk post-issuance integrity
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
//                    TRANSCRIPT NFT CONTRACT
// ============================================================

/**
 * @title TranscriptNFT
 * @notice Full ERC-721 implementation from scratch with SHA-256 PDF integrity
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

    /// @notice Registered school addresses
    mapping(address => bool) public registeredSchools;

    /// @notice School metadata
    mapping(address => string) public schoolNames;

    // ──────────────────── Transcript Data ────────────────────

    struct TranscriptData {
        string  schoolName;     // Nama sekolah
        string  studentName;    // Nama penerima
        string  pdfCID;         // IPFS CID untuk file PDF
        bytes32 sha256Hash;     // SHA-256 hash dari PDF untuk post-issuance integrity
        address issuedBy;       // Address sekolah yang minted
        uint256 issuedAt;       // Timestamp minted
    }

    // tokenId → transcript data
    mapping(uint256 => TranscriptData) public transcripts;

    // Auto-incrementing token counter
    uint256 private _tokenIdCounter;

    // ──────────────────── Events ────────────────────

    event SchoolRegistered(address indexed school, string name);
    event SchoolRemoved(address indexed school);
    event TranscriptMinted(
        uint256 indexed tokenId,
        address indexed school,
        address indexed recipient,
        string studentName,
        string pdfCID,
        bytes32 sha256Hash
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

    function supportsInterface(bytes4 interfaceId) external pure override returns (bool) {
        return
            interfaceId == 0x01ffc9a7 || // ERC-165
            interfaceId == 0x80ac58cd || // ERC-721
            interfaceId == 0x5b5e139f;   // ERC-721 Metadata
    }

    // ============================================================
    //                    ERC-721 CORE IMPLEMENTATION
    // ============================================================

    function balanceOf(address owner) external view override returns (uint256) {
        require(owner != address(0), "ERC721: zero address query");
        return _balances[owner];
    }

    function ownerOf(uint256 tokenId) public view override returns (address) {
        address owner = _owners[tokenId];
        require(owner != address(0), "ERC721: nonexistent token");
        return owner;
    }

    function getApproved(uint256 tokenId) public view override returns (address) {
        require(_owners[tokenId] != address(0), "ERC721: nonexistent token");
        return _tokenApprovals[tokenId];
    }

    function isApprovedForAll(address owner, address operator) public view override returns (bool) {
        return _operatorApprovals[owner][operator];
    }

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

    function setApprovalForAll(address operator, bool approved) external override {
        require(operator != msg.sender, "ERC721: approve to caller");
        _operatorApprovals[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    function transferFrom(address from, address to, uint256 tokenId) public override {
        require(_isApprovedOrOwner(msg.sender, tokenId), "ERC721: not owner or approved");
        _transfer(from, to, tokenId);
    }

    function safeTransferFrom(address from, address to, uint256 tokenId, bytes calldata data) public override {
        require(_isApprovedOrOwner(msg.sender, tokenId), "ERC721: not owner or approved");
        _transfer(from, to, tokenId);
        _checkOnERC721Received(from, to, tokenId, data);
    }

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

    function _isApprovedOrOwner(address spender, uint256 tokenId) internal view returns (bool) {
        address owner = ownerOf(tokenId);
        return (
            spender == owner ||
            getApproved(tokenId) == spender ||
            isApprovedForAll(owner, spender)
        );
    }

    function _transfer(address from, address to, uint256 tokenId) internal {
        require(ownerOf(tokenId) == from, "ERC721: transfer from incorrect owner");
        require(to != address(0), "ERC721: transfer to zero address");

        _tokenApprovals[tokenId] = address(0);
        emit Approval(from, address(0), tokenId);

        _balances[from] -= 1;
        _balances[to] += 1;
        _owners[tokenId] = to;

        emit Transfer(from, to, tokenId);
    }

    function _mint(address to, uint256 tokenId) internal {
        require(to != address(0), "ERC721: mint to zero address");
        require(_owners[tokenId] == address(0), "ERC721: token already minted");

        _balances[to] += 1;
        _owners[tokenId] = to;

        emit Transfer(address(0), to, tokenId);
    }

    function _checkOnERC721Received(
        address from,
        address to,
        uint256 tokenId,
        bytes memory data
    ) private {
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

    function registerSchool(address school, string calldata schoolName) external onlyAdmin {
        require(school != address(0), "TranscriptNFT: zero address");
        require(!registeredSchools[school], "TranscriptNFT: school already registered");

        registeredSchools[school] = true;
        schoolNames[school] = schoolName;

        emit SchoolRegistered(school, schoolName);
    }

    function removeSchool(address school) external onlyAdmin {
        require(registeredSchools[school], "TranscriptNFT: school not registered");

        registeredSchools[school] = false;
        delete schoolNames[school];

        emit SchoolRemoved(school);
    }

    function isSchoolRegistered(address school) external view returns (bool) {
        return registeredSchools[school];
    }

    // ============================================================
    //              TRANSCRIPT MINTING (SCHOOL ONLY)
    // ============================================================

    /**
     * @notice Mint transkrip NFT langsung oleh sekolah.
     * @dev Hanya sekolah terdaftar yang bisa mint. NFT dikirim ke recipient.
     *      sha256Hash digunakan untuk post-issuance integrity verification —
     *      sistem ini menjamin bahwa PDF tidak diubah setelah upload, bukan memvalidasi kontennya.
     * @param recipient     Wallet address penerima NFT
     * @param metadataURI   IPFS URI metadata JSON
     * @param sha256Hash    SHA-256 hash dari file PDF (dihitung server-side dari buffer asli)
     * @param pdfCID        IPFS CID dari file PDF
     * @return tokenId      ID token yang di-mint
     */
    function mintTranscript(
        address recipient,
        string calldata metadataURI,
        bytes32 sha256Hash,
        string calldata pdfCID
    ) external onlyRegisteredSchool returns (uint256) {
        require(recipient != address(0), "TranscriptNFT: invalid recipient");

        uint256 tokenId = _tokenIdCounter;
        _tokenIdCounter += 1;

        _mint(recipient, tokenId);
        _tokenURIs[tokenId] = metadataURI;

        transcripts[tokenId] = TranscriptData({
            schoolName:  schoolNames[msg.sender],
            studentName: "",
            pdfCID:      pdfCID,
            sha256Hash:  sha256Hash,
            issuedBy:    msg.sender,
            issuedAt:    block.timestamp
        });

        emit TranscriptMinted(tokenId, msg.sender, recipient, "", pdfCID, sha256Hash);

        return tokenId;
    }

    /**
     * @notice Mint transkrip NFT dengan nama penerima (opsional, untuk metadata on-chain).
     * @dev Overload dengan studentName untuk kemudahan frontend.
     */
    function mintTranscriptNamed(
        address recipient,
        string calldata metadataURI,
        bytes32 sha256Hash,
        string calldata pdfCID,
        string calldata studentName
    ) external onlyRegisteredSchool returns (uint256) {
        require(recipient != address(0), "TranscriptNFT: invalid recipient");

        uint256 tokenId = _tokenIdCounter;
        _tokenIdCounter += 1;

        _mint(recipient, tokenId);
        _tokenURIs[tokenId] = metadataURI;

        transcripts[tokenId] = TranscriptData({
            schoolName:  schoolNames[msg.sender],
            studentName: studentName,
            pdfCID:      pdfCID,
            sha256Hash:  sha256Hash,
            issuedBy:    msg.sender,
            issuedAt:    block.timestamp
        });

        emit TranscriptMinted(tokenId, msg.sender, recipient, studentName, pdfCID, sha256Hash);

        return tokenId;
    }

    // ============================================================
    //                    VIEW FUNCTIONS
    // ============================================================

    function getTranscriptData(uint256 tokenId) external view returns (
        string memory schoolName_,
        string memory studentName_,
        string memory pdfCID_,
        bytes32 sha256Hash_,
        address issuedBy_,
        uint256 issuedAt_
    ) {
        require(_owners[tokenId] != address(0), "TranscriptNFT: nonexistent token");
        TranscriptData storage data = transcripts[tokenId];
        return (
            data.schoolName,
            data.studentName,
            data.pdfCID,
            data.sha256Hash,
            data.issuedBy,
            data.issuedAt
        );
    }

    function totalSupply() external view returns (uint256) {
        return _tokenIdCounter - 1;
    }
}
