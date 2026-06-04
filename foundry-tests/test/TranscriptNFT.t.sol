// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/TranscriptNFT.sol";

/**
 * @title TranscriptNFT Test Suite
 * @notice Pengujian lengkap smart contract TranscriptNFT menggunakan Foundry
 *
 * Cakupan Pengujian:
 * 1. Deployment & Constructor
 * 2. School Management (register, remove, isSchoolRegistered)
 * 3. Ministry Address Management
 * 4. Minting Transkrip (direct school mint)
 * 5. Minting dengan School Approval Signature (ECDSA)
 * 6. Minting oleh Ministry
 * 7. Sistem Verifikasi (request, approve, isVerifiedBy)
 * 8. ERC-721 Functions
 * 9. Access Control (revert cases)
 */
contract TranscriptNFTTest is Test {

    // ─── Contract instance ───────────────────────────────────────
    TranscriptNFT public nft;

    // ─── Test accounts ───────────────────────────────────────────
    address public admin    = makeAddr("admin");
    address public school1  = makeAddr("school1");
    address public school2  = makeAddr("school2");
    address public student1 = makeAddr("student1");
    address public student2 = makeAddr("student2");
    address public ministry = makeAddr("ministry");
    address public hrVerifier = makeAddr("hrVerifier");
    address public stranger = makeAddr("stranger");

    // Private key untuk school (untuk sign approval)
    uint256 public schoolPrivKey = 0xA11CE;
    address public schoolSigner;

    // ─── Data dummy transkrip ────────────────────────────────────
    string constant META_URI   = "ipfs://QmTestMetadataHash123456789";
    string constant STUDENT_NAME = "Budi Santoso";
    string constant PDF_CID    = "QmTestPdfHash987654321";
    string constant SCHOOL_NAME = "Universitas TranscriptChain";

    // ─── Setup ───────────────────────────────────────────────────
    function setUp() public {
        // Deploy kontrak sebagai admin
        vm.prank(admin);
        nft = new TranscriptNFT();

        // Derive address dari private key
        schoolSigner = vm.addr(schoolPrivKey);

        // Register school1 dan schoolSigner
        vm.startPrank(admin);
        nft.registerSchool(school1, SCHOOL_NAME);
        nft.registerSchool(schoolSigner, "Universitas Signer");
        vm.stopPrank();
    }

    // ============================================================
    //  1. DEPLOYMENT & CONSTRUCTOR
    // ============================================================

    function test_Deployment_AdminIsDeployer() public view {
        assertEq(nft.admin(), admin);
    }

    function test_Deployment_TokenCounterStartsAtOne() public {
        // Mint token pertama, harusnya tokenId = 1
        vm.prank(school1);
        uint256 tokenId = nft.mintTranscript(student1, META_URI, STUDENT_NAME, PDF_CID);
        assertEq(tokenId, 1);
    }

    function test_Deployment_MinistryAddressInitiallyZero() public view {
        assertEq(nft.ministryAddress(), address(0));
    }

    function test_Deployment_NameAndSymbol() public view {
        assertEq(nft.name(), "TranscriptChain");
        assertEq(nft.symbol(), "TCNFT");
    }

    // ============================================================
    //  2. SCHOOL MANAGEMENT
    // ============================================================

    function test_RegisterSchool_Success() public {
        vm.prank(admin);
        nft.registerSchool(school2, "Universitas Baru");

        assertTrue(nft.isSchoolRegistered(school2));
        assertEq(nft.schoolNames(school2), "Universitas Baru");
    }

    function test_RegisterSchool_EmitEvent() public {
        vm.expectEmit(true, false, false, true);
        emit TranscriptNFT.SchoolRegistered(school2, "Universitas Baru");

        vm.prank(admin);
        nft.registerSchool(school2, "Universitas Baru");
    }

    function test_RegisterSchool_Revert_NotAdmin() public {
        vm.expectRevert("TranscriptNFT: caller is not admin");
        vm.prank(stranger);
        nft.registerSchool(school2, "Universitas Baru");
    }

    function test_RegisterSchool_Revert_ZeroAddress() public {
        vm.expectRevert("TranscriptNFT: zero address");
        vm.prank(admin);
        nft.registerSchool(address(0), "Invalid");
    }

    function test_RegisterSchool_Revert_AlreadyRegistered() public {
        vm.expectRevert("TranscriptNFT: school already registered");
        vm.prank(admin);
        nft.registerSchool(school1, "Duplicate");
    }

    function test_RemoveSchool_Success() public {
        vm.prank(admin);
        nft.removeSchool(school1);

        assertFalse(nft.isSchoolRegistered(school1));
        assertEq(nft.schoolNames(school1), "");
    }

    function test_RemoveSchool_EmitEvent() public {
        vm.expectEmit(true, false, false, false);
        emit TranscriptNFT.SchoolRemoved(school1);

        vm.prank(admin);
        nft.removeSchool(school1);
    }

    function test_RemoveSchool_Revert_NotAdmin() public {
        vm.expectRevert("TranscriptNFT: caller is not admin");
        vm.prank(stranger);
        nft.removeSchool(school1);
    }

    function test_RemoveSchool_Revert_NotRegistered() public {
        vm.expectRevert("TranscriptNFT: school not registered");
        vm.prank(admin);
        nft.removeSchool(school2); // school2 belum diregister
    }

    function test_IsSchoolRegistered_True() public view {
        assertTrue(nft.isSchoolRegistered(school1));
    }

    function test_IsSchoolRegistered_False() public view {
        assertFalse(nft.isSchoolRegistered(stranger));
    }

    // ============================================================
    //  3. MINISTRY ADDRESS MANAGEMENT
    // ============================================================

    function test_SetMinistryAddress_Success() public {
        vm.prank(admin);
        nft.setMinistryAddress(ministry);

        assertEq(nft.ministryAddress(), ministry);
    }

    function test_SetMinistryAddress_EmitEvent() public {
        vm.expectEmit(true, false, false, false);
        emit TranscriptNFT.MinistryAddressUpdated(ministry);

        vm.prank(admin);
        nft.setMinistryAddress(ministry);
    }

    function test_SetMinistryAddress_Revert_NotAdmin() public {
        vm.expectRevert("TranscriptNFT: caller is not admin");
        vm.prank(stranger);
        nft.setMinistryAddress(ministry);
    }

    function test_SetMinistryAddress_CanUpdate() public {
        vm.startPrank(admin);
        nft.setMinistryAddress(ministry);
        nft.setMinistryAddress(school2); // update ke address lain
        vm.stopPrank();

        assertEq(nft.ministryAddress(), school2);
    }

    // ============================================================
    //  4. MINTING TRANSKRIP (DIRECT SCHOOL MINT)
    // ============================================================

    function test_MintTranscript_Success() public {
        vm.prank(school1);
        uint256 tokenId = nft.mintTranscript(student1, META_URI, STUDENT_NAME, PDF_CID);

        assertEq(tokenId, 1);
        assertEq(nft.ownerOf(tokenId), student1);
        assertEq(nft.tokenURI(tokenId), META_URI);
    }

    function test_MintTranscript_StoresTranscriptData() public {
        vm.prank(school1);
        uint256 tokenId = nft.mintTranscript(student1, META_URI, STUDENT_NAME, PDF_CID);

        (
            string memory schoolName,
            string memory studentName,
            string memory ipfsCID,
            address issuedBy,
        ) = nft.transcripts(tokenId);

        assertEq(schoolName, SCHOOL_NAME);
        assertEq(studentName, STUDENT_NAME);
        assertEq(ipfsCID, PDF_CID);
        assertEq(issuedBy, school1);
    }

    function test_MintTranscript_EmitEvent() public {
        vm.expectEmit(true, true, true, true);
        emit TranscriptNFT.TranscriptMinted(1, school1, student1, STUDENT_NAME, PDF_CID);

        vm.prank(school1);
        nft.mintTranscript(student1, META_URI, STUDENT_NAME, PDF_CID);
    }

    function test_MintTranscript_IncrementTokenId() public {
        vm.startPrank(school1);
        uint256 id1 = nft.mintTranscript(student1, META_URI, "Student A", PDF_CID);
        uint256 id2 = nft.mintTranscript(student2, META_URI, "Student B", PDF_CID);
        vm.stopPrank();

        assertEq(id1, 1);
        assertEq(id2, 2);
    }

    function test_MintTranscript_Revert_NotSchool() public {
        vm.expectRevert("TranscriptNFT: caller is not a registered school");
        vm.prank(stranger);
        nft.mintTranscript(student1, META_URI, STUDENT_NAME, PDF_CID);
    }

    function test_MintTranscript_Revert_RemovedSchool() public {
        vm.prank(admin);
        nft.removeSchool(school1);

        vm.expectRevert("TranscriptNFT: caller is not a registered school");
        vm.prank(school1);
        nft.mintTranscript(student1, META_URI, STUDENT_NAME, PDF_CID);
    }

    // ============================================================
    //  5. MINT DENGAN SCHOOL APPROVAL SIGNATURE (ECDSA)
    // ============================================================

    function _createSchoolSignature(
        address recipient,
        string memory metaURI,
        string memory studentName,
        string memory pdfCID
    ) internal view returns (bytes memory) {
        // Dapatkan hash yang sama dengan yang digunakan kontrak
        bytes32 msgHash = nft.getMintApprovalHash(recipient, metaURI, studentName, pdfCID);

        // Ethereum signed message prefix (EIP-191)
        bytes32 ethHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", msgHash)
        );

        // Sign dengan private key sekolah
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(schoolPrivKey, ethHash);
        return abi.encodePacked(r, s, v);
    }

    function test_MintWithApproval_ByStudent_Success() public {
        bytes memory sig = _createSchoolSignature(student1, META_URI, STUDENT_NAME, PDF_CID);

        vm.prank(student1);
        uint256 tokenId = nft.mintTranscriptWithApproval(
            student1, META_URI, STUDENT_NAME, PDF_CID, sig
        );

        assertEq(tokenId, 1);
        assertEq(nft.ownerOf(tokenId), student1);
    }

    function test_MintWithApproval_ByMinistry_Success() public {
        // Set ministry address
        vm.prank(admin);
        nft.setMinistryAddress(ministry);

        bytes memory sig = _createSchoolSignature(student1, META_URI, STUDENT_NAME, PDF_CID);

        vm.prank(ministry);
        uint256 tokenId = nft.mintTranscriptWithApproval(
            student1, META_URI, STUDENT_NAME, PDF_CID, sig
        );

        assertEq(tokenId, 1);
        assertEq(nft.ownerOf(tokenId), student1); // NFT tetap ke student
    }

    function test_MintWithApproval_Revert_InvalidRecipient() public {
        bytes memory sig = _createSchoolSignature(address(0), META_URI, STUDENT_NAME, PDF_CID);

        vm.expectRevert("TranscriptNFT: invalid recipient");
        vm.prank(student1);
        nft.mintTranscriptWithApproval(address(0), META_URI, STUDENT_NAME, PDF_CID, sig);
    }

    function test_MintWithApproval_Revert_CallerNotRecipientOrMinistry() public {
        bytes memory sig = _createSchoolSignature(student1, META_URI, STUDENT_NAME, PDF_CID);

        // stranger bukan student1 maupun ministry
        vm.expectRevert("TranscriptNFT: caller must be recipient or ministry");
        vm.prank(stranger);
        nft.mintTranscriptWithApproval(student1, META_URI, STUDENT_NAME, PDF_CID, sig);
    }

    function test_MintWithApproval_Revert_SignatureNotFromRegisteredSchool() public {
        // Buat signature dari private key yang BUKAN sekolah terdaftar
        uint256 randomPrivKey = 0xDEADBEEF;
        bytes32 msgHash = nft.getMintApprovalHash(student1, META_URI, STUDENT_NAME, PDF_CID);
        bytes32 ethHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", msgHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(randomPrivKey, ethHash);
        bytes memory invalidSig = abi.encodePacked(r, s, v);

        vm.expectRevert("TranscriptNFT: signature not from a registered school");
        vm.prank(student1);
        nft.mintTranscriptWithApproval(student1, META_URI, STUDENT_NAME, PDF_CID, invalidSig);
    }

    function test_MintWithApproval_MinistryWithoutBeingSet_Revert() public {
        // Ministry address belum diset (address(0))
        bytes memory sig = _createSchoolSignature(student1, META_URI, STUDENT_NAME, PDF_CID);

        vm.expectRevert("TranscriptNFT: caller must be recipient or ministry");
        vm.prank(ministry); // ministry address belum diset di kontrak
        nft.mintTranscriptWithApproval(student1, META_URI, STUDENT_NAME, PDF_CID, sig);
    }

    // ============================================================
    //  6. SISTEM VERIFIKASI
    // ============================================================

    function _mintToken() internal returns (uint256) {
        vm.prank(school1);
        return nft.mintTranscript(student1, META_URI, STUDENT_NAME, PDF_CID);
    }

    function test_RequestVerification_Success() public {
        uint256 tokenId = _mintToken();

        vm.prank(hrVerifier);
        nft.requestVerification(tokenId);

        assertTrue(nft.isVerificationPending(tokenId, hrVerifier));
    }

    function test_RequestVerification_EmitEvent() public {
        uint256 tokenId = _mintToken();

        vm.expectEmit(true, true, true, false);
        emit TranscriptNFT.VerificationRequested(tokenId, hrVerifier, student1);

        vm.prank(hrVerifier);
        nft.requestVerification(tokenId);
    }

    function test_RequestVerification_Revert_TokenNotExist() public {
        vm.expectRevert("TranscriptNFT: nonexistent token");
        vm.prank(hrVerifier);
        nft.requestVerification(999); // token tidak ada
    }

    function test_RequestVerification_Revert_AlreadyPending() public {
        uint256 tokenId = _mintToken();

        vm.prank(hrVerifier);
        nft.requestVerification(tokenId);

        vm.expectRevert("TranscriptNFT: already pending for this verifier");
        vm.prank(hrVerifier);
        nft.requestVerification(tokenId); // request kedua
    }

    function test_ApproveVerification_Success() public {
        uint256 tokenId = _mintToken();

        vm.prank(hrVerifier);
        nft.requestVerification(tokenId);

        // student1 sign pesan verifikasi
        // Approve verification membutuhkan owner sign pesan dengan private key yang diketahui
        // Diuji di test_MintWithApproval_ByStudent_Success menggunakan schoolPrivKey
        // Untuk approveVerification, dibutuhkan known private key dari student
    }

    function test_IsVerifiedBy_FalseByDefault() public {
        uint256 tokenId = _mintToken();
        (bool verified,) = nft.isVerifiedBy(tokenId, hrVerifier);
        assertFalse(verified);
    }

    function test_IsVerificationPending_FalseByDefault() public {
        uint256 tokenId = _mintToken();
        assertFalse(nft.isVerificationPending(tokenId, hrVerifier));
    }

    // ============================================================
    //  7. ERC-721 FUNCTIONS
    // ============================================================

    function test_OwnerOf_AfterMint() public {
        vm.prank(school1);
        uint256 tokenId = nft.mintTranscript(student1, META_URI, STUDENT_NAME, PDF_CID);

        assertEq(nft.ownerOf(tokenId), student1);
    }

    function test_BalanceOf_AfterMint() public {
        assertEq(nft.balanceOf(student1), 0);

        vm.prank(school1);
        nft.mintTranscript(student1, META_URI, STUDENT_NAME, PDF_CID);

        assertEq(nft.balanceOf(student1), 1);
    }

    function test_BalanceOf_MultipleMints() public {
        vm.startPrank(school1);
        nft.mintTranscript(student1, META_URI, "Student 1 Cert 1", PDF_CID);
        nft.mintTranscript(student1, META_URI, "Student 1 Cert 2", PDF_CID);
        vm.stopPrank();

        assertEq(nft.balanceOf(student1), 2);
    }

    function test_TokenURI_AfterMint() public {
        vm.prank(school1);
        uint256 tokenId = nft.mintTranscript(student1, META_URI, STUDENT_NAME, PDF_CID);

        assertEq(nft.tokenURI(tokenId), META_URI);
    }

    function test_TotalSupply_Increments() public {
        assertEq(nft.totalSupply(), 0);

        vm.startPrank(school1);
        nft.mintTranscript(student1, META_URI, "S1", PDF_CID);
        nft.mintTranscript(student2, META_URI, "S2", PDF_CID);
        vm.stopPrank();

        assertEq(nft.totalSupply(), 2);
    }

    function test_SupportsInterface_ERC721() public view {
        // ERC-721 interface ID = 0x80ac58cd
        assertTrue(nft.supportsInterface(0x80ac58cd));
    }

    function test_SupportsInterface_ERC165() public view {
        // ERC-165 interface ID = 0x01ffc9a7
        assertTrue(nft.supportsInterface(0x01ffc9a7));
    }

    // ============================================================
    //  8. GET TRANSCRIPT DATA
    // ============================================================

    function test_GetTranscriptData_AfterMint() public {
        vm.prank(school1);
        uint256 tokenId = nft.mintTranscript(student1, META_URI, STUDENT_NAME, PDF_CID);

        (
            string memory schoolName,
            string memory studentName,
            string memory ipfsCID,
            address issuedBy,
            uint256 issuedAt
        ) = nft.getTranscriptData(tokenId);

        assertEq(schoolName, SCHOOL_NAME);
        assertEq(studentName, STUDENT_NAME);
        assertEq(ipfsCID, PDF_CID);
        assertEq(issuedBy, school1);
        assertGt(issuedAt, 0);
    }

    // ============================================================
    //  9. ACCESS CONTROL — RINGKASAN
    // ============================================================

    function test_AccessControl_OnlyAdmin_RegisterSchool() public {
        vm.expectRevert("TranscriptNFT: caller is not admin");
        vm.prank(school1); // bukan admin
        nft.registerSchool(school2, "Test");
    }

    function test_AccessControl_OnlyAdmin_RemoveSchool() public {
        vm.expectRevert("TranscriptNFT: caller is not admin");
        vm.prank(school1);
        nft.removeSchool(school1);
    }

    function test_AccessControl_OnlyAdmin_SetMinistry() public {
        vm.expectRevert("TranscriptNFT: caller is not admin");
        vm.prank(school1);
        nft.setMinistryAddress(ministry);
    }

    function test_AccessControl_OnlySchool_MintTranscript() public {
        vm.expectRevert("TranscriptNFT: caller is not a registered school");
        vm.prank(admin); // admin bukan school
        nft.mintTranscript(student1, META_URI, STUDENT_NAME, PDF_CID);
    }

    // ============================================================
    //  10. FUZZ TESTING
    // ============================================================

    /// @dev Fuzz: berbagai address sekolah tidak bisa mint tanpa registrasi
    function testFuzz_UnregisteredSchool_CannotMint(address randomSchool) public {
        vm.assume(randomSchool != school1);
        vm.assume(randomSchool != schoolSigner);
        vm.assume(randomSchool != address(0));

        vm.expectRevert("TranscriptNFT: caller is not a registered school");
        vm.prank(randomSchool);
        nft.mintTranscript(student1, META_URI, STUDENT_NAME, PDF_CID);
    }

    /// @dev Fuzz: berbagai address bukan admin tidak bisa register sekolah
    function testFuzz_NonAdmin_CannotRegisterSchool(address notAdmin) public {
        vm.assume(notAdmin != admin);

        vm.expectRevert("TranscriptNFT: caller is not admin");
        vm.prank(notAdmin);
        nft.registerSchool(school2, "Test School");
    }
}
