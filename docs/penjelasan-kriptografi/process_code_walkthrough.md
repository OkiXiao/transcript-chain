# 💻 Membedah Kode: 3 Proses Utama TranscriptChain

Mari kita lihat langsung potongan kode (coding-an) dari project-mu yang mengeksekusi teori-teori di atas!

---

## 📄 1. PROSES UPLOAD IJAZAH (Penerbitan)

**Alur:** Kampus upload file -> Disimpan di IPFS -> Dicetak jadi NFT di Smart Contract.

### 💻 Kodingan Backend (Upload ke IPFS via Pinata)
*(Terletak di: `api/upload-transcript.js`)*
```javascript
// Baris 19: API Vercel menembak API Pinata untuk upload PDF
const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
    method: 'POST',
    headers: {
        'pinata_api_key': process.env.PINATA_API_KEY,
        'pinata_secret_api_key': process.env.PINATA_SECRET_KEY,
    },
    body: formData,
});
// Hasilnya: pdfCID (Contoh: Qm1234abcd...)
```

### 💻 Kodingan Smart Contract (Cetak NFT)
*(Terletak di: `contracts/TranscriptNFT.sol`)*
```solidity
// Baris 552: Fungsi yang dipanggil kampus setelah file masuk IPFS
function mintTranscript(
    address recipient,      // Wallet Siswa
    string calldata metadataURI, // Link JSON IPFS
    string calldata studentName,
    string calldata ipfsCID      // Link PDF IPFS
) external onlyRegisteredSchool returns (uint256) {
    uint256 tokenId = _tokenIdCounter; // Ambil ID Ijazah baru
    _tokenIdCounter += 1;

    _mint(recipient, tokenId); // Berikan NFT ke dompet Siswa

    // SIMPAN DATA KE BLOCKCHAIN SECARA PERMANEN
    transcripts[tokenId] = TranscriptData({
        schoolName: schoolNames[msg.sender],
        studentName: studentName,
        ipfsCID: ipfsCID,
        issuedBy: msg.sender,
        issuedAt: block.timestamp
    });
}
```

---

## 🔍 2. PROSES VERIFY TRANSCRIPT (Requesting)

**Alur:** HRD mengeklik "Request Verifikasi" -> Smart Contract mencatat status "Pending".

### 💻 Kodingan Frontend React (HRD Klik Tombol)
*(Terletak di: `src/pages/VerifyPage.jsx`)*
```javascript
// Baris 161: Dijalankan saat tombol "Request Verifikasi" diklik
const handleStartVerification = async () => {
    // Meminta MetaMask HRD mengeksekusi Smart Contract
    const tx = await contract.requestVerification(tokenId);
    await tx.wait(); // Tunggu loading blockchain selesai
    
    // Ubah UI jadi muter-muter nunggu di-approve siswa
    setVerifyStep('waiting-owner'); 
    startPolling(tokenId); // Nge-refresh otomatis tiap 5 detik
};
```

### 💻 Kodingan Smart Contract (Pencatatan Status)
*(Terletak di: `contracts/TranscriptNFT.sol`)*
```solidity
// Baris 591: Menerima request dari HRD
function requestVerification(uint256 tokenId) external {
    // Memastikan dompet HRD ini belum me-request sebelumnya
    require(!verificationPending[tokenId][msg.sender], "already pending");

    // Mengubah status di buku besar "verificationPending" menjadi TRUE
    verificationPending[tokenId][msg.sender] = true;

    // Memancarkan sinyal (event) agar terbaca oleh HP Siswa
    emit VerificationRequested(tokenId, msg.sender, ownerOf(tokenId));
}
```

---

## ✍️ 3. PROSES OWNER APPROVAL (Persetujuan Siswa)

**Alur:** Siswa melihat request -> Siswa tanda tangan dengan Kriptografi (Off-chain) -> Smart Contract Validasi (On-chain).

### 💻 Kodingan Frontend React (Siswa Klik Tanda Tangan)
*(Terletak di: `src/pages/OwnerApprovalPage.jsx`)*
```javascript
// Baris 125: Dijalankan saat Siswa klik "Sign & Approve"
const handleApprove = async (tokenId, verifier) => {
    // 1. Ambil pesan virtual khusus dari Smart Contract
    const messageHash = await contract.getVerificationMessage(tokenId);
    
    // 2. META MASK POPUP: Muncul permintaan tanda tangan!
    // Di sinilah rumus s = k^-1 (h + r*pk) mod n bekerja secara tak terlihat
    const signature = await signer.signMessage(ethers.getBytes(messageHash));

    // 3. Kirim teks panjang (signature) ke Smart Contract
    const approveTx = await contract.approveVerification(tokenId, signature, verifier);
    await approveTx.wait(); // Loading...
};
```

### 💻 Kodingan Smart Contract (Validasi Pamungkas Kriptografi)
*(Terletak di: `contracts/TranscriptNFT.sol`)*
```solidity
// Baris 627: Menerima tanda tangan dari Siswa
function approveVerification(uint256 tokenId, bytes calldata signature, address verifier) external {
    address owner = ownerOf(tokenId); // Ambil alamat asli Siswa

    // 1. Rakit ulang pesan virtual yang ditandatangani tadi
    bytes32 messageHash = keccak256(
        abi.encodePacked(tokenId, address(this), "VERIFY_TRANSCRIPT")
    );

    // 2. BONGKAR TANDA TANGAN DENGAN ECDSA!
    // Ini akan menjalankan fungsi ecrecover(pesan, v, r, s) yang kita bahas
    bool isValid = ECDSA.verify(messageHash, signature, owner);
    
    // 3. JIKA SALAH, TRANSAKSI GAGAL DAN DIKEMBALIKAN (REVERT)
    require(isValid, "TranscriptNFT: invalid owner signature");

    // 4. JIKA BENAR, UBAH STATUS IJAZAH JADI SAH / VERIFIED!
    verifiedBy[tokenId][verifier] = true;
    verificationPending[tokenId][verifier] = false; // Hapus antrean
}
```

## 🎯 Intisari
Ketiga proses ini bekerja layaknya bola pingpong:
1. **Frontend React** bertugas sebagai pemantik (tombol klik) dan membaca data.
2. **MetaMask** bertugas menembakkan rumus kriptografi (*Private Key* tidak pernah keluar dari MetaMask).
3. **Smart Contract** bertugas sebagai "Hakim" yang menyimpan buku besar permanen dan menolak setiap manipulasi!
