// TranscriptNFT contract — deployed 2026-07-17 (v7 - 3-role refactor)
// Address: 0x6629084d99faB5A59b8F2d429F0595e0804E5780

const contractInfo = {
    address: '0x6629084d99faB5A59b8F2d429F0595e0804E5780',
    network: 'sepolia',
    chainId: 11155111,
    abi: [
        // ─── Admin ───
        'function admin() view returns (address)',
        'function registeredSchools(address) view returns (bool)',
        'function schoolNames(address) view returns (string)',
        'function isSchoolRegistered(address) view returns (bool)',
        'function registerSchool(address school, string schoolName)',
        'function removeSchool(address school)',

        // ─── Minting (school only) ───
        'function mintTranscript(address recipient, string metadataURI, bytes32 sha256Hash, string pdfCID) returns (uint256)',
        'function mintTranscriptNamed(address recipient, string metadataURI, bytes32 sha256Hash, string pdfCID, string studentName) returns (uint256)',

        // ─── ERC-721 ───
        'function ownerOf(uint256 tokenId) view returns (address)',
        'function tokenURI(uint256 tokenId) view returns (string)',
        'function balanceOf(address owner) view returns (uint256)',
        'function totalSupply() view returns (uint256)',
        'function transferFrom(address from, address to, uint256 tokenId)',
        'function safeTransferFrom(address from, address to, uint256 tokenId)',
        'function approve(address to, uint256 tokenId)',
        'function setApprovalForAll(address operator, bool approved)',
        'function getApproved(uint256 tokenId) view returns (address)',
        'function isApprovedForAll(address owner, address operator) view returns (bool)',

        // ─── Transcript Data ───
        'function getTranscriptData(uint256 tokenId) view returns (string schoolName, string studentName, string pdfCID, bytes32 sha256Hash, address issuedBy, uint256 issuedAt)',
        'function transcripts(uint256) view returns (string schoolName, string studentName, string pdfCID, bytes32 sha256Hash, address issuedBy, uint256 issuedAt)',

        // ─── Events ───
        'event TranscriptMinted(uint256 indexed tokenId, address indexed school, address indexed recipient, string studentName, string pdfCID, bytes32 sha256Hash)',
        'event SchoolRegistered(address indexed school, string name)',
        'event SchoolRemoved(address indexed school)',
        'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
        'event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId)',
        'event ApprovalForAll(address indexed owner, address indexed operator, bool approved)',
    ],
};

export default contractInfo;
