/**
 * Generate PDF 2 halaman (Ijazah + Transkrip) dari data nilai dan foto mahasiswa.
 * Upload ke Pinata, return pdfCID + photoCID + metadataURI.
 */
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { uploadBufferToPinata, uploadJSONToPinata } from '../lib/pinata.js';

const VALID_GRADES = ['A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'D', 'E'];

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // ── Action: parse transkrip dari gambar via Gemini Vision ──
    if (req.body?.action === 'parse') {
        const { imageBase64, mimeType = 'image/jpeg' } = req.body;
        if (!imageBase64) {
            return res.status(400).json({ success: false, error: 'imageBase64 wajib diisi.' });
        }
        const GROQ_API_KEY = process.env.GROQ_API_KEY;
        if (!GROQ_API_KEY) {
            return res.status(503).json({ success: false, error: 'GROQ_API_KEY belum dikonfigurasi di server.' });
        }
        try {
            const prompt = `Kamu adalah OCR engine untuk transkrip akademik Indonesia. Baca SELURUH tabel dari gambar ini dengan teliti.

Kembalikan HANYA JSON array, tanpa teks lain, tanpa markdown, tanpa penjelasan:
[{"kmk":"kode_mk","courseName":"nama_mata_kuliah","grade":"nilai_huruf","sks":jumlah_sks}]

Instruksi WAJIB:
- kmk: Baca kode mata kuliah dari kolom pertama tabel (biasanya format seperti TIF-101, CS201, MKU001, IF3110, dst). Baca dengan TELITI setiap karakter. HANYA gunakan MK-001, MK-002 dst jika kolom kode benar-benar kosong di gambar.
- courseName: nama mata kuliah lengkap persis seperti di tabel.
- grade: nilai huruf (A, A-, B+, B, B-, C+, C, D, E). Konversi angka: 4.0=A, 3.7=A-, 3.3=B+, 3.0=B, 2.7=B-, 2.3=C+, 2.0=C, 1.0=D, 0=E.
- sks: integer SKS dari kolom SKS. Default 3 jika tidak ada.

PENTING: Baca kolom kode mata kuliah seakurat mungkin. Jangan skip baris apapun.
Output: JSON array saja, tidak ada teks lain.`;

            const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${GROQ_API_KEY}`,
                },
                body: JSON.stringify({
                    model: 'meta-llama/llama-4-scout-17b-16e-instruct',
                    messages: [{
                        role: 'user',
                        content: [
                            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
                            { type: 'text', text: prompt },
                        ],
                    }],
                    temperature: 0.1,
                    max_tokens: 4096,
                }),
            });

            if (!groqRes.ok) {
                const errData = await groqRes.json().catch(() => ({}));
                throw new Error(errData.error?.message || `Groq API error: ${groqRes.status}`);
            }

            const groqData = await groqRes.json();
            const text = groqData.choices?.[0]?.message?.content || '';
            const jsonMatch = text.match(/\[[\s\S]*\]/);
            if (!jsonMatch) throw new Error('Tidak dapat membaca tabel dari gambar. Pastikan foto cukup jelas dan mengandung tabel nilai.');

            const raw = JSON.parse(jsonMatch[0]);
            const grades = raw
                .filter(g => g.courseName?.trim())
                .map(g => ({
                    kmk: String(g.kmk || '').trim(),
                    courseName: String(g.courseName || '').trim(),
                    grade: VALID_GRADES.includes(g.grade) ? g.grade : 'A',
                    sks: Math.max(1, Math.min(12, parseInt(g.sks) || 3)),
                }));

            if (grades.length === 0) throw new Error('Tidak ada data nilai yang ditemukan. Coba foto yang lebih jelas.');
            return res.json({ success: true, grades, count: grades.length });
        } catch (err) {
            console.error('[upload-pdf/parse]', err);
            return res.status(500).json({ success: false, error: err.message || 'Gagal mengekstrak data.' });
        }
    }

    const {
        studentName, nim, schoolName, schoolWallet, studentWallet, grades,
        birthPlace, birthDate, faculty, major, degree, photoBase64,
    } = req.body;

    if (!studentName || !nim || !schoolWallet || !studentWallet) {
        return res.status(400).json({ success: false, error: 'Field wajib: studentName, nim, schoolWallet, studentWallet.' });
    }

    const gradesArr = Array.isArray(grades) ? grades : [];
    const verifyURL = 'https://transcript-chain-six.vercel.app/verify';
    const issuedAt = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    const displaySchool = schoolName || schoolWallet;

    try {
        // Upload foto ke IPFS (jika ada)
        let photoCID = '';
        let photoBuffer = null;
        if (photoBase64) {
            photoBuffer = Buffer.from(photoBase64, 'base64');
            const photoRes = await uploadBufferToPinata(photoBuffer, `foto_${nim}_${Date.now()}.jpg`, 'image/jpeg');
            photoCID = photoRes.IpfsHash;
        }

        // Generate QR code
        const qrBuffer = await QRCode.toBuffer(verifyURL, {
            type: 'png', width: 100, margin: 1,
            color: { dark: '#000000', light: '#ffffff' },
        });

        // Generate PDF
        const pdfBuffer = await generatePDF({
            studentName, nim, schoolName: displaySchool, schoolWallet,
            grades: gradesArr, issuedAt, qrBuffer, photoBuffer,
            birthPlace: birthPlace || '', birthDate: birthDate || '',
            faculty: faculty || '', major: major || '', degree: degree || '',
        });

        // Upload PDF ke Pinata
        const pdfRes = await uploadBufferToPinata(pdfBuffer, `ijazah_${nim}_${Date.now()}.pdf`);
        const pdfCID = pdfRes.IpfsHash;

        // Upload metadata JSON
        const metadata = {
            name: `Ijazah & Transkrip - ${studentName}`,
            description: 'Ijazah dan Transkrip Akademik Terverifikasi di Blockchain via TranscriptChain',
            image: photoCID ? `ipfs://${photoCID}` : `ipfs://${pdfCID}`,
            external_url: `https://gateway.pinata.cloud/ipfs/${pdfCID}`,
            attributes: [
                { trait_type: 'Student Name', value: studentName },
                { trait_type: 'NIM', value: nim },
                { trait_type: 'Faculty', value: faculty || '' },
                { trait_type: 'Major', value: major || '' },
                { trait_type: 'Degree', value: degree || '' },
                { trait_type: 'School Wallet', value: schoolWallet.toLowerCase() },
                { trait_type: 'Total Courses', value: gradesArr.length },
                { trait_type: 'Issue Date', value: new Date().toISOString() },
            ],
            grades: gradesArr,
            pdfCID,
            photoCID,
            birthPlace: birthPlace || '',
            birthDate: birthDate || '',
            faculty: faculty || '',
            major: major || '',
            degree: degree || '',
        };

        const metaRes = await uploadJSONToPinata(metadata, `metadata_${nim}_${Date.now()}`);
        const metadataURI = `ipfs://${metaRes.IpfsHash}`;

        return res.json({ success: true, pdfCID, photoCID, metadataURI, pdfURL: `https://gateway.pinata.cloud/ipfs/${pdfCID}` });
    } catch (err) {
        console.error('[school/upload-pdf]', err);
        return res.status(500).json({ success: false, error: err.message || 'Internal server error.' });
    }
}

