# 📐 Parameter Kurva secp256k1

Nilai-nilai yang kamu sebutkan (`a`, `b`, `Gx`, `Gy`, `n`, `h`) adalah **"DNA" atau spesifikasi teknis** dari kurva eliptik bernama **secp256k1**. 

Kurva inilah yang digunakan oleh Bitcoin dan Ethereum untuk menghasilkan private key, public key, dan digital signature. Semua komputer di jaringan harus setuju menggunakan parameter-parameter ini agar perhitungan matematikanya cocok.

Akhiran `n` pada angka tersebut menandakan **BigInt** di JavaScript (karena angka-angka ini sangat besar, melebihi kapasitas angka biasa di komputer).

Berikut arti dari masing-masing parameter:

---

## 1. Persamaan Bentuk Kurva (`a` dan `b`)

Setiap kurva eliptik memiliki persamaan dasar: 
`y² = x³ + ax + b`

Untuk secp256k1, nilai yang ditetapkan adalah:
*   **`a: 0n`**
*   **`b: 7n`**

Jika dimasukkan ke persamaan dasar, maka bentuk spesifik kurva secp256k1 adalah:
**`y² = x³ + 7`**

Angka-angka ini dipilih oleh peneliti kriptografi (Standards for Efficient Cryptography Group / SECG) karena nilai `a = 0` dan `b = 7` membuat perhitungan matematika di atas kurva menjadi sangat efisien dan cepat tanpa mengurangi keamanannya.

---

## 2. Titik Awal / Generator Point (`Gx` dan `Gy`)

*   **`Gx: 0x79BE667E...n`** (Koordinat X)
*   **`Gy: 0x483ADA77...n`** (Koordinat Y)

`G` adalah sebuah titik spesifik pada kurva yang disepakati oleh semua orang sebagai **"Titik Start"**. 

**Perannya sangat krusial:**
Untuk membuat **Public Key**, komputermu akan mengambil titik `G` ini, dan menjumlahkannya dengan dirinya sendiri (melompat-lompat di atas kurva) sebanyak **nilai Private Key**-mu. 

*Public Key = Private Key × G*

Jadi, `Gx` dan `Gy` hanyalah lokasi pasti dari titik `G` di grafik koordinat.

---

## 3. Batas Maksimal / Ordo (`n`)

*   **`n: 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n`**

`n` (disebut *order* dari generator G) adalah **jumlah total lompatan maksimal** yang bisa dilakukan dari titik G sebelum ia kembali lagi ke titik awal.

**Kenapa ini penting?**
1.  **Batas Private Key:** Nilai Private Key-mu haruslah sebuah angka antara 1 hingga `n - 1`. Jika kamu melompat sebanyak `n` kali, kamu kembali ke titik nol.
2.  **Modulo Signature:** Dalam rumus `s = k⁻¹(hash + r·privKey) mod n`, nilai `n` digunakan sebagai batas pembatas (modulo) agar hasil perhitungannya tidak menjadi tak terhingga besarnya, melainkan selalu "berputar" di dalam rentang yang diizinkan.

---

## 4. Kofaktor (`h`)

*   **`h: 1n`**

`h` adalah *cofactor*. Ini adalah nilai matematis yang didapat dari membagi total seluruh titik yang ada di kurva dengan nilai `n`.

Dalam secp256k1, `h = 1` berarti nilai `n` itu sendiri sudah mencakup (hampir) *semua titik* yang ada di kurva tersebut. 
Karena `h = 1`, kurva secp256k1 terhindar dari beberapa jenis serangan matematis (seperti *small subgroup attack*) yang sering menimpa kurva lain yang nilai kofaktornya lebih dari 1. Ini membuat desain sistem kriptografinya menjadi lebih aman dan lebih sederhana.

---

> 💡 **Singkatnya:** Keenam nilai ini ibarat aturan baku permainan. `a` dan `b` menggambar papan permainannya, `Gx` dan `Gy` menentukan letak bidak pertamanya, `n` menentukan seberapa banyak langkah maksimal yang bisa diambil, dan `h = 1` memastikan papannya aman dari trik curang. Semua *crypto wallet* dan *smart contract* wajib menggunakan nilai-nilai persis seperti ini.
