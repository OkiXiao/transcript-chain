/**
 * ============================================================
 *  ECDSA FROM SCRATCH - secp256k1 Elliptic Curve Implementation
 * ============================================================
 * 
 * Implementasi lengkap ECDSA (Elliptic Curve Digital Signature Algorithm)
 * menggunakan kurva secp256k1 yang dipakai Ethereum/Bitcoin.
 * 
 * Dibangun TANPA library kriptografi — hanya menggunakan JavaScript native BigInt.
 * 
 * Referensi Matematika:
 * - Kurva: y² ≡ x³ + ax + b (mod p)  dimana a=0, b=7
 * - Operasi titik: Point Addition, Point Doubling, Scalar Multiplication
 * - Signing: s = k⁻¹ * (hash + r * privateKey) mod n
 * - Verification: Recover R from (r, s, hash), check R.x ≡ r (mod n)
 */

// ============================================================
//                 secp256k1 CURVE PARAMETERS
// ============================================================

/**
 * Kurva secp256k1: y² = x³ + 7 (mod p)
 * 
 * p = prime modulus (ukuran finite field)
 * a, b = koefisien kurva
 * G = generator point (base point)
 * n = order of G (jumlah titik pada kurva yang dihasilkan G)
 * h = cofactor
 */
const CURVE = {
    // Field prime: p = 2²⁵⁶ - 2³² - 977
    p: 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2Fn,

    // Curve coefficients: y² = x³ + ax + b
    a: 0n,
    b: 7n,

    // Generator point G
    Gx: 0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798n,
    Gy: 0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8n,

    // Order of G (jumlah titik valid pada kurva)
    n: 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n,

    // Cofactor
    h: 1n,
};

// ============================================================
//              MODULAR ARITHMETIC (FINITE FIELD)
// ============================================================

/**
 * Modular addition: (a + b) mod m
 * Rumus langsung, hasil selalu positif
 */
function modAdd(a, b, m) {
    return ((a % m) + (b % m)) % m;
}

/**
 * Modular subtraction: (a - b) mod m
 * Tambah m untuk memastikan hasil positif
 */
function modSub(a, b, m) {
    return ((a % m) - (b % m) + m) % m;
}

/**
 * Modular multiplication: (a * b) mod m
 */
function modMul(a, b, m) {
    return ((a % m) * (b % m)) % m;
}

/**
 * Modular exponentiation: (base^exp) mod m
 * Menggunakan metode "square-and-multiply" (binary exponentiation)
 * 
 * Algoritma:
 * 1. Representasikan exp dalam binary
 * 2. Untuk setiap bit dari MSB ke LSB:
 *    - Square hasil sementara
 *    - Jika bit = 1, multiply dengan base
 * 
 * Kompleksitas: O(log exp) — jauh lebih efisien dari naive O(exp)
 */
function modPow(base, exp, m) {
    if (m === 1n) return 0n;

    base = ((base % m) + m) % m;
    let result = 1n;

    while (exp > 0n) {
        // Jika bit terkecil = 1, multiply
        if (exp & 1n) {
            result = (result * base) % m;
        }
        // Square base
        base = (base * base) % m;
        // Shift right (next bit)
        exp >>= 1n;
    }

    return result;
}

/**
 * Modular multiplicative inverse: a⁻¹ mod m
 * Menggunakan Fermat's Little Theorem:
 *   Jika m adalah prime, maka a⁻¹ ≡ a^(m-2) mod m
 * 
 * Bukti:
 *   Fermat's Little Theorem: a^(m-1) ≡ 1 (mod m) untuk prime m
 *   Maka: a * a^(m-2) ≡ a^(m-1) ≡ 1 (mod m)
 *   Jadi: a⁻¹ ≡ a^(m-2) (mod m)
 */
function modInverse(a, m) {
    a = ((a % m) + m) % m;
    if (a === 0n) throw new Error("No modular inverse for zero");
    return modPow(a, m - 2n, m);
}

// ============================================================
//          ELLIPTIC CURVE POINT OPERATIONS
// ============================================================

/**
 * Representasi titik pada kurva elliptik
 * Point at infinity (identitas) direpresentasikan sebagai null
 */

