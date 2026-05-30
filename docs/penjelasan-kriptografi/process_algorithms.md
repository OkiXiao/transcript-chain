# 🔄 Alur Kerja & Algoritma TranscriptChain

Aplikasi TranscriptChain memiliki 3 proses utama yang saling terhubung. Mari kita bedah apa yang terjadi di balik layar, siapa saja aktornya, dan algoritma apa yang bekerja di masing-masing proses.

---

## 📄 1. Proses Upload Ijazah (Penerbitan)
**Aktor:** Pihak Sekolah/Kampus (Admin).
**Tujuan:** Mengubah file PDF ijazah menjadi aset digital (NFT) yang kebal modifikasi dan tercatat abadi di blockchain.

### Cara Kerjanya:
1. **Frontend (Upload):** Kampus memilih file PDF Ijazah dan mengisi nama siswa beserta *wallet address* siswa tersebut.
2. **Backend Serverless (`api/upload-transcript.js`):** 
   - File PDF dikirim ke API Vercel. 
   - API ini lalu meneruskan PDF tersebut ke **IPFS** (InterPlanetary File System) melalui layanan Pinata.
   - Setelah PDF ter-upload, API membuat sebuah file JSON (*Metadata*) yang berisi nama siswa, detail ijazah, dan *link* menuju PDF tadi, lalu meng-upload JSON itu ke IPFS juga.
3. **Smart Contract (`mintTranscript`):** 
   - Setelah sukses di IPFS, Kampus mengklik konfirmasi MetaMask untuk mencetak NFT.
   - Smart Contract menyimpan *link* IPFS tersebut ke dalam buku besarnya. Saat ini terjadi, Ijazah resmi menjadi Token NFT milik si Siswa.

### 🧮 Algoritma yang Bekerja:
*   **SHA-256 (Hash Cryptography):** Digunakan oleh IPFS. Saat PDF di-upload, IPFS menghitung hash dari isi file tersebut untuk menghasilkan **CID** (Content Identifier, seperti `Qm...`). Algoritma ini menjamin jika file PDF diubah walau hanya 1 titik, CID-nya akan berubah total.
*   **Merkle DAG:** Struktur data yang dipakai IPFS untuk memecah dan mendistribusikan file PDF ke komputer-komputer di seluruh dunia (Desentralisasi).

---

## 🔍 2. Proses Verify Transcript (Requesting)
**Aktor:** Pihak Ketiga / Verifikator (Contoh: HRD Perusahaan).
**Tujuan:** Mengecek apakah sebuah ijazah itu asli dan meminta "izin" untuk melihat validasinya.

### Cara Kerjanya:
1. **Pencarian Data (Read-Only):** HRD memasukkan Token ID. Aplikasi React (`VerifyPage.jsx`) akan bertanya ke Blockchain: *"Siapa pemilik token ini? Mana link IPFS-nya?"*
2. **Menampilkan Data:** Data ditampilkan ke layar HRD (termasuk link PDF Ijazah). Namun statusnya masih "Belum Diverifikasi".
3. **Request Verifikasi (Write):** HRD mengklik "Request Verifikasi". MetaMask HRD akan memicu transaksi ke blockchain (memanggil fungsi `requestVerification` di Smart Contract).
4. **Update Status:** Smart Contract mencatat di dalam memorinya bahwa: *"HRD A sedang menunggu approval untuk Token X"*. Status di layar berubah menjadi *Pending / Polling*.

### 🧮 Algoritma yang Bekerja:
*   **State Machine Logic:** Tidak ada algoritma kriptografi rumit di tahap ini. Smart contract hanya melakukan operasi modifikasi data (*State Mutation*) mengubah nilai dari `false` menjadi `true` di dalam struktur data Mapping.
*   **HTTP Polling (Di Frontend):** Aplikasi React menggunakan algoritma *polling* (bertanya berulang-ulang ke blockchain setiap 5 detik) untuk mengecek apakah status *pending* tadi sudah di-approve oleh siswa.

---

## ✍️ 3. Proses Owner Approval (Persetujuan)
**Aktor:** Pemilik Ijazah (Siswa).
**Tujuan:** Memberikan bukti matematis tanpa terbantahkan bahwa **"Benar, Ijazah ini milik saya, dan saya mengizinkan HRD tersebut memverifikasinya."**

### Cara Kerjanya:
1. **Melihat Antrean:** Siswa membuka halaman `OwnerApprovalPage.jsx`. Aplikasi membaca blockchain dan melihat ada antrean "Request Verifikasi" dari dompet HRD.
2. **Merakit Pesan Virtual:** Saat siswa klik "Approve", aplikasi membuat sebuah pesan virtual yang unik. Pesannya dirakit dari 3 hal: `[TokenID] + [Alamat Contract] + [Teks: "VERIFY_TRANSCRIPT"]`.
3. **Tanda Tangan (Off-chain):** MetaMask siswa akan muncul meminta persetujuan. Di sini MetaMask memasukkan Pesan Virtual tadi dan Private Key siswa ke dalam rumus. Hasilnya adalah 130 huruf acak (Signature).
4. **Kirim ke Blockchain:** Signature tersebut dikirim ke Smart Contract melalui fungsi `approveVerification`.
5. **Validasi (On-chain):** Smart Contract menggunakan *reverse-math* terhadap signature tersebut untuk melihat apakah ia memunculkan Public Key milik Siswa. Jika cocok, Ijazah resmi ditandai sebagai **"Verified by HRD"**.

### 🧮 Algoritma yang Bekerja:
*   **Keccak-256 (Ethereum Hash):** Algoritma hashing bawaan Ethereum yang dipakai untuk menyusutkan Pesan Virtual menjadi persis 32 byte sebelum ditandatangani.
*   **EIP-191 Standard:** Algoritma pemformatan pesan (menambahkan prefix `\x19Ethereum Signed Message:\n32`) agar tanda tangan tidak bisa disalahgunakan oleh hacker untuk mencuri saldo Ethereum siswa.
*   **ECDSA (secp256k1):** Algoritma bintang utama kita! Berjalan di HP siswa untuk membuat nilai `r` dan `s`, dan berjalan di dalam Smart Contract (via `ecrecover`) untuk membedah dan memverifikasi keasliannya.
