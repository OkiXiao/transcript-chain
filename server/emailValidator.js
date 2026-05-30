/**
 * emailValidator.js
 *
 * Validasi email sesuai aturan masing-masing role:
 *
 *   School  → domain harus berupa domain institusi pendidikan yang dikenal
 *   Student → email harus ada di database mahasiswa milik sekolah tertentu
 *   HR      → domain harus korporat (bukan webmail publik seperti gmail, yahoo, dll.)
 *
 * Alasan validasi dilakukan di backend (bukan smart contract):
 *   - Smart contract tidak dapat mengakses data eksternal (database, DNS)
 *   - Validasi regex on-chain sangat mahal secara gas
 *   - Backend menandatangani hasil validasi → kontrak hanya memverifikasi tanda tangan
 */

// ============================================================
//   DAFTAR DOMAIN PENDIDIKAN YANG DIAKUI (School Role)
// ============================================================

/**
 * Suffiks domain yang dianggap sebagai institusi pendidikan.
 * Daftar ini dapat diperluas sesuai kebutuhan regional.
 *
 * Logika: email diterima jika bagian setelah '@' berakhiran salah satu suffix ini.
 */
const EDUCATION_DOMAIN_SUFFIXES = [
    // Indonesia
    '.ac.id',       // Perguruan Tinggi (Universitas, Institut, Sekolah Tinggi)
    '.sch.id',      // Sekolah menengah
    '.edu.id',      // Institusi pendidikan lainnya

    // Internasional
    '.edu',         // Amerika Serikat & global
    '.ac.uk',       // Inggris
    '.edu.au',      // Australia
    '.ac.nz',       // Selandia Baru
    '.edu.sg',      // Singapura
    '.edu.my',      // Malaysia
    '.ac.jp',       // Jepang
    '.edu.cn',      // Tiongkok
    '.edu.in',      // India
    '.edu.br',      // Brasil
    '.edu.mx',      // Meksiko
    '.edu.co',      // Kolombia
    '.edu.ar',      // Argentina
    '.edu.pl',      // Polandia
    '.edu.tr',      // Turki
    '.edu.ng',      // Nigeria
    '.edu.gh',      // Ghana
    '.edu.pk',      // Pakistan
    '.ac.za',       // Afrika Selatan
    '.edu.eg',      // Mesir
];

// ============================================================
//   DAFTAR WEBMAIL PUBLIK YANG DIBLOKIR (HR Role)
// ============================================================

/**
 * Domain webmail publik yang TIDAK diizinkan untuk HR role.
 * HR harus menggunakan email domain perusahaan resmi.
 */
const PUBLIC_EMAIL_DOMAINS = new Set([
    'gmail.com', 'googlemail.com',
    'yahoo.com', 'yahoo.co.id', 'yahoo.co.uk', 'ymail.com',
    'hotmail.com', 'hotmail.co.uk', 'hotmail.fr',
    'outlook.com', 'outlook.co.id', 'live.com',
    'icloud.com', 'me.com', 'mac.com',
    'aol.com', 'aol.co.uk',
    'protonmail.com', 'proton.me',
    'zoho.com',
    'mail.com', 'email.com',
    'rocketmail.com',
    'inbox.com',
    'yandex.com', 'yandex.ru',
]);

// ============================================================
//   UTILITAS PARSING EMAIL
// ============================================================

/**
 * Ekstrak domain dari alamat email.
 * @param {string} email
 * @returns {{ local: string, domain: string } | null}
 */
function parseEmail(email) {
    if (typeof email !== 'string') return null;
    const trimmed = email.trim().toLowerCase();
    const atIndex = trimmed.lastIndexOf('@');
    if (atIndex < 1 || atIndex === trimmed.length - 1) return null;

    const local = trimmed.slice(0, atIndex);
    const domain = trimmed.slice(atIndex + 1);

    // Validasi format dasar: minimal ada satu titik di domain
    if (!domain.includes('.')) return null;
    // Tidak boleh ada karakter selain alphanumeric, titik, dan strip
    if (!/^[a-z0-9][a-z0-9.\-]*[a-z0-9]$/.test(domain)) return null;

    return { local, domain };
}