/**
 * Cek apakah titik berada pada kurva secp256k1
 * Verifikasi: y² ≡ x³ + 7 (mod p)
 */
function isOnCurve(point) {
    if (point === null) return true; // Point at infinity selalu valid

    const { p, a, b } = CURVE;
    const [x, y] = point;

    // Hitung sisi kiri: y²  mod p
    const left = modPow(y, 2n, p);

    // Hitung sisi kanan: x³ + ax + b mod p
    const right = modAdd(
        modAdd(modPow(x, 3n, p), modMul(a, x, p), p),
        b,
        p
    );

    return left === right;
}

/**
 * POINT ADDITION: P + Q
 * 
 * Diberikan dua titik P = (x₁, y₁) dan Q = (x₂, y₂) pada kurva,
 * hasilnya R = P + Q = (x₃, y₃) dihitung sebagai:
 * 
 * Jika P ≠ Q:
 *   λ (slope) = (y₂ - y₁) / (x₂ - x₁) mod p
 *              = (y₂ - y₁) * (x₂ - x₁)⁻¹ mod p
 * 
 * x₃ = λ² - x₁ - x₂ mod p
 * y₃ = λ(x₁ - x₃) - y₁ mod p
 * 
 * Kasus khusus:
 * - P = O (infinity): return Q
 * - Q = O (infinity): return P
 * - P = -Q (x sama, y berlawanan): return O
 * - P = Q: gunakan point doubling
 */
function pointAdd(P, Q) {
    // Identitas: P + O = P
    if (P === null) return Q;
    if (Q === null) return P;

    const { p } = CURVE;
    const [x1, y1] = P;
    const [x2, y2] = Q;

    // Jika x sama
    if (x1 === x2) {
        // P = -Q → return point at infinity
        if (y1 !== y2) return null;
        // P = Q → gunakan point doubling
        return pointDouble(P);
    }

    // Hitung slope: λ = (y₂ - y₁) * (x₂ - x₁)⁻¹ mod p
    const dy = modSub(y2, y1, p);
    const dx = modSub(x2, x1, p);
    const lambda = modMul(dy, modInverse(dx, p), p);

    // x₃ = λ² - x₁ - x₂ mod p
    const x3 = modSub(modSub(modPow(lambda, 2n, p), x1, p), x2, p);

    // y₃ = λ(x₁ - x₃) - y₁ mod p
    const y3 = modSub(modMul(lambda, modSub(x1, x3, p), p), y1, p);

    return [x3, y3];
}

/**
 * POINT DOUBLING: 2P = P + P
 * 
 * Ketika kita menjumlahkan titik dengan dirinya sendiri,
 * slope dihitung menggunakan turunan implisit dari persamaan kurva.
 * 
 * Untuk y² = x³ + ax + b:
 *   2y·dy = 3x²·dx + a·dx
 *   dy/dx = (3x² + a) / (2y)
 * 
 * Maka:
 *   λ = (3x₁² + a) / (2y₁) mod p
 *     = (3x₁² + a) * (2y₁)⁻¹ mod p
 * 
 * x₃ = λ² - 2x₁ mod p
 * y₃ = λ(x₁ - x₃) - y₁ mod p
 * 
 * Kasus khusus: jika y₁ = 0, return O (titik pada tangent vertikal)
 */
function pointDouble(P) {
    if (P === null) return null;

    const { p, a } = CURVE;
    const [x, y] = P;

    // Tangent vertikal → point at infinity
    if (y === 0n) return null;

    // λ = (3x² + a) * (2y)⁻¹ mod p
    const numerator = modAdd(modMul(3n, modPow(x, 2n, p), p), a, p);
    const denominator = modMul(2n, y, p);
    const lambda = modMul(numerator, modInverse(denominator, p), p);

    // x₃ = λ² - 2x mod p
    const x3 = modSub(modPow(lambda, 2n, p), modMul(2n, x, p), p);

    // y₃ = λ(x - x₃) - y mod p
    const y3 = modSub(modMul(lambda, modSub(x, x3, p), p), y, p);

    return [x3, y3];
}