// ──────────────────────────────────────────────────────────
// Helper: generate consistent diploma numbers from data
// ──────────────────────────────────────────────────────────
function generateDiplomaNumbers(nim, schoolWallet, issuedAt) {
    const yearStr = issuedAt.split(' ').pop();
    const year = parseInt(yearStr) || new Date().getFullYear();
    const yearShort = String(year).slice(-3); // e.g. "024" for 2024

    // Deterministic hash from wallet address
    const walletLow = schoolWallet.toLowerCase();
    const walletHash = Array.from(walletLow).reduce((acc, c) => (acc * 31 + c.charCodeAt(0)) >>> 0, 0);

    // Province codes (BPS Indonesia, 11–94)
    const PROV_CODES = [
        '11','12','13','14','15','16','17','18','19','21',
        '31','32','33','34','35','36',
        '51','52','53',
        '61','62','63','64','65',
        '71','72','73','74','75','76',
        '81','82','91','94',
    ];
    const provCode  = PROV_CODES[walletHash % PROV_CODES.length];
    const kabCode   = String(((walletHash >> 4) % 20) + 1).padStart(2, '0');
    const instCode  = String(((walletHash >> 8) % 90) + 10).padStart(2, '0');

    // Sequential from NIM digits
    const nimDigits = nim.replace(/\D/g, '') || '1';
    const seq5 = String(parseInt(nimDigits.slice(-5)) % 99999 + 1).padStart(5, '0');

    // Nomor Seri Blangko (6 digit)
    const seriesNo = String(parseInt(nimDigits.slice(-6) || '1') % 999999 + 1).padStart(6, '0');

    // Nomor Ijazah Nasional (14 digit)
    const nin = `${provCode}${kabCode}${instCode}${yearShort}${seq5}`;

    // Nomor Institusi — format IS1-[seq]/TC.[inst]/PP.01 [tanggal]
    const seq4 = String(parseInt(nimDigits.slice(-4)) % 9999 + 1).padStart(4, '0');
    const institutionNo = `IS1-${seq4}/TC.${instCode}/PP.01 ${issuedAt}`;

    return { seriesNo, nin, institutionNo };
}