// ============================================================
//   VALIDATOR ROLE: SCHOOL
// ============================================================

/**
 * Validasi apakah email termasuk domain institusi pendidikan.
 *
 * @param {string} email
 * @returns {{ valid: boolean, reason: string }}
 *
 * @example
 *   validateSchoolEmail('admin@ui.ac.id')    → { valid: true, ... }
 *   validateSchoolEmail('user@gmail.com')    → { valid: false, reason: '...' }
 */
function validateSchoolEmail(email) {
    const parsed = parseEmail(email);
    if (!parsed) {
        return { valid: false, reason: 'Format email tidak valid.' };
    }

    const { domain } = parsed;

    const isEduDomain = EDUCATION_DOMAIN_SUFFIXES.some(suffix =>
        domain === suffix.slice(1) || // e.g. "ac.id"
        domain.endsWith(suffix)       // e.g. "ui.ac.id"
    );

    if (!isEduDomain) {
        return {
            valid: false,
            reason: `Domain "${domain}" bukan domain institusi pendidikan yang diakui. ` +
                    `Gunakan email institusi (contoh: @universitas.ac.id, @sekolah.sch.id, @mit.edu).`,
        };
    }

    return { valid: true, reason: 'Domain pendidikan valid.', domain };
}

// ============================================================
//   VALIDATOR ROLE: HR
// ============================================================

/**
 * Validasi apakah email termasuk domain korporat resmi (bukan webmail publik).
 *
 * @param {string} email
 * @returns {{ valid: boolean, reason: string }}
 *
 * @example
 *   validateHREmail('hr@tokopedia.com')   → { valid: true, ... }
 *   validateHREmail('hr@gmail.com')       → { valid: false, reason: '...' }
 */
function validateHREmail(email) {
    const parsed = parseEmail(email);
    if (!parsed) {
        return { valid: false, reason: 'Format email tidak valid.' };
    }

    const { domain } = parsed;

    // Tolak jika domain ada di daftar webmail publik
    if (PUBLIC_EMAIL_DOMAINS.has(domain)) {
        return {
            valid: false,
            reason: `Email dengan domain "${domain}" tidak diterima untuk role HR. ` +
                    `Gunakan email domain perusahaan resmi (contoh: @perusahaan.com, @company.co.id).`,
        };
    }

    // Juga tolak jika domain tampak seperti domain pendidikan (sekolah bukan HR)
    const looksLikeEdu = EDUCATION_DOMAIN_SUFFIXES.some(suffix =>
        domain === suffix.slice(1) || domain.endsWith(suffix)
    );
    if (looksLikeEdu) {
        return {
            valid: false,
            reason: `Domain "${domain}" terdeteksi sebagai domain pendidikan. ` +
                    `Untuk HR, gunakan email domain perusahaan.`,
        };
    }

    return { valid: true, reason: 'Domain korporat valid.', domain };
}

// ============================================================
//   VALIDATOR ROLE: STUDENT
// ============================================================

/**
 * Validasi apakah email mahasiswa terdaftar dalam database sekolah tertentu.
 *
 * Berbeda dengan School/HR, validasi Student memerlukan query ke database,
 * bukan hanya pengecekan domain. Fungsi ini hanya melakukan validasi format;
 * pemeriksaan keberadaan di DB dilakukan di auth.js menggunakan studentDb.
 *
 * @param {string} email
 * @returns {{ valid: boolean, reason: string }}
 */
function validateStudentEmailFormat(email) {
    const parsed = parseEmail(email);
    if (!parsed) {
        return { valid: false, reason: 'Format email tidak valid.' };
    }

    return { valid: true, reason: 'Format email valid. Menunggu verifikasi database sekolah.', domain: parsed.domain };
}

// ============================================================
//   EXPORTS
// ============================================================

export {
    validateSchoolEmail,
    validateHREmail,
    validateStudentEmailFormat,
    parseEmail,
    EDUCATION_DOMAIN_SUFFIXES,
    PUBLIC_EMAIL_DOMAINS,
};