/**
 * SCALAR MULTIPLICATION: k * P (Double-and-Add Algorithm)
 * 
 * Menghitung k kali titik P menggunakan metode "double-and-add"
 * yang analog dengan "square-and-multiply" untuk bilangan biasa.
 * 
 * Algoritma:
 * 1. Mulai dari R = O (infinity)
 * 2. Untuk setiap bit k dari MSB ke LSB:
 *    a. R = 2R (double)
 *    b. Jika bit = 1: R = R + P (add)
 * 
 * Contoh: 13P dimana 13 = 1101 binary
 *   Bit 1: R = 2O + P = P
 *   Bit 1: R = 2P + P = 3P
 *   Bit 0: R = 6P
 *   Bit 1: R = 12P + P = 13P
 * 
 * Kompleksitas: O(log k) operasi titik
 */
function scalarMultiply(k, P) {
    if (k === 0n) return null;
    if (P === null) return null;

    // Normalisasi k ke positif mod n
    k = ((k % CURVE.n) + CURVE.n) % CURVE.n;

    let result = null;  // Point at infinity (identitas)
    let current = P;

    while (k > 0n) {
        // Jika bit terkecil = 1, tambahkan current ke result
        if (k & 1n) {
            result = pointAdd(result, current);
        }
        // Double current
        current = pointDouble(current);
        // Shift right (next bit)
        k >>= 1n;
    }

    return result;
}

// ============================================================
//                      KECCAK-256 HASH
// ============================================================

/**
 * Keccak-256 constants
 * Keccak menggunakan state 5x5x64 bits = 1600 bits
 * Rate untuk Keccak-256 = 1088 bits, Capacity = 512 bits
 */

// Round constants untuk Keccak-f[1600] (24 rounds)
const KECCAK_RC = [
    0x0000000000000001n, 0x0000000000008082n, 0x800000000000808An,
    0x8000000080008000n, 0x000000000000808Bn, 0x0000000080000001n,
    0x8000000080008081n, 0x8000000000008009n, 0x000000000000008An,
    0x0000000000000088n, 0x0000000080008009n, 0x000000008000000An,
    0x000000008000808Bn, 0x800000000000008Bn, 0x8000000000008089n,
    0x8000000000008003n, 0x8000000000008002n, 0x8000000000000080n,
    0x000000000000800An, 0x800000008000000An, 0x8000000080008081n,
    0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
];

// Rotation offsets untuk ρ step
const KECCAK_ROT = [
    [0, 36, 3, 41, 18],
    [1, 44, 10, 45, 2],
    [62, 6, 43, 15, 61],
    [28, 55, 25, 21, 56],
    [27, 20, 39, 8, 14],
];

/**
 * 64-bit rotation left (dalam BigInt)
 */
function rotl64(x, n) {
    n = BigInt(n);
    return ((x << n) | (x >> (64n - n))) & 0xFFFFFFFFFFFFFFFFn;
}

/**
 * Keccak-f[1600] permutation (24 rounds)
 * State = 5x5 array of 64-bit words
 * 
 * Setiap round terdiri dari 5 step:
 * θ (theta): Column parity mixing
 * ρ (rho):   Bitwise rotation
 * π (pi):    Position permutation  
 * χ (chi):   Non-linear mixing
 * ι (iota):  Round constant addition
 */
function keccakF1600(state) {
    for (let round = 0; round < 24; round++) {
        // θ step: XOR each column, then apply to adjacent columns
        const C = new Array(5);
        for (let x = 0; x < 5; x++) {
            C[x] = state[x][0] ^ state[x][1] ^ state[x][2] ^ state[x][3] ^ state[x][4];
        }
        const D = new Array(5);
        for (let x = 0; x < 5; x++) {
            D[x] = C[(x + 4) % 5] ^ rotl64(C[(x + 1) % 5], 1);
        }
        for (let x = 0; x < 5; x++) {
            for (let y = 0; y < 5; y++) {
                state[x][y] ^= D[x];
                state[x][y] &= 0xFFFFFFFFFFFFFFFFn;
            }
        }

        // ρ and π steps combined
        const B = Array.from({ length: 5 }, () => new Array(5).fill(0n));
        for (let x = 0; x < 5; x++) {
            for (let y = 0; y < 5; y++) {
                B[y][(2 * x + 3 * y) % 5] = rotl64(state[x][y], KECCAK_ROT[x][y]);
            }
        }

        // χ step: Non-linear operation
        for (let x = 0; x < 5; x++) {
            for (let y = 0; y < 5; y++) {
                state[x][y] = (B[x][y] ^ ((~B[(x + 1) % 5][y] & 0xFFFFFFFFFFFFFFFFn) & B[(x + 2) % 5][y])) & 0xFFFFFFFFFFFFFFFFn;
            }
        }

        // ι step: XOR round constant
        state[0][0] ^= KECCAK_RC[round];
        state[0][0] &= 0xFFFFFFFFFFFFFFFFn;
    }

    return state;
}

