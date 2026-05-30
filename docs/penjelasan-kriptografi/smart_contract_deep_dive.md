# 🔍 Anatomi Teknis Smart Contract `TranscriptNFT.sol`

Berikut adalah rincian *"Deep Dive"* ke dalam baris kode `contracts/TranscriptNFT.sol` untuk melihat secara konkrit bagaimana contract ini bekerja di balik layar.

---

## 🏗️ 1. Struktur Data (Buku Besar)

Di dalam Solidity, database/penyimpanan utama menggunakan apa yang disebut `mapping` (mirip seperti *Dictionary* atau *Key-Value pair*). Berikut adalah buku besar utama yang mengelola sistem Ijazah:

### A. Buku Besar Hak Milik (Lantai 1)
*   **`mapping(uint256 => address) private _owners;`**
    *(Fungsi: Mencatat "Token ID X adalah milik Dompet Y".)*
*   **`mapping(address => uint256) private _balances;`**
    *(Fungsi: Mencatat "Dompet X punya berapa lembar Ijazah?".)*
*   **`mapping(uint256 => string) private _tokenURIs;`**
    *(Fungsi: Mencatat "Token ID X ini metadata JSON-nya (gambar, atribut) ada di link IPFS mana?".)*

### B. Buku Besar Manajemen Sekolah (Lantai 2)
*   **`address public admin;`**
    *(Fungsi: Mencatat 1 dompet tunggal yang berkuasa mendaftarkan sekolah. Ini diset saat contract pertama kali di-deploy di jaringan).*
*   **`mapping(address => bool) public registeredSchools;`**
    *(Fungsi: Whitelist. Jika dompet Kampus ada di sini nilainya `true`, maka ia diizinkan menerbitkan ijazah).*

### C. Buku Besar Data Ijazah (Lantai 3)
*   **`mapping(uint256 => TranscriptData) public transcripts;`**
    Setiap Token ID menyimpan data terstruktur (`struct TranscriptData`) yang permanen di blockchain:
    ```solidity
    struct TranscriptData {
        string schoolName;   // "Universitas Indonesia"
        string studentName;  // "Budi Santoso"
        string ipfsCID;      // Link PDF asli (QmHash...)
        address issuedBy;    // Dompet kampus yang mencetak
        uint256 issuedAt;    // Timestamp Unix (Waktu penerbitan)
    }
    ```

### D. Buku Besar Verifikasi (Lantai 4)
*   **`mapping(uint256 => mapping(address => bool)) public verificationPending;`**
    *(Fungsi: Mencatat antrean. "Apakah HRD A sedang menunggu approval untuk Token #1?")*
*   **`mapping(uint256 => mapping(address => bool)) public verifiedBy;`**
    *(Fungsi: Mencatat hasil sah. "Apakah Token #1 sudah sah diverifikasi oleh HRD A?")*

---

## ⚙️ 2. Detail Fungsi Utama & Alurnya

Mari kita lihat apa yang terjadi secara sistematis saat fungsi-fungsi ini dipanggil.

### 🎓 A. `mintTranscript(...)` (Mencetak Ijazah)
**Siapa yang bisa memanggil:** HANYA `registeredSchools` (Dompet Kampus).
**Alur Eksekusi:**
1. **Validasi:** Contract mengecek apakah si pemanggil (msg.sender) ada di daftar sekolah berizin. Jika tidak, transaksi **REVERT / GAGAL**.
2. **Generasi ID:** Membaca `_tokenIdCounter` saat ini (misal: 1), lalu menambahkannya menjadi 2 untuk ijazah berikutnya.
3. **Pencatatan Kepemilikan:** Memasukkan alamat siswa ke `_owners[1]`.
4. **Penyimpanan Data:** Menyimpan `studentName`, `schoolName`, dan `ipfsCID` ke dalam buku besar `transcripts[1]`.
5. **Event Log:** Memancarkan sinyal `TranscriptMinted` agar aplikasi frontend (React) tahu ada ijazah baru yang terbit.

### 🕵️ B. `requestVerification(uint256 tokenId)`
**Siapa yang bisa memanggil:** Siapapun (misal: Dompet HRD Perusahaan).
**Alur Eksekusi:**
1. **Validasi:** Mengecek apakah Token ID tersebut benar-benar ada.
2. **Set Pending:** Mengubah status `verificationPending[TokenID][DompetHRD]` menjadi `true`.
3. **Event Log:** Memancarkan `VerificationRequested`. Di sinilah frontend di `VerifyPage.jsx` mendengarkan sinyal untuk menampilkan tulisan *"Menunggu owner approve..."* secara *real-time*.

### ✍️ C. `approveVerification(tokenId, signature, verifier)`
**Siapa yang bisa memanggil:** Siapapun BISA memanggil, TAPI datanya HANYA SAH jika dikirim oleh Dompet Pemilik Ijazah. Ini adalah inti keamanan sistem ini!
**Alur Eksekusi:**
1. **Buat Pesan Virtual:** Contract merakit pesan murni di dalam memori: 
   `Message = Hash(TokenID + AlamatContractIni + teks "VERIFY_TRANSCRIPT")`
2. **Eksekusi ECDSA Library:**
   Contract melempar pesan virtual tersebut dan `signature` (teks panjang 130 huruf) ke perpustakaan/Library ECDSA internal (baris 208-216).
3. **The Magic (`ecrecover`):**
   Di dalam library ECDSA, fungsi spesifik `ecrecover(pesan, v, r, s)` membalik perhitungan matematika seperti yang kita bahas sebelumnya.
   *Hasilnya: Keluar sebuah `Alamat (Public Key)`.*
4. **Sidang Keputusan (Validasi Terakhir):**
   Contract bertanya: *"Apakah Alamat hasil ecrecover SAMA DENGAN `ownerOf(TokenID)`?"*
   * Jika **TIDAK**, artinya signature palsu. Transaksi **DITOLAK**.
   * Jika **YA**, artinya signature terbukti asli dari pemilik. Status `verifiedBy[TokenID][DompetHRD]` diubah jadi `true`, dan status pending dihapus. 

---

## 📚 3. Custom Library ECDSA (Baris 87 - 217)

Kenapa contract ini disebut "Custom dari Scratch"?
Biasanya programmer malas dan tinggal mengimpor `import "@openzeppelin/.../ECDSA.sol"`. Tapi di contract ini, fungsi pemotong string 130 karakter menjadi `r, s, v` ditulis secara manual dengan bahasa tingkat rendah **Assembly**!

```solidity
// Contoh potongan Assembly murni di dalam contract
assembly {
    r := mload(add(sig, 32))  // Ambil 32 byte pertama
    s := mload(add(sig, 64))  // Ambil 32 byte kedua
    v := byte(0, mload(add(sig, 96))) // Ambil 1 byte terakhir
}
```

Hal ini membuat contract ini sangat efisien dan memberikan kontrol penuh terhadap bagaimana matematika secp256k1 dibedah dan diproses on-chain tanpa *black-box* library pihak ketiga.