// ──────────────────────────────────────────────────────────
// Helper: degree level description
// ──────────────────────────────────────────────────────────
function getDegreeLevel(degree) {
    if (!degree) return 'Sarjana Strata Satu (S.1)';
    const d = degree.toLowerCase().trim();
    if (d.startsWith('dr') || d.includes('doktor') || d.includes('ph.d')) return 'Doktor (S.3)';
    if (d.startsWith('m.') || d.includes('magister')) return 'Magister Strata Dua (S.2)';
    if (d.startsWith('a.md') || d.startsWith('d3') || d.startsWith('d.iii')) return 'Diploma Tiga (D.3)';
    return 'Sarjana Strata Satu (S.1)';
}

// ──────────────────────────────────────────────────────────
// Helper: convert date string to Indonesian words
// e.g. "28 Mei 2018" → "Dua Puluh Delapan bulan Mei tahun Dua Ribu Delapan Belas"
// ──────────────────────────────────────────────────────────
function dateToWords(dateStr) {
    const ONES = ['', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima', 'Enam', 'Tujuh', 'Delapan', 'Sembilan',
        'Sepuluh', 'Sebelas', 'Dua Belas', 'Tiga Belas', 'Empat Belas', 'Lima Belas',
        'Enam Belas', 'Tujuh Belas', 'Delapan Belas', 'Sembilan Belas'];
    const TENS = ['', '', 'Dua Puluh', 'Tiga Puluh'];
    function n2w(n) {
        if (n < 20) return ONES[n];
        const t = Math.floor(n / 10), o = n % 10;
        return o > 0 ? `${TENS[t]} ${ONES[o]}` : TENS[t];
    }
    function year2w(y) {
        const parts = [];
        const thou = Math.floor(y / 1000), hund = Math.floor((y % 1000) / 100), rem = y % 100;
        if (thou > 0) parts.push(`${ONES[thou]} Ribu`);
        if (hund > 0) parts.push(`${ONES[hund]} Ratus`);
        if (rem > 0) parts.push(n2w(rem));
        return parts.join(' ');
    }
    const parts = dateStr.split(' ');
    if (parts.length < 3) return dateStr;
    return `${n2w(parseInt(parts[0]))} bulan ${parts[1]} tahun ${year2w(parseInt(parts[2]))}`;
}

// ──────────────────────────────────────────────────────────
// Helper: draw decorative stamp circle
// ──────────────────────────────────────────────────────────
function drawStamp(doc, cx, cy, label, color) {
    doc.circle(cx, cy, 30).lineWidth(2).stroke(color);
    doc.circle(cx, cy, 25).lineWidth(0.8).stroke(color);
    doc.circle(cx, cy, 18).lineWidth(0.5).stroke(color);
    doc.fontSize(5.5).font('Helvetica-Bold').fillColor(color)
        .text(label, cx - 20, cy - 4, { width: 40, align: 'center' });
}

