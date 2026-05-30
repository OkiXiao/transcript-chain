# 🔐 Dari Rumus ke Digital Signature — ECDSA di TranscriptChain

> Penjelasan mendalam: bagaimana formula matematika abstrak berubah menjadi **65 byte** yang membuktikan identitas seorang pemilik transkrip.

---

## 🧩 Gambaran Besar: Apa itu Digital Signature?

Signature digital adalah bukti kriptografis bahwa **"seseorang yang memegang private key X telah menyetujui pesan Y"** — tanpa perlu mengungkapkan private key-nya sama sekali.

Di TranscriptChain, ini dipakai untuk: **pemilik transkrip (owner) membuktikan ke smart contract bahwa *dia sendiri* yang meng-approve request verifikasi**, bukan orang lain yang berpura-pura jadi owner.

```
Owner punya private key → Sign pesan → Hasilkan (r, s, v)
Contract punya signature → Recover public key → Bandingkan dengan owner address
```

---

## 📐 Kurva Elliptic secp256k1: Fondasi Segalanya

Dari komentar di `.sol` baris 81–85:

```
secp256k1 curve: y² = x³ + 7 (mod p)
  p = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F
  n = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141
  G = (0x79BE667EF9DCBBAC55A06295CE870B07..., 0x483ADA7726A3C4655DA4FBFC...)
```

### Peran masing-masing:

| Simbol | Nama | Peran |
|--------|------|-------|
| `p` | Prime field modulus | Semua operasi dilakukan di bilangan modulo p (membatasi nilai jadi finite) |
| `n` | Order of G | Jumlah titik yang bisa dicapai dari G; semua scalar dihitung mod n |
| `G` | Generator point | "Titik awal" di kurva; dikalikan dengan private key menghasilkan public key |
| `y² = x³ + 7` | Persamaan kurva | Mendefinisikan bentuk kurva; semua titik valid harus ada di kurva ini |

> **Intuisi:** Bayangkan G adalah "titik awal jam" dan perkalian titik `k * G` adalah "memutar jarum jam sebanyak k kali". Hasilnya bisa diprediksi jika tahu k, tapi **hampir mustahil menemukan k hanya dari posisi akhir jarum** (ini disebut *discrete logarithm problem*).

---

## ✍️ Proses Signing: Dari Private Key ke (r, s, v)

Ini yang terjadi di dalam **MetaMask/wallet** saat owner klik "Sign":

### Langkah 1: Buat Pesan (Message Construction)

```solidity
// Dari approveVerification() di baris 633–635:
bytes32 messageHash = keccak256(
    abi.encodePacked(tokenId, address(this), "VERIFY_TRANSCRIPT")
);
```

Pesan ini dikonstruksi dari 3 komponen:

| Komponen | Nilai Contoh | Tujuan |
|----------|-------------|--------|
| `tokenId` | `1` | Mencegah **cross-token replay** (signature untuk token 1 tidak bisa dipakai token 2) |
| `address(this)` | `0xAbCd...1234` | Mencegah **cross-contract replay** (hanya berlaku di contract ini) |
| `"VERIFY_TRANSCRIPT"` | string literal | **Domain separator** — membedakan aksi ini dari signing lain |

### Langkah 2: EIP-191 Prefix (Anti-Transaction Attack)

```solidity
// Dari ECDSA library baris 100–103:
function toEthSignedMessageHash(bytes32 messageHash) internal pure returns (bytes32) {
    return keccak256(abi.encodePacked(
        "\x19Ethereum Signed Message:\n32",  // 28 bytes prefix
        messageHash                          // 32 bytes hash
    ));
}
```

**Mengapa perlu prefix ini?**

Tanpa prefix, seseorang bisa memaksa user men-sign sesuatu yang ternyata adalah **transaksi Ethereum yang valid** (karena format data-nya identik). EIP-191 menambahkan `\x19` di awal yang **tidak pernah valid** sebagai byte pertama transaksi Ethereum, sehingga data yang di-sign tidak bisa disalahgunakan sebagai transaksi.

```
h_final = keccak256("\x19Ethereum Signed Message:\n32" || messageHash)
         ↑ Ini yang sebenarnya "ditandatangani" oleh private key
```

### Langkah 3: Signing dengan Private Key (Matematika Inti)

Ini yang terjadi di dalam firmware wallet (hardware/software):

```
Input : h_final (32 bytes hash), privateKey (256-bit secret)
Output: (r, s, v)

Algoritma:
1. Pilih nonce k secara ACAK (kritis! k tidak boleh sama dua kali)
2. Hitung R = k × G  (perkalian titik di kurva secp256k1)
3. r = R.x mod n    (ambil koordinat-x dari titik R)
4. s = k⁻¹ × (h_final + r × privateKey) mod n
5. v = parity dari R.y (0 atau 1, dinormalisasi jadi 27/28)
```

**Kenapa ini aman?**
- Untuk memalsukan signature, attacker perlu tahu `privateKey`
- Untuk mendapat `privateKey`, perlu "membalik" `s = k⁻¹ × (h + r×pk)` — tapi `k` hanya diketahui owner, dan mencari `k` dari `R = k×G` adalah masalah discrete logarithm yang **computationally infeasible**

---

## 📦 Anatomi 65 Byte Signature

Hasil signing adalah **65 byte** yang di-encode sebagai:

```
Bytes [0  - 31] = r  (32 bytes) = koordinat-x titik R = k×G
Bytes [32 - 63] = s  (32 bytes) = bukti pengetahuan private key
Bytes [64     ] = v  ( 1 byte ) = 27 atau 28 (parity y dari titik R)
```

