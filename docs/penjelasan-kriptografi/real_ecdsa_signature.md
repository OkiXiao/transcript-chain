# 🌌 Skala Asli Ethereum: Private Key Sungguhan

Sekarang kita tinggalkan angka belasan (Mini-Ethereum) dan masuk ke dunia nyata. Di Ethereum, Private Key bukanlah angka `7` atau `15`, melainkan **angka 256-bit (64 karakter Hexadecimal)**. 

Ini adalah simulasi bentuk nyata dari dompet yang berinteraksi dengan `TranscriptNFT`.

---

## 1. Persiapan Data Asli

Di dunia nyata, semuanya berbentuk *Hexadecimal* (basis 16), yang ditandai dengan awalan `0x`. Angka ini terbentang hingga 78 digit!

| Komponen | Bentuk di Dunia Nyata (Contoh) |
| :--- | :--- |
| **Batas Kurva (`n`)** | `0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141` |
| **Private Key**<br>*(Disimpan di MetaMask)* | `0x4f3edf983ac636a65a842ce7c78d9aa706d3b113bce9c46f30d7d21715b23b1d` |
| **Pesan Asli** | `"VERIFY_TRANSCRIPT (Token #1)"` |
| **Pesan Hash**<br>*(keccak256)* | `0x3c9229289a6125f7fdf1885a77bb12c37a8d3b4962d936f7e3084dece32a3ca1` |

---

## 2. Proses Signing di MetaMask

Ketika layar MetaMask muncul dan kamu klik **"Sign"**, HP/Laptopmu melakukan persis hitung-hitungan yang sama dengan simulasi kita sebelumnya, tetapi komputasinya super berat:

**Langkah 1: Memilih `k` secara acak**
`k = 0xa8b9c2...` (64 karakter acak)

**Langkah 2: Mencari koordinat X dari `k × G` (`r`)**
`r = 0x5a1d7f6ce83b9a1c22d4f87a3b4e9c12b7d5a9214f3c8b9d7a6e4f2c1b3d8a5c`

**Langkah 3: Menghitung rumus pamungkas (`s`)**
`s = k⁻¹ × (Hash + r × PrivateKey) mod n`
Komputer melakukan perkalian raksasa:
(Hash) `0x3c92...` **DITAMBAH** (`r` dikali `0x4f3e...`) **LALU** (dikali *inverse* dari `k`) **DIBAGI** (`n`).

Hasil dari matematika brutal itu adalah sebuah angka baru:
`s = 0x2b8c9d4ae61c3f5d8e7b2a1c9d4f6e3a2b1c8d5e4f7a9b3c2d1e8f6a4b7c9d2f`

---

## 3. Hasil Akhir (Signature Digital)

Di jaringan blockchain, signature tidak dikirim sebagai dua variabel terpisah, melainkan **ditempel jadi satu string panjang berukuran 65-Byte (130 karakter)**.

Penyusunannya selalu: **`r` (32 byte) + `s` (32 byte) + `v` (1 byte)**.
*(Catatan: `v` adalah angka 27 atau 28, dalam hex adalah `1b` atau `1c`)*.

Maka, digital signature akhir yang dikirimkan Smart Contract kamu adalah:

> **`0x5a1d7f6ce83b9a1c22d4f87a3b4e9c12b7d5a9214f3c8b9d7a6e4f2c1b3d8a5c2b8c9d4ae61c3f5d8e7b2a1c9d4f6e3a2b1c8d5e4f7a9b3c2d1e8f6a4b7c9d2f1b`**

Kamu sering melihat teks panjang acak seperti ini di etherscan atau di dApp, bukan? Sekarang kamu tahu persis dari mana ia berasal.

---

## 4. Proses Verifikasi di Smart Contract (`ecrecover`)

Pada file `VerifyPage.jsx` atau fungsi `.sol` kamu, ketika contract menerima teks 130 karakter di atas:

1. **Memotong String:** Contract memotong string tersebut menjadi 3 bagian:
   - 64 huruf pertama adalah **`r`**
   - 64 huruf kedua adalah **`s`**
   - 2 huruf terakhir adalah **`v`** (yaitu `1b` / 27)
2. **Reverse Math:** Contract memasukkan nilai raksasa `r` dan `s` tersebut, dicampur dengan Pesan Hash `0x3c92...`, lalu merekonstruksi ulang perkalian kurvanya.
3. **Mendapatkan Public Key:** Dari proses rekonstruksi (sama seperti contoh Mini-Ethereum kita sebelumnya), hasil perhitungannya akan langsung memunculkan **Public Key**.
4. **Validasi Akhir:** Public Key itu diubah menjadi `Address` (contoh: `0x71C...`). Apakah address ini sama dengan Address Pemilik Transkrip? Jika YA, maka status menjadi **"Verified ✅"**.

> 💡 **Fakta Unik:** Proses matematika "Reverse Math" ini sangat berat. Itulah mengapa Solidity menyediakan fungsi pra-kompilasi (*precompile*) bawaan bernama **`ecrecover`**. Fungsi ini dikodekan dengan bahasa C/Assembly di mesin Ethereum agar sangat murah biaya gas-nya!
