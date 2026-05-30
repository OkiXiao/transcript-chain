# 🧮 Contoh Konkrit Kriptografi: Dari Pesan Menjadi Signature

Agar tidak pusing dengan angka 78 digit (ratusan triliun), kita akan pakai "Mini-Ethereum". Di sini batas maksimal angka kita hanyalah **`n = 11`**. Kita akan lihat keajaiban matematikanya bekerja 100% secara nyata!

## 🎭 Pemeran Utama Kita
1. **Aturan Dunia (`n`)** = `11` (Semua perhitungan diakhiri dengan dibagi 11 dan diambil sisanya/modulo)
2. **Private Key (`pk`)** = `7` (Rahasia, cuma Pemilik Transkrip yang tahu)
3. **Public Key (`Pub`)** = `7 × G` (Bisa dilihat semua orang di blockchain)
4. **Pesan (`h`)** = `4` (Anggap ini adalah hasil *hash* dari kata "VERIFY_TRANSCRIPT")

---

## ✍️ TAHAP 1: Signing (Di HP/Laptop Pemilik Transkrip)
Pemilik ingin membuktikan bahwa ia meng-approve request tanpa membocorkan angka `7`.

**Langkah 1: Pilih Angka Acak (`k`)**
Dompet kripto memilih satu angka acak rahasia antara 1 sampai 10.
Kita pilih: **`k = 3`**.

**Langkah 2: Menghitung Komponen Pertama (`r`)**
Komputer menghitung titik `R = k × G` (melompat 3 kali dari titik start).
Anggap saja hasil lompatan ini jatuh di titik yang koordinat X-nya adalah **`6`**.
Maka: **`r = 6`**

**Langkah 3: Menghitung Komponen Kedua (`s`)**
Inilah proses memasukkan *Private Key* ke dalam rumus:
Rumus: `s = k⁻¹ × (h + r × pk) mod 11`

*Catatan: `k⁻¹` (inverse) artinya kita mencari angka yang jika dikalikan `k (3)` lalu dibagi 11, sisanya 1. Angkanya adalah `4` (karena 3 × 4 = 12, sisa 1).*

Mari kita hitung:
* `s = 4 × (4 + 6 × 7) mod 11`
* `s = 4 × (4 + 42) mod 11`
* `s = 4 × 46 mod 11`
* `s = 184 mod 11`
*(Berapa sisa 184 dibagi 11? 184 ÷ 11 = 16 sisa 8)*
* **`s = 8`**

🎉 **SELESAI!** Dompet mengirimkan Signature = **`(r: 6, s: 8)`** ke Smart Contract. 
(Perhatikan: Angka rahasia `7` tidak ada sama sekali di dalam signature ini!)

---

## 🕵️ TAHAP 2: Verification (Oleh Smart Contract di Blockchain)

Smart Contract sekarang memiliki: `r = 6`, `s = 8`, `h = 4`, dan tahu `Pub = 7 × G`.
Contract akan mem-verifikasi apakah signature ini sah:

**Langkah 1: Balikkan nilai `s`**
Cari *inverse* dari `s` (8). Angka berapa yang kalau dikali 8 mod 11 sisanya 1?
Jawabannya **`7`** (karena 8 × 7 = 56, sisa 1 dibagi 11).
Kita sebut angka pembalik ini **`w = 7`**.

**Langkah 2: Hitung dua tebakan koordinat (u1 dan u2)**
* `u1 = h × w mod 11` = `4 × 7 mod 11` = `28 mod 11` = **`6`**
* `u2 = r × w mod 11` = `6 × 7 mod 11` = `42 mod 11` = **`9`**

**Langkah 3: Merekontruksi Titik Pantulan Asli**
Smart Contract sekarang menebak titik pantulan asli dengan rumus:
**`Titik Tebakan = (u1 × G) + (u2 × Pub)`**

Mari kita masukkan angka (ingat, Contract tahu `Pub = 7 × G`):
* `Titik Tebakan = (6 × G) + (9 × 7 × G)`
* `Titik Tebakan = 6 × G + 63 × G`
* `Titik Tebakan = 69 × G`

**Langkah 4: Sederhanakan dengan Modulo 11**
* `69 mod 11` (69 dibagi 11 sisanya berapa?) = **`3`**.
Jadi, **`Titik Tebakan = 3 × G`**

## 🤯 KESIMPULAN (The Magic!)
Perhatikan! Smart Contract berhasil merekonstruksi bahwa tebakan titiknya adalah **`3 × G`**.

Ingat di TAHAP 1 Langkah 1? Signer secara diam-diam memilih angka acak **`k = 3`** dan menghitung `R = 3 × G`.

Karena `Titik Tebakan (3 × G)` persis SAMA dengan titik `R` milik signer (juga `3 × G`), maka **koordinat X-nya pasti sama yaitu `6`**.

Smart Contract mengecek:
* Apakah `r` yang dikirim dari HP (6) **SAMA DENGAN** X tebakan (6)?
* **✅ BENAR (6 == 6) -> VERIFIED!**

Pemilik transkrip berhasil membuktikan bahwa dia tahu Private Key `7`, tanpa pernah mengirimkan angka `7` tersebut! Jika hacker mencoba menebak `s` secara acak, saat direkonstruksi di Langkah 3, hasilnya tidak akan pernah kembali ke angka `3 × G` dan validasinya akan GAGAL TOTAL.