/**
 * Keccak-256 hash function
 * Input: Uint8Array
 * Output: Uint8Array (32 bytes)
 * 
 * Steps:
 * 1. Pad input to multiple of rate (136 bytes for Keccak-256)
 * 2. Absorb: XOR padded blocks into state, apply Keccak-f
 * 3. Squeeze: Extract hash from state
 */
function keccak256(input) {
    if (typeof input === 'string') {
        // Convert hex string to Uint8Array
        if (input.startsWith('0x')) input = input.slice(2);
        const bytes = new Uint8Array(input.length / 2);
        for (let i = 0; i < bytes.length; i++) {
            bytes[i] = parseInt(input.substr(i * 2, 2), 16);
        }
        input = bytes;
    }

    const rate = 136; // Rate in bytes (1088 bits / 8)

    // Padding: Keccak uses pad10*1
    // Append 0x01, then zeros, then set last byte |= 0x80
    const padLen = rate - (input.length % rate);
    const padded = new Uint8Array(input.length + padLen);
    padded.set(input);
    padded[input.length] = 0x01;
    padded[padded.length - 1] |= 0x80;

    // Initialize state: 5x5 array of 64-bit zeros
    const state = Array.from({ length: 5 }, () => new Array(5).fill(0n));

    // Absorb phase
    for (let offset = 0; offset < padded.length; offset += rate) {
        // XOR block into state (little-endian 64-bit words)
        for (let i = 0; i < rate / 8; i++) {
            const byteOffset = offset + i * 8;
            let lane = 0n;
            for (let b = 0; b < 8; b++) {
                lane |= BigInt(padded[byteOffset + b]) << BigInt(b * 8);
            }
            const x = i % 5;
            const y = Math.floor(i / 5);
            state[x][y] ^= lane;
            state[x][y] &= 0xFFFFFFFFFFFFFFFFn;
        }
        keccakF1600(state);
    }

    // Squeeze phase: extract 32 bytes (256 bits)
    const hash = new Uint8Array(32);
    for (let i = 0; i < 4; i++) {
        const x = i % 5;
        const y = Math.floor(i / 5);
        const lane = state[x][y];
        for (let b = 0; b < 8; b++) {
            hash[i * 8 + b] = Number((lane >> BigInt(b * 8)) & 0xFFn);
        }
    }

    return hash;
}

/**
 * Convert Uint8Array to hex string
 */
