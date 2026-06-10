// Deployed to Sepolia on 2026-06-10 (v6 - Redeploy)
// Contract: 0x6843948A9DA1E33f59d4Bc9AC7DD39C5f38031d3
const contractInfo = {
    address: "0x6843948A9DA1E33f59d4Bc9AC7DD39C5f38031d3",
    network: "sepolia",
    chainId: 11155111,
    abi: [
        "function admin() view returns (address)",
        "function ministryAddress() view returns (address)",
        "function setMinistryAddress(address _ministry)",
        "function registeredSchools(address) view returns (bool)",
        "function schoolNames(address) view returns (string)",
        "function isSchoolRegistered(address) view returns (bool)",
        "function registerSchool(address school, string schoolName)",
        "function removeSchool(address school)",
        "function getMintApprovalHash(address recipient, string metadataURI, string studentName, string ipfsCID) view returns (bytes32)",
        "function mintTranscriptWithApproval(address recipient, string metadataURI, string studentName, string ipfsCID, bytes schoolSignature) returns (uint256)",
        "function ownerOf(uint256 tokenId) view returns (address)",
        "function tokenURI(uint256 tokenId) view returns (string)",
        "function balanceOf(address owner) view returns (uint256)",
        "function totalSupply() view returns (uint256)",
        "function getTranscriptData(uint256 tokenId) view returns (string schoolName, string studentName, string ipfsCID, address issuedBy, uint256 issuedAt)",
        "function getVerificationMessage(uint256 tokenId) view returns (bytes32)",
        "function requestVerification(uint256 tokenId)",
        "function approveVerification(uint256 tokenId, bytes signature, address verifier)",
        "function isVerifiedBy(uint256 tokenId, address verifier) view returns (bool verified, uint256 verifiedAt)",
        "function isVerificationPending(uint256 tokenId, address verifier) view returns (bool)",
        "function resetVerification(uint256 tokenId)",
        "function transcripts(uint256) view returns (string schoolName, string studentName, string ipfsCID, address issuedBy, uint256 issuedAt)",
        "event TranscriptMinted(uint256 indexed tokenId, address indexed school, address indexed recipient, string studentName, string ipfsCID)",
        "event VerificationRequested(uint256 indexed tokenId, address indexed requester, address indexed owner)",
        "event VerificationApproved(uint256 indexed tokenId, address indexed owner, address indexed verifier)",
        "event SchoolRegistered(address indexed school, string name)",
        "event SchoolRemoved(address indexed school)",
        "event MinistryAddressUpdated(address indexed ministry)"
    ]
};

export default contractInfo;