### Peran r, s, v secara mendalam:

#### 🔴 `r` — "Dimana saya commit"
- `r = R.x mod n` dimana `R = k × G`
- Ini adalah **komitmen** terhadap nonce `k` yang dipilih secara acak
- Signer harus "commit" dulu ke satu titik di kurva, sebelum bisa membuat bukti

#### 🟢 `s` — "Bukti saya tahu private key"
- `s = k⁻¹ × (hash + r × privateKey) mod n`
- Formula ini **mengikat** message hash dengan private key, melalui nonce `k`
- Tanpa `privateKey`, mustahil menghasilkan `s` yang valid untuk `r` tersebut
- Verifier bisa cek konsistensi antara `r` dan `s` tanpa tahu `privateKey`

#### 🔵 `v` — "Penanda y-koordinat"
- Kurva `y² = x³ + 7` punya **dua solusi y** untuk setiap x
- Jika hanya diberikan `r` (= R.x), ada ambiguitas: R yang mana?
- `v = 27` atau `v = 28` memberi tahu verifier solusi y mana yang dipakai
- Tanpa `v`, recovery point R akan ambigu dan signer tidak bisa di-recover

---

## 🔍 Proses Recovery: Contract Membuktikan Siapa yang Sign

Ini yang dilakukan `ecrecover` di baris 195:

```solidity
signer = ecrecover(ethSignedHash, v, r, s);
```

### Matematika di dalam ecrecover:

```
Input : (h, v, r, s)
Output: address signer

1. Dari r dan v, rekonstruksi titik R:
   x_R = r
   y_R = sqrt(x_R³ + 7) mod p  ← v menentukan tanda y (positif/negatif)

2. Hitung r_inv = r⁻¹ mod n  (modular inverse)

3. u1 = -h × r_inv mod n
   u2 = s × r_inv mod n

4. Recover public key: Q = u1×G + u2×R
   (ini bisa dilakukan tanpa tahu privateKey!)

5. address = keccak256(Q.x || Q.y)[12:]
             ↑ ambil 20 byte terakhir dari hash public key
```

**Mengapa ini bisa bekerja?** Substitusi balik:
- Kita tahu `s = k⁻¹(h + r×pk)` → maka `k = s⁻¹(h + r×pk)`
- Juga `R = k×G` dan `r = R.x`
- Dengan manipulasi aljabar: `Q = s⁻¹(h×G + r×pk×G) = s⁻¹(h×G + r×PubKey)`
- Dan karena `PubKey = pk×G` sudah di-embed dalam `r` dan `s`, kita bisa recover `Q = PubKey` !

---

## 🛡️ Security Check: Anti-Malleability (Baris 182–185)

```solidity
require(
    uint256(s) <= 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0,
    "ECDSA: s value too high (malleable)"
);
```

**Masalah yang dicegah:** Untuk setiap signature valid `(r, s, v)`, ada signature valid lain `(r, n-s, 28-v+27)`. Ini bisa dieksploitasi untuk **replay attack** — seseorang bisa memodifikasi signature lama menjadi "signature baru" yang tetap valid, lalu replay ke contract.

**Solusi:** Require `s ≤ n/2`. Dengan ini, hanya **satu dari dua versi** signature yang valid, menghilangkan ambiguitas.

---

## 🔗 Flow Lengkap di TranscriptChain

```
DEVICE OWNER                           BLOCKCHAIN
─────────────────────────────────────────────────────────────

1. Frontend hitung messageHash:
   keccak256(tokenId || contractAddr || "VERIFY_TRANSCRIPT")

2. MetaMask tambahkan EIP-191 prefix:
   h_final = keccak256("\x19Eth Signed...\n32" || messageHash)

3. MetaMask sign dengan private key:
   (r, s, v) = ECDSA.sign(h_final, privateKey)
   
4. Frontend kirim transaksi:
   approveVerification(tokenId, signature=[r||s||v], verifier)
                                                  │
                                                  ▼
5. Contract reconstruct messageHash:
   keccak256(tokenId || address(this) || "VERIFY_TRANSCRIPT")

6. ECDSA.verify() → toEthSignedMessageHash() → recover()

7. ecrecover(h_final, v, r, s) → address signer

8. Bandingkan: signer == ownerOf(tokenId)?
   ✅ YES → verifiedBy[tokenId][verifier] = true
   ❌ NO  → revert "invalid owner signature"
```

---

## 🎯 Kenapa Ini "Digital Signature"?

| Properti | Bagaimana dicapai |
|----------|------------------|
| **Authenticity** (hanya owner yang bisa sign) | Private key hanya diketahui owner; tanpa itu `s` tidak bisa dibuat valid |
| **Integrity** (pesan tidak bisa diubah) | `messageHash` ikut dikalkulasi dalam `s`; ubah pesan → `s` invalid |
| **Non-repudiation** (tidak bisa menyangkal) | Hanya pemegang private key yang bisa hasilkan signature; on-chain immutable |
| **Replay protection** | `tokenId` + `address(this)` di dalam message; `s ≤ n/2` anti-malleability |

---

> 💡 **Singkatnya:** Rumus `s = k⁻¹ × (hash + r × privateKey) mod n` adalah "lem" yang mengikat **pesan spesifik** dengan **private key spesifik**, menghasilkan 65 byte yang bisa diverifikasi siapa saja — tapi hanya bisa diproduksi oleh pemilik private key tersebut.