function bytesToHex(bytes) {
    return '0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Convert hex string to BigInt
 */
function hexToBigInt(hex) {
    if (hex.startsWith('0x')) hex = hex.slice(2);
    return BigInt('0x' + hex);
}

/**
 * Convert BigInt to 32-byte hex string
 */
function bigIntToHex(n) {
    return '0x' + n.toString(16).padStart(64, '0');
}

/**
 * Convert string to UTF-8 Uint8Array
 */
function stringToBytes(str) {
    return new TextEncoder().encode(str);
}

// ============================================================
//               ECDSA SIGN & VERIFY (FROM SCRATCH)
// ============================================================

/**
 * Generate public key from private key
 * 
 * Rumus: publicKey = privateKey * G
 * dimana G adalah generator point dari secp256k1
 * 
 * @param {BigInt} privateKey - Private key (256-bit integer)
 * @returns {[BigInt, BigInt]} - Public key point (x, y)
 */
function getPublicKey(privateKey) {
    const G = [CURVE.Gx, CURVE.Gy];
    return scalarMultiply(privateKey, G);
}

/**
 * Convert public key to Ethereum address
 * 
 * Proses:
 * 1. Ambil public key (x, y) — 64 bytes total
 * 2. Hash dengan Keccak-256
 * 3. Ambil 20 bytes terakhir sebagai address
 * 
 * @param {[BigInt, BigInt]} publicKey - Public key point
 * @returns {string} - Ethereum address (0x-prefixed)
 */
function publicKeyToAddress(publicKey) {
    const [x, y] = publicKey;

    // Concatenate x and y coordinates (each 32 bytes)
    const pubBytes = new Uint8Array(64);
    const xHex = x.toString(16).padStart(64, '0');
    const yHex = y.toString(16).padStart(64, '0');

    for (let i = 0; i < 32; i++) {
        pubBytes[i] = parseInt(xHex.substr(i * 2, 2), 16);
        pubBytes[32 + i] = parseInt(yHex.substr(i * 2, 2), 16);
    }

    // Keccak-256 hash of the public key
    const hash = keccak256(pubBytes);

    // Take last 20 bytes as address
    const addressBytes = hash.slice(12);
    return '0x' + Array.from(addressBytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * ECDSA SIGN - Create digital signature
 * 
 * Algoritma:
 * 1. Hash pesan: z = hash(message) — sudah diberikan sebagai parameter
 * 2. Pilih random k (1 < k < n)
 * 3. Hitung R = k * G
 * 4. r = R.x mod n    (jika r = 0, pilih k baru)
 * 5. s = k⁻¹ * (z + r * privateKey) mod n    (jika s = 0, pilih k baru)
 * 6. Return signature (r, s, v)
 * 
 * Keamanan:
 * - k HARUS random dan UNIK untuk setiap signature
 * - Jika k sama dipakai dua kali, private key bisa dihitung!
 *   (kasus terkenal: PlayStation 3 hack 2010)
 * 
 * @param {Uint8Array | string} messageHash - 32-byte hash of the message
 * @param {BigInt} privateKey - Signer's private key
 * @returns {{r: BigInt, s: BigInt, v: number}} - Signature components
 */
function ecdsaSign(messageHash, privateKey) {
    if (typeof messageHash === 'string') {
        messageHash = hexToBigInt(messageHash);
    } else if (messageHash instanceof Uint8Array) {
        messageHash = hexToBigInt(bytesToHex(messageHash));
    }

    const { n, Gx, Gy } = CURVE;
    const G = [Gx, Gy];

    // Get public key for v calculation
    const pubKey = scalarMultiply(privateKey, G);

    let r, s, v;

    // Loop until valid r and s are found
    while (true) {
        // Generate deterministic k using RFC 6979-like approach
        // In production, use proper RFC 6979. Here we use a simple HMAC-based approach.
        const k = generateK(messageHash, privateKey, n);

        // R = k * G
        const R = scalarMultiply(k, G);
        if (R === null) continue;

        // r = R.x mod n
        r = R[0] % n;
        if (r === 0n) continue;

        // Determine v (recovery id)
        // v = 27 if R.y is even, 28 if R.y is odd
        v = (R[1] % 2n === 0n) ? 27 : 28;

        // s = k⁻¹ * (messageHash + r * privateKey) mod n
        const kInv = modInverse(k, n);
        s = modMul(kInv, modAdd(messageHash, modMul(r, privateKey, n), n), n);
        if (s === 0n) continue;

        // Ensure s is in lower half of n to prevent malleability
        // If s > n/2, replace with n - s and flip v
        if (s > n / 2n) {
            s = n - s;
            v = v === 27 ? 28 : 27;
        }

        break;
    }

    return { r, s, v };
}

/**
 * Generate deterministic k value (simplified RFC 6979)
 * 
 * RFC 6979 generates k deterministically from the message hash and private key
 * to avoid the need for a random number generator.
 * 
 * Simplified version: k = hash(privateKey || messageHash || counter) mod n
 * Counter prevents k reuse if hash collides (extremely unlikely)
 */
function generateK(messageHash, privateKey, n) {
    const privHex = privateKey.toString(16).padStart(64, '0');
    const msgHex = (typeof messageHash === 'bigint' ? messageHash : hexToBigInt(bytesToHex(messageHash)))
        .toString(16).padStart(64, '0');

    for (let counter = 0; counter < 1000; counter++) {
        const counterHex = counter.toString(16).padStart(8, '0');
        const data = privHex + msgHex + counterHex;
        const hashBytes = keccak256(data);
        const k = hexToBigInt(bytesToHex(hashBytes));

        if (k > 0n && k < n) {
            return k;
        }
    }

    throw new Error('Failed to generate valid k');
}

/**
 * ECDSA VERIFY - Verify digital signature
 * 
 * Algoritma:
 * 1. Periksa r dan s valid (1 ≤ r, s < n)
 * 2. Hitung w = s⁻¹ mod n
 * 3. Hitung u₁ = (z * w) mod n    dimana z = message hash
 * 4. Hitung u₂ = (r * w) mod n
 * 5. Hitung titik: R' = u₁*G + u₂*Q    dimana Q = public key
 * 6. Signature valid jika R'.x mod n === r
 * 
 * Matematika di balik verifikasi:
 *   R' = u₁*G + u₂*Q
 *      = (z * s⁻¹)*G + (r * s⁻¹)*Q
 *      = (z * s⁻¹)*G + (r * s⁻¹)*(privKey * G)
 *      = ((z + r*privKey) * s⁻¹) * G
 *      = ((z + r*privKey) * (k/(z + r*privKey))) * G    [karena s = k⁻¹*(z + r*privKey)]
 *      = k * G
 *      = R    (titik asli saat signing!)
 * 
 * Maka R'.x === R.x === r ✓
 * 
 * @param {BigInt | string} messageHash - 32-byte hash
 * @param {{r: BigInt, s: BigInt}} signature - Signature to verify
 * @param {[BigInt, BigInt]} publicKey - Signer's public key
 * @returns {boolean} - True if signature is valid
 */
function ecdsaVerify(messageHash, signature, publicKey) {
    if (typeof messageHash === 'string') {
        messageHash = hexToBigInt(messageHash);
    }

    const { n, Gx, Gy } = CURVE;
    const G = [Gx, Gy];
    const { r, s } = signature;

    // Step 1: Validate r and s
    if (r <= 0n || r >= n) return false;
    if (s <= 0n || s >= n) return false;

    // Step 2: w = s⁻¹ mod n
    const w = modInverse(s, n);

    // Step 3: u₁ = (z * w) mod n
    const u1 = modMul(messageHash, w, n);

    // Step 4: u₂ = (r * w) mod n
    const u2 = modMul(r, w, n);

    // Step 5: R' = u₁*G + u₂*Q
    const u1G = scalarMultiply(u1, G);
    const u2Q = scalarMultiply(u2, publicKey);
    const R = pointAdd(u1G, u2Q);

    // R should not be point at infinity
    if (R === null) return false;

    // Step 6: Check R'.x mod n === r
    return R[0] % n === r;
}

/**
 * ECDSA RECOVER - Recover public key from signature
 * 
 * Diberikan (messageHash, r, s, v), recover public key Q:
 * 1. Dari r dan v, tentukan titik R pada kurva
 * 2. Hitung r_inv = r⁻¹ mod n
 * 3. u₁ = -messageHash * r_inv mod n
 * 4. u₂ = s * r_inv mod n
 * 5. Q = u₁*G + u₂*R
 * 
 * @param {BigInt | string} messageHash - 32-byte hash
 * @param {{r: BigInt, s: BigInt, v: number}} signature - Signature with recovery id
 * @returns {[BigInt, BigInt]} - Recovered public key
 */
function ecdsaRecover(messageHash, signature) {
    if (typeof messageHash === 'string') {
        messageHash = hexToBigInt(messageHash);
    }

    const { p, n, Gx, Gy } = CURVE;
    const G = [Gx, Gy];
    const { r, s, v } = signature;

    // Step 1: Recover R point from r
    // x_R = r (we assume r < p, which is almost always true for secp256k1)
    const x = r;

    // Compute y² = x³ + 7 mod p
    const ySquared = modAdd(modPow(x, 3n, p), 7n, p);

    // Compute y = sqrt(y²) mod p using Tonelli-Shanks (for p ≡ 3 mod 4, y = ySquared^((p+1)/4) mod p)
    let y = modPow(ySquared, (p + 1n) / 4n, p);

    // Choose correct y based on v (parity)
    // v=27 means y is even, v=28 means y is odd
    const isOdd = y % 2n === 1n;
    if ((v === 28 && !isOdd) || (v === 27 && isOdd)) {
        y = p - y;
    }

    const R = [x, y];

    // Step 2: r_inv = r⁻¹ mod n
    const rInv = modInverse(r, n);

    // Step 3: u₁ = -messageHash * r_inv mod n
    const u1 = modMul(n - (messageHash % n), rInv, n);

    // Step 4: u₂ = s * r_inv mod n 
    const u2 = modMul(s, rInv, n);

    // Step 5: Q = u₁*G + u₂*R
    const u1G = scalarMultiply(u1, G);
    const u2R = scalarMultiply(u2, R);
    const Q = pointAdd(u1G, u2R);

    return Q;
}

// ============================================================
//                  ETHEREUM-COMPATIBLE HELPERS
// ============================================================

/**
 * Create Ethereum signed message hash (EIP-191)
 * Prefix: "\x19Ethereum Signed Message:\n32"
 */
function ethSignedMessageHash(messageHash) {
    // "\x19Ethereum Signed Message:\n32" as bytes
    const prefix = new Uint8Array([
        0x19, 0x45, 0x74, 0x68, 0x65, 0x72, 0x65, 0x75, 0x6d, 0x20, // \x19Ethereum 
        0x53, 0x69, 0x67, 0x6e, 0x65, 0x64, 0x20,                     // Signed 
        0x4d, 0x65, 0x73, 0x73, 0x61, 0x67, 0x65, 0x3a,               // Message:
        0x0a, 0x33, 0x32                                                // \n32
    ]);

    let hashBytes;
    if (typeof messageHash === 'string') {
        const hex = messageHash.startsWith('0x') ? messageHash.slice(2) : messageHash;
        hashBytes = new Uint8Array(32);
        for (let i = 0; i < 32; i++) {
            hashBytes[i] = parseInt(hex.substr(i * 2, 2), 16);
        }
    } else if (messageHash instanceof Uint8Array) {
        hashBytes = messageHash;
    }

    // Concatenate prefix + hash
    const combined = new Uint8Array(prefix.length + hashBytes.length);
    combined.set(prefix);
    combined.set(hashBytes, prefix.length);

    return keccak256(combined);
}

/**
 * Format signature as 65-byte hex (for Ethereum compatibility)
 * Format: r (32 bytes) || s (32 bytes) || v (1 byte)
 */
function formatSignature(sig) {
    const rHex = sig.r.toString(16).padStart(64, '0');
    const sHex = sig.s.toString(16).padStart(64, '0');
    const vHex = sig.v.toString(16).padStart(2, '0');
    return '0x' + rHex + sHex + vHex;
}

/**
 * Parse 65-byte signature hex back to components
 */
function parseSignature(sigHex) {
    if (sigHex.startsWith('0x')) sigHex = sigHex.slice(2);
    return {
        r: BigInt('0x' + sigHex.slice(0, 64)),
        s: BigInt('0x' + sigHex.slice(64, 128)),
        v: parseInt(sigHex.slice(128, 130), 16),
    };
}

// ============================================================
//                        EXPORTS
// ============================================================

export {
    // Curve parameters
    CURVE,

    // Finite field arithmetic
    modAdd, modSub, modMul, modPow, modInverse,

    // Elliptic curve operations
    isOnCurve, pointAdd, pointDouble, scalarMultiply,

    // ECDSA operations
    getPublicKey, publicKeyToAddress,
    ecdsaSign, ecdsaVerify, ecdsaRecover,

    // Hashing
    keccak256, ethSignedMessageHash,

    // Utilities
    bytesToHex, hexToBigInt, bigIntToHex, stringToBytes,
    formatSignature, parseSignature,
};
