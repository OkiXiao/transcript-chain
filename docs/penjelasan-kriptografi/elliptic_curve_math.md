# 🎢 Cara Kerja Rumus y² = x³ + 7 (mod p)

Bagus sekali! Jika kamu sudah paham `G` dan `n`, memahami persamaan ini adalah langkah terakhir untuk menguasai pondasi matematika di balik Ethereum dan digital signature.

Mari kita bedah rumus **`y² = x³ + 7 (mod p)`** menjadi dua bagian utama agar mudah dipahami:

---

## Bagian 1: `y² = x³ + 7` (Persamaan Kurvanya)

Pernahkah kamu menggambar grafik fungsi matematika di sekolah, seperti garis lurus `y = 2x` atau parabola `y = x²`? 

Rumus `y² = x³ + 7` fungsinya sama persis. Jika kamu memasukkan berbagai nilai `x` dan mencari nilai `y`-nya, lalu menggambarnya di atas kertas grafik, kamu akan mendapatkan bentuk garis kurva yang meliuk unik dan simetris (seperti tapal kuda yang rebah).

Titik awal / Generator Point (`G`) yang punya koordinat `Gx` dan `Gy` yang kita bahas sebelumnya, **dijamin 100% terletak tepat di atas garis kurva ini**.

Sebagai contoh sederhana (tanpa angka jutaan):
Jika `x = 2`, maka `x³ + 7` = `2³ + 7` = `8 + 7` = `15`. 
Berarti `y² = 15`. Nilai `y` adalah akar dari 15.

Namun, komputer benci bilangan desimal (koma-komaan) karena tidak akurat. Oleh karena itu, kita butuh "sihir" tambahan yaitu **`mod p`**.

---

## Bagian 2: `(mod p)` atau Modulo Bilangan Prima

Inilah yang membedakan matematika biasa dengan **Kriptografi**.

`p` adalah sebuah angka batas maksimum yang sangat besar (bernilai *Prime Field Modulus*).
`(mod p)` atau "Modulo p" artinya: **Sisa hasil bagi dengan angka p**.

Bayangkan ini seperti **Jam Dinding**. Jam dinding itu "Modulo 12".
Jika sekarang jam 10 pagi, lalu kamu tambahkan 5 jam, hasilnya bukan jam 15, tapi jam 3 sore. Mengapa? Karena 15 dibagi 12 sisanya 3. Angkanya terus "berputar" tidak pernah melebihi 12.

**Apa efek `(mod p)` pada kurva kita?**
1. **Tidak ada bilangan desimal:** Semua nilai `x` dan `y` WAJIB berupa bilangan bulat (integers) dari `0` hingga `p - 1`. 
2. **Titik-titik tersebar:** Garis kurva yang asalnya mulus meliuk-liuk, tiba-tiba "pecah" menjadi titik-titik diskrit (bintik-bintik) yang tersebar secara acak seperti noise TV semut di dalam sebuah kotak batas `p x p`.
3. **Membungkus nilai:** Jika hasil perhitungan `x³ + 7` lebih besar dari `p`, maka angkanya akan "dibungkus/diputar balik" (dibagi `p` dan diambil sisa baginya), persis seperti jam dinding tadi.

---

## 🎯 Bagaimana Rumus Ini "Bekerja" untuk Kriptografi?

Cara rumus ini dipakai adalah dengan melakukan "Matematika Biliar" (Elliptic Curve Point Addition).

Bayangkan kamu punya Titik Start (`G`) di papan grafik tersebut.
1. Tarik garis lurus menyentuh kurva (garis singgung).
2. Garis lurus itu **pasti** akan menabrak satu titik lain di kurva.
3. Titik tabrakan itu kita balikkan (dicerminkan terhadap sumbu X) untuk mendapatkan titik baru, sebut saja **Titik 2G**.
4. Tarik garis lurus dari `G` ke `2G`, dia akan menabrak kurva lagi. Cerminkan lagi, dapat **Titik 3G**.
5. Lakukan ini terus-menerus. Setiap lompatan, koordinat `(x, y)` selalu disaring melewati `(mod p)` agar angkanya tidak bocor dan tetap berupa bilangan bulat.

### Hubungannya dengan Public Key & Private Key

Ingat sebelumnya bahwa **Public Key = Private Key × G** ?

Jika Private Key-mu adalah angka **`10`**, maka komputermu akan memproses rumus `y² = x³ + 7 (mod p)` ini untuk menghitung pantulan biliar dari `G` -> `2G` -> `3G` ... terus melompat sebanyak 10 kali. 

Titik koordinat X dan Y terakhir tempat kamu berhenti setelah lompatan ke-10, **itulah Public Key-mu!**

> 🛡️ **Kenapa sangat aman?**
Karena ada efek acak dari `(mod p)`, pola lompatan titik ini terlihat sangat kacau dan tak bisa ditebak polanya. 
Jika saya tahu koordinat akhirnya (Public Key kamu), dan saya tahu Titik Mulainya (`G`), **saya tetap tidak akan bisa menghitung mundur berapa kali lompatan yang terjadi (Private Key-mu)**. Ini seperti melihat bola biliar berhenti, dan disuruh menebak bola itu sudah memantul berapa kali. Sangat mustahil dipecahkan oleh superkomputer sekalipun!