// ──────────────────────────────────────────────────────────
// Main PDF generator — ijazah-style layout (landscape page 1)
// ──────────────────────────────────────────────────────────
function generatePDF({ studentName, nim, schoolName, schoolWallet, grades, issuedAt,
    qrBuffer, photoBuffer, birthPlace, birthDate, faculty, major, degree }) {
    return new Promise((resolve, reject) => {
        // Page 1 is LANDSCAPE
        const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 0, autoFirstPage: true });
        const chunks = [];
        doc.on('data', c => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // ─── Page 1 dimensions (landscape) ───────────────────
        const W = doc.page.width;   // 841.89
        const H = doc.page.height;  // 595.28
        const ML = 50;
        const CW = W - ML * 2;     // 741.89

        const C = {
            dark:    '#0f172a',
            gray:    '#475569',
            light:   '#94a3b8',
            border:  '#1e3a5f',
            gold:    '#92650a',
            success: '#15803d',
            danger:  '#dc2626',
            white:   '#ffffff',
            bg2:     '#f8fafc',
        };

        // ── Diploma numbers ──
        const { seriesNo, nin, institutionNo } = generateDiplomaNumbers(nim, schoolWallet, issuedAt);

        // ════════════════════════════════════════════════
        // HALAMAN 1 — IJAZAH (LANDSCAPE)
        // ════════════════════════════════════════════════

        // Outer decorative border (double)
        doc.rect(10, 10, W - 20, H - 20).lineWidth(3).stroke(C.border);
        doc.rect(17, 17, W - 34, H - 34).lineWidth(1).stroke(C.border);

        // Corner ornament diamonds
        [[22, 22],[W - 22, 22],[22, H - 22],[W - 22, H - 22]].forEach(([cx, cy]) => {
            doc.save()
                .translate(cx, cy)
                .path('M0,-5 L5,0 L0,5 L-5,0 Z')
                .lineWidth(0.8).stroke(C.gold)
                .restore();
        });

        // ── Nomor Seri Blangko (pojok kanan atas) ──────────────
        // Nomor seri kertas blangko ijazah berkeamanan
        doc.fontSize(12).font('Helvetica-Bold').fillColor(C.dark)
            .text(seriesNo, W - 120, 22, { width: 100, align: 'right' });

        // ── Nomor Institusi + NIN (kiri atas) ──────────────────
        // Nomor surat institusi (IS1-seq/kode/PP.01 tanggal)
        doc.fontSize(7).font('Helvetica').fillColor(C.dark)
            .text(`Nomor: ${institutionNo}`, 25, 22, { width: 340 });
        // Nomor Ijazah Nasional (14 digit SIVIL/Kemdikbud)
        doc.fontSize(7).font('Helvetica').fillColor(C.dark)
            .text(`Nomor Ijazah Nasional: ${nin}`, 25, 33, { width: 340 });

        // ── Logo lingkaran institusi ──────────────────────────
        const logoX = W / 2, logoY = 58, logoR = 28;
        doc.circle(logoX, logoY, logoR).lineWidth(2).stroke(C.border);
        doc.circle(logoX, logoY, logoR - 5).lineWidth(0.5).stroke(C.border);
        doc.circle(logoX, logoY, 8).lineWidth(0.4).stroke(C.border);
        const logoLabel = schoolName.split(' ').map(w => w[0]).join('').slice(0, 4).toUpperCase();
        doc.fontSize(9).font('Helvetica-Bold').fillColor(C.border)
            .text(logoLabel, logoX - 18, logoY - 6, { width: 36, align: 'center' });

        // ── Nama Institusi ────────────────────────────────────
        const schoolLine1 = schoolName.toUpperCase();
        doc.fontSize(13).font('Helvetica-Bold').fillColor(C.dark)
            .text(schoolLine1, ML, 92, { width: CW, align: 'center' });

        // Garis dekoratif ganda
        const lineY = doc.y + 6;
        doc.moveTo(ML + 30, lineY).lineTo(W - ML - 30, lineY).lineWidth(2.5).stroke(C.border);
        doc.moveTo(ML + 30, lineY + 5).lineTo(W - ML - 30, lineY + 5).lineWidth(0.8).stroke(C.border);

        // ── Teks badan ijazah ─────────────────────────────────
        const bodyFS = 9.5;
        const bodyOpts = { width: CW, align: 'center', lineGap: 2 };
        let y = lineY + 16;

        doc.fontSize(bodyFS).font('Helvetica').fillColor(C.dark)
            .text('dengan ini menyatakan bahwa:', ML, y, bodyOpts);
        y = doc.y + 6;

        // Nama mahasiswa
        doc.fontSize(19).font('Helvetica-Bold').fillColor(C.dark)
            .text(studentName, ML, y, { width: CW, align: 'center' });
        y = doc.y + 4;

        // NIM
        doc.fontSize(10).font('Helvetica').fillColor(C.dark)
            .text(`NIM: ${nim}`, ML, y, { width: CW, align: 'center' });
        y = doc.y + 8;

        // Separator tipis
        doc.moveTo(ML + 80, y).lineTo(W - ML - 80, y).lineWidth(0.5).stroke(C.light);
        y += 10;

        // Lahir di
        if (birthPlace || birthDate) {
            const bStr = [birthPlace && `Lahir di ${birthPlace}`, birthDate && `tanggal ${birthDate}`].filter(Boolean).join(', ') + ',';
            doc.fontSize(bodyFS).font('Helvetica').fillColor(C.dark).text(bStr, ML, y, bodyOpts);
            y = doc.y + 3;
        }

        const degreeLevel = getDegreeLevel(degree);
        doc.fontSize(bodyFS).font('Helvetica').fillColor(C.dark)
            .text(`telah menyelesaikan dengan baik dan memenuhi syarat pendidikan ${degreeLevel}`, ML, y, bodyOpts);
        y = doc.y + 3;

        const prodiParts = [major && `Program Studi ${major}`, faculty && `Fakultas ${faculty}`].filter(Boolean);
        doc.fontSize(bodyFS).font('Helvetica').fillColor(C.dark)
            .text(`pada ${prodiParts.join(', ') || 'program studi yang bersangkutan'}, tanggal ${issuedAt}.`, ML, y, bodyOpts);
        y = doc.y + 3;

        doc.fontSize(bodyFS).font('Helvetica').fillColor(C.dark)
            .text('Oleh sebab itu, kepadanya diberikan ijazah dan gelar:', ML, y, bodyOpts);
        y = doc.y + 8;

        // Nama gelar
        doc.fontSize(19).font('Helvetica-Bold').fillColor(C.dark)
            .text(degree || 'Sarjana', ML, y, { width: CW, align: 'center' });
        y = doc.y + 8;

        doc.fontSize(bodyFS).font('Helvetica').fillColor(C.dark)
            .text('beserta hak dan kewajiban yang melekat pada gelar tersebut.', ML, y, bodyOpts);
        y = doc.y + 3;

        const dateWords = dateToWords(issuedAt);
        doc.fontSize(bodyFS).font('Helvetica').fillColor(C.dark)
            .text(`Diberikan di Indonesia pada tanggal ${dateWords}.`, ML, y, bodyOpts);

        // ── Area Tanda Tangan ─────────────────────────────────
        const sigY = H - 190;
        doc.moveTo(ML + 30, sigY - 8).lineTo(W - ML - 30, sigY - 8).lineWidth(0.4).stroke(C.light);

        const colW = 150;
        const colDekanX = ML + 20;
        const colRektorX = W - ML - 20 - colW;

        // Dekan (kiri)
        doc.fontSize(9).font('Helvetica').fillColor(C.dark)
            .text('Dekan,', colDekanX, sigY, { width: colW, align: 'center' });
        drawStamp(doc, colDekanX + colW / 2, sigY + 58, 'DEKAN', C.gold);
        doc.moveTo(colDekanX + 15, sigY + 108).lineTo(colDekanX + colW - 15, sigY + 108).lineWidth(0.5).stroke(C.dark);
        doc.fontSize(8).font('Helvetica').fillColor(C.dark)
            .text('NIP. .............................', colDekanX, sigY + 112, { width: colW, align: 'center' });

        // Foto mahasiswa (tengah)
        const pW = 78, pH = 98;
        const pX = W / 2 - pW / 2;
        const pY = sigY - 8;
        doc.rect(pX, pY, pW, pH).lineWidth(1).stroke(C.border);
        if (photoBuffer) {
            try {
                doc.image(photoBuffer, pX + 2, pY + 2, { width: pW - 4, height: pH - 4, cover: [pW - 4, pH - 4] });
            } catch {}
        } else {
            doc.fontSize(8).font('Helvetica').fillColor(C.light)
                .text('FOTO', pX, pY + pH / 2 - 5, { width: pW, align: 'center' });
        }

        // QR code verifikasi — di bawah foto, ukuran kompak
        const qrSz = 52;
        doc.image(qrBuffer, W / 2 - qrSz / 2, pY + pH + 6, { width: qrSz });
        doc.fontSize(5.5).font('Helvetica').fillColor(C.light)
            .text('Scan QR untuk verifikasi on-chain', W / 2 - 40, pY + pH + qrSz + 10, { width: 80, align: 'center' });

        // Rektor (kanan)
        doc.fontSize(9).font('Helvetica').fillColor(C.dark)
            .text('Rektor,', colRektorX, sigY, { width: colW, align: 'center' });
        drawStamp(doc, colRektorX + colW / 2, sigY + 58, 'REKTOR', C.gold);
        doc.moveTo(colRektorX + 15, sigY + 108).lineTo(colRektorX + colW - 15, sigY + 108).lineWidth(0.5).stroke(C.dark);
        doc.fontSize(8).font('Helvetica').fillColor(C.dark)
            .text('NIP. .............................', colRektorX, sigY + 112, { width: colW, align: 'center' });

        // Keterangan bawah
        doc.fontSize(5.5).font('Helvetica').fillColor(C.light)
            .text(
                `TranscriptChain · Dokumen terverifikasi blockchain Ethereum Sepolia · ` +
                `Verifikasi: transcript-chain-six.vercel.app/verify · Penerbit: ${schoolWallet.slice(0, 12)}...${schoolWallet.slice(-8)}`,
                ML, H - 26, { width: CW, align: 'center' }
            );

        // ════════════════════════════════════════════════
        // HALAMAN 2 — TRANSKRIP (PORTRAIT)
        // ════════════════════════════════════════════════
        doc.addPage({ size: 'A4', layout: 'portrait', margin: 0 });

        const W2 = doc.page.width;   // 595.28
        const H2 = doc.page.height;  // 841.89
        const ML2 = 45;
        const CW2 = W2 - ML2 * 2;

        // Border halaman 2
        doc.rect(10, 10, W2 - 20, H2 - 20).lineWidth(3).stroke(C.border);
        doc.rect(17, 17, W2 - 34, H2 - 34).lineWidth(1).stroke(C.border);
        [[22, 22],[W2 - 22, 22],[22, H2 - 22],[W2 - 22, H2 - 22]].forEach(([cx, cy]) => {
            doc.save().translate(cx, cy).path('M0,-5 L5,0 L0,5 L-5,0 Z').lineWidth(0.8).stroke(C.gold).restore();
        });

        // Logo halaman 2
        const lX2 = W2 / 2, lY2 = 58;
        doc.circle(lX2, lY2, 24).lineWidth(1.5).stroke(C.border);
        doc.circle(lX2, lY2, 19).lineWidth(0.4).stroke(C.border);
        doc.fontSize(8).font('Helvetica-Bold').fillColor(C.border)
            .text(logoLabel, lX2 - 14, lY2 - 5, { width: 28, align: 'center' });

        // Nomor seri kecil di pojok kanan atas halaman 2
        doc.fontSize(7).font('Helvetica').fillColor(C.light)
            .text(`Nomor: ${institutionNo}  ·  NIN: ${nin}`, ML2, 23, { width: CW2, align: 'center' });

        // Header halaman 2
        doc.fontSize(13).font('Helvetica-Bold').fillColor(C.dark)
            .text(schoolName.toUpperCase(), ML2, 86, { width: CW2, align: 'center' });
        doc.fontSize(12).font('Helvetica-Bold').fillColor(C.dark)
            .text('TRANSKRIP AKADEMIK', ML2, doc.y + 4, { width: CW2, align: 'center' });

        const l2Y = doc.y + 8;
        doc.moveTo(ML2 + 20, l2Y).lineTo(W2 - ML2 - 20, l2Y).lineWidth(2.5).stroke(C.border);
        doc.moveTo(ML2 + 20, l2Y + 5).lineTo(W2 - ML2 - 20, l2Y + 5).lineWidth(0.8).stroke(C.border);

        // Info mahasiswa halaman 2
        const i2Y = l2Y + 18;
        const lbW = 105;
        [
            ['Nama Lengkap', studentName],
            ['NIM', nim],
            ['Program Studi', major || '-'],
            ['Fakultas', faculty || '-'],
            ['Tanggal Terbit', issuedAt],
        ].forEach(([k, v], i) => {
            const iy = i2Y + i * 16;
            doc.fontSize(8.5).font('Helvetica').fillColor(C.gray).text(k, ML2 + 10, iy, { width: lbW });
            doc.fontSize(8.5).font('Helvetica').fillColor(C.dark).text(':', ML2 + lbW + 10, iy);
            doc.fontSize(8.5).font('Helvetica-Bold').fillColor(C.dark).text(v, ML2 + lbW + 20, iy, { width: CW2 - lbW - 20 });
        });

        const tRuleY = i2Y + 5 * 16 + 10;
        doc.moveTo(ML2 + 20, tRuleY).lineTo(W2 - ML2 - 20, tRuleY).lineWidth(0.5).stroke(C.light);

        // Tabel nilai
        const tTop = tRuleY + 14;
        doc.fontSize(9.5).font('Helvetica-Bold').fillColor(C.dark)
            .text('DAFTAR NILAI MATA KULIAH', ML2, tTop - 14);

        const cX = [ML2, ML2 + 100, ML2 + 400];
        const cW = [100, 300, CW2 - 400];
        const hH = 22, rH = 19;

        doc.rect(ML2, tTop, CW2, hH).fill(C.border);
        ['KMK', 'Nama Mata Kuliah', 'Nilai'].forEach((h, i) => {
            doc.fontSize(8.5).font('Helvetica-Bold').fillColor(C.white)
                .text(h, cX[i] + 6, tTop + 7, { width: cW[i] - 8, align: i === 2 ? 'center' : 'left' });
        });

        grades.forEach((row, i) => {
            const ry = tTop + hH + i * rH;
            doc.rect(ML2, ry, CW2, rH).fill(i % 2 === 0 ? C.white : C.bg2);
            doc.moveTo(ML2, ry).lineTo(ML2 + CW2, ry).lineWidth(0.3).stroke(C.light);
            doc.fontSize(8).font('Helvetica').fillColor(C.dark)
                .text(row.kmk || '', cX[0] + 6, ry + 5, { width: cW[0] - 8 });
            doc.text(row.courseName || '', cX[1] + 6, ry + 5, { width: cW[1] - 8 });
            const gc = ['A', 'A-'].includes(row.grade) ? C.success : ['D', 'E'].includes(row.grade) ? C.danger : C.dark;
            doc.font('Helvetica-Bold').fillColor(gc)
                .text(row.grade || '', cX[2] + 6, ry + 5, { width: cW[2] - 8, align: 'center' });
        });

        const tBot = tTop + hH + grades.length * rH;
        doc.rect(ML2, tTop, CW2, hH + grades.length * rH).lineWidth(0.8).stroke(C.border);
        [cX[1], cX[2]].forEach(x => {
            doc.moveTo(x, tTop).lineTo(x, tBot).lineWidth(0.4).stroke(C.light);
        });

        doc.fontSize(8).font('Helvetica').fillColor(C.gray)
            .text(`Total: ${grades.length} Mata Kuliah`, ML2, tBot + 10);

        // QR kecil halaman 2
        const qr2 = 48;
        doc.image(qrBuffer, W2 - ML2 - qr2, tBot + 8, { width: qr2 });
        doc.fontSize(5.5).font('Helvetica').fillColor(C.light)
            .text('Verifikasi on-chain', W2 - ML2 - qr2, tBot + qr2 + 12, { width: qr2, align: 'center' });

        // Area tanda tangan halaman 2
        const s2Y = H2 - 145;
        doc.moveTo(ML2 + 20, s2Y).lineTo(W2 - ML2 - 20, s2Y).lineWidth(0.4).stroke(C.light);
        const cRekX2 = W2 - ML2 - 20 - 140;
        doc.fontSize(9).font('Helvetica').fillColor(C.dark)
            .text('Mengetahui,', cRekX2, s2Y + 10, { width: 140, align: 'center' });
        doc.moveTo(cRekX2 + 10, s2Y + 88).lineTo(cRekX2 + 130, s2Y + 88).lineWidth(0.5).stroke(C.dark);
        doc.fontSize(8).font('Helvetica').fillColor(C.dark)
            .text('NIP. .............................', cRekX2, s2Y + 92, { width: 140, align: 'center' });

        doc.fontSize(5.5).font('Helvetica').fillColor(C.light)
            .text(
                `TranscriptChain · Halaman 2 dari 2 · Transkrip Akademik · Ethereum Sepolia · ` +
                `NIN: ${nin} · ${schoolWallet.slice(0, 12)}...${schoolWallet.slice(-8)}`,
                ML2, H2 - 26, { width: CW2, align: 'center' }
            );

        doc.end();
    });
}
