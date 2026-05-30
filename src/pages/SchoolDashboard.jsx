import { useState, useRef, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useWeb3 } from '../context/Web3Context';
import { useAuth } from '../context/AuthContext';
import { ethers } from 'ethers';
import * as pdfjsLib from 'pdfjs-dist';
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href;

const STEPS = ['Generate PDF', 'Sign Approval', 'Simpan Request', 'Selesai'];

function parseCSV(text) {
    const cleaned = text.replace(/^﻿/, ''); // strip BOM
    const lines = cleaned.trim().split(/\r?\n/);
    if (lines.length < 2) return [];
    const delim = lines[0].includes(';') ? ';' : ',';
    const headers = lines[0].split(delim).map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());
    return lines.slice(1).filter(l => l.trim()).map(line => {
        const values = [];
        let cur = '', inQ = false;
        for (let i = 0; i < line.length; i++) {
            if (line[i] === '"') { inQ = !inQ; }
            else if (line[i] === delim && !inQ) { values.push(cur.trim()); cur = ''; }
            else { cur += line[i]; }
        }
        values.push(cur.trim());
        const obj = {};
        headers.forEach((h, i) => { obj[h] = (values[i] || '').replace(/^"|"$/g, '').trim(); });
        return obj;
    });
}

function mapCSVRow(row) {
    return {
        nim:           row['nim'] || row['no nim'] || row['no. nim'] || '',
        name:          row['nama'] || row['name'] || row['nama lengkap'] || '',
        email:         row['email'] || '',
        walletAddress: row['wallet'] || row['wallet address'] || row['alamat wallet'] || '',
        jenjang:       (['s1','s2','s3'].includes((row['jenjang'] || '').toLowerCase())
                           ? (row['jenjang'] || 'S1').toUpperCase() : 'S1'),
        degree:        row['gelar'] || row['degree'] || '',
        major:         row['program studi'] || row['prodi'] || row['major'] || '',
        faculty:       row['fakultas'] || row['faculty'] || '',
        birthPlace:    row['tempat lahir'] || row['birthplace'] || row['tempat_lahir'] || '',
        birthDate:     row['tanggal lahir'] || row['birthdate'] || row['tanggal_lahir'] || '',
        tahunLulus:    row['tahun lulus'] || row['tahun_lulus'] || row['graduation year'] || '',
    };
}
const GRADE_OPTIONS = ['A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'D', 'E'];
const emptyRow = () => ({ kmk: '', courseName: '', grade: 'A', sks: 3 });

const SKS_LIMITS = {
    S1: { min: 144, max: 166 },
    S2: { min: 36,  max: 50  },
    S3: { min: 42,  max: 50  },
};

const DEGREE_LEVEL_STYLE = {
    S1: { bg: 'rgba(59,130,246,0.12)', color: '#3b82f6', border: 'rgba(59,130,246,0.3)' },
    S2: { bg: 'rgba(34,197,94,0.12)',  color: '#22c55e', border: 'rgba(34,197,94,0.3)'  },
    S3: { bg: 'rgba(168,85,247,0.12)', color: '#a855f7', border: 'rgba(168,85,247,0.3)' },
};

function getDegreeLevel(degree) {
    if (!degree) return 'S1';
    const d = degree.toLowerCase().trim();
    if (d.startsWith('dr') || d.includes('doktor') || d.includes('ph.d')) return 'S3';
    if (d.startsWith('m.') || d.includes('magister')) return 'S2';
    return 'S1';
}

const STATUS_LABEL = {
    pending:           { text: 'Menunggu Student',      color: '#fbbf24', bg: 'rgba(251,191,36,0.12)',   border: 'rgba(251,191,36,0.3)'   },
    student_approved:  { text: 'Proses Kementerian',    color: '#60a5fa', bg: 'rgba(96,165,250,0.12)',   border: 'rgba(96,165,250,0.3)'   },
    ministry_approved: { text: 'Disetujui Kementerian', color: '#34d399', bg: 'rgba(52,211,153,0.12)',   border: 'rgba(52,211,153,0.3)'   },
    minted:            { text: 'NFT Ter-mint ✓',        color: '#4ade80', bg: 'rgba(74,222,128,0.12)',   border: 'rgba(74,222,128,0.3)'   },
    rejected:          { text: 'Ditolak',               color: '#f87171', bg: 'rgba(248,113,113,0.12)',  border: 'rgba(248,113,113,0.3)'  },
};

const toBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
});

function InfoRow({ label, value }) {
    return (
        <div style={{ display: 'flex', gap: 8, fontSize: 'var(--font-sm)' }}>
            <span style={{ color: 'var(--text-muted)', width: 130, flexShrink: 0 }}>{label}</span>
            <span style={{ color: value && value !== '-' ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: value && value !== '-' ? 500 : 400 }}>
                {value || '-'}
            </span>
        </div>
    );
}

function SchoolDashboard() {
    const location = useLocation();
    const { account, contract, signer, connectWallet, loading: walletLoading } = useWeb3();
    const { isSchool } = useAuth();

    // ─── Tab ────────────────────────────────────────────────────
    const [activeTab, setActiveTab] = useState('transkrip');

    const [schoolName, setSchoolName] = useState('');
    const [submittedRequests, setSubmittedRequests] = useState([]);
    const [requestsLoading, setRequestsLoading] = useState(false);

    // Form: NIM lookup
    const [nim, setNim] = useState('');
    const [studentName, setStudentName] = useState('');
    const [studentWallet, setStudentWallet] = useState('');
    const [birthPlace, setBirthPlace] = useState('');
    const [birthDate, setBirthDate] = useState('');
    const [faculty, setFaculty] = useState('');
    const [major, setMajor] = useState('');
    const [degree, setDegree] = useState('');
    const [jenjang, setJenjang] = useState('S1');
    const [nimLookupLoading, setNimLookupLoading] = useState(false);
    const [nimFound, setNimFound] = useState(false);
    const [registeredWallet, setRegisteredWallet] = useState('');

    // Form: Foto
    const [photoFile, setPhotoFile] = useState(null);
    const [photoPreview, setPhotoPreview] = useState('');
    const photoInputRef = useRef(null);

    // Modal: Registrasi NIM (shared between both tabs)
    const [showRegModal, setShowRegModal] = useState(false);
    const [regNim, setRegNim] = useState('');
    const [regName, setRegName] = useState('');
    const [regEmail, setRegEmail] = useState('');
    const [regWallet, setRegWallet] = useState('');
    const [regBirthPlace, setRegBirthPlace] = useState('');
    const [regBirthDate, setRegBirthDate] = useState('');
    const [regFaculty, setRegFaculty] = useState('');
    const [regMajor, setRegMajor] = useState('');
    const [regDegree, setRegDegree] = useState('');
    const [regJenjang, setRegJenjang] = useState('S1');
    const [regTahunLulus, setRegTahunLulus] = useState('');
    const [regLoading, setRegLoading] = useState(false);
    const [regError, setRegError] = useState('');
    const [regSuccess, setRegSuccess] = useState('');

    // Form: Grades (transkrip)
    const [grades, setGrades] = useState([emptyRow()]);
    const [parseLoading, setParseLoading] = useState(false);
    const [parseError, setParseError]     = useState('');
    const parseInputRef = useRef(null);

    // Process state
    const [currentStep, setCurrentStep] = useState(-1);
    const [processing, setProcessing] = useState(false);
    const [error, setError] = useState('');
    const [result, setResult] = useState(null);
    const [editingRequestId, setEditingRequestId] = useState(null);

    // Data Mahasiswa tab
    const [students, setStudents] = useState([]);
    const [studentsLoading, setStudentsLoading] = useState(false);
    const [studentsError, setStudentsError] = useState('');
    const [studentSearch, setStudentSearch] = useState('');
    const [filterFaculty, setFilterFaculty] = useState('');
    const [filterMajor, setFilterMajor] = useState('');
    const [filterTahunLulus, setFilterTahunLulus] = useState('');

    // Bulk import
    const [showBulkModal, setShowBulkModal]   = useState(false);
    const [bulkData, setBulkData]             = useState([]);
    const [bulkLoading, setBulkLoading]       = useState(false);
    const [bulkError, setBulkError]           = useState('');
    const [bulkDone, setBulkDone]             = useState(false);
    const [bulkResult, setBulkResult]         = useState(null);
    const bulkInputRef = useRef(null);

    useEffect(() => {
        if (!account || !contract || !isSchool) return;
        contract.schoolNames(account).then(n => setSchoolName(n || '')).catch(() => {});
    }, [account, contract, isSchool]);

    const fetchRequests = useCallback(async (showSpinner = true) => {
        if (!account || !isSchool) return;
        if (showSpinner) setRequestsLoading(true);
        try {
            const res = await fetch(`/api/school/requests?schoolWallet=${account}`);
            const data = await res.json();
            if (data.success) {
                const STATUS_ORDER = { pending: 0, student_approved: 1, ministry_approved: 2, minted: 3, rejected: 4 };
                const sorted = (data.requests || []).sort((a, b) => {
                    const oa = STATUS_ORDER[a.status] ?? 5;
                    const ob = STATUS_ORDER[b.status] ?? 5;
                    if (oa !== ob) return oa - ob;
                    return new Date(b.createdAt) - new Date(a.createdAt);
                });
                setSubmittedRequests(sorted);
            }
        } catch { /* ignore */ }
        finally { if (showSpinner) setRequestsLoading(false); }
    }, [account, isSchool]);

    useEffect(() => {
        fetchRequests(true);
        const interval = setInterval(() => fetchRequests(false), 15000);
        return () => clearInterval(interval);
    }, [fetchRequests, location.key]);

    const fetchStudents = useCallback(async () => {
        if (!account || !isSchool) return;
        setStudentsLoading(true);
        setStudentsError('');
        try {
            const res = await fetch(`/api/auth/students/list?schoolWallet=${account}&_t=${Date.now()}`);
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.error || `HTTP ${res.status}`);
            setStudents(data.students || []);
        } catch (err) {
            setStudentsError(err.message || 'Gagal memuat data mahasiswa.');
        } finally { setStudentsLoading(false); }
    }, [account, isSchool]);

    useEffect(() => {
        if (activeTab === 'mahasiswa') fetchStudents();
    }, [activeTab, fetchStudents]);

    // ─── NIM Lookup ──────────────────────────────────────────────
    const lookupNim = async () => {
        if (!nim.trim()) return;
        setNimLookupLoading(true);
        setError('');
        setNimFound(false);
        setRegisteredWallet('');
        setStudentName(''); setStudentWallet('');
        setBirthPlace(''); setBirthDate('');
        setFaculty(''); setMajor(''); setDegree('');
        try {
            // Cek apakah NIM ini sudah pernah di-mint
            const alreadyMinted = submittedRequests.some(
                r => r.nim === nim.trim() && r.status === 'minted'
            );
            if (alreadyMinted) {
                setError(`Ijazah untuk NIM "${nim.trim()}" sudah diterbitkan (status: minted). Tidak dapat mengirim ulang.`);
                return;
            }

            const res = await fetch(`/api/nim/lookup?schoolWallet=${account}&nim=${encodeURIComponent(nim.trim())}`);
            const data = await res.json();
            if (!res.ok || !data.success) { setError(data.error || 'NIM tidak ditemukan.'); return; }
            setStudentName(data.name || '');
            setStudentWallet(data.walletAddress || '');
            setRegisteredWallet(data.walletAddress || '');
            setBirthPlace(data.birthPlace || '');
            setBirthDate(data.birthDate || '');
            setFaculty(data.faculty || '');
            setMajor(data.major || '');
            setDegree(data.degree || '');
            setJenjang(data.jenjang || getDegreeLevel(data.degree || '') || 'S1');
            setNimFound(true);
        } catch { setError('Gagal menghubungi server. Coba lagi.'); }
        finally { setNimLookupLoading(false); }
    };

    // ─── Register NIM modal ──────────────────────────────────────
    // student param: pre-fill from Data Mahasiswa table row; null = fresh form using current transcript state
    const openRegModal = (student = null) => {
        setRegNim(student?.nim ?? nim);
        setRegName(student?.name ?? studentName);
        setRegEmail(student?.email ?? '');
        setRegWallet(student?.walletAddress ?? studentWallet);
        setRegBirthPlace(student?.birthPlace ?? birthPlace);
        setRegBirthDate(student?.birthDate ?? birthDate);
        setRegFaculty(student?.faculty ?? faculty);
        setRegMajor(student?.major ?? major);
        setRegDegree(student?.degree ?? degree);
        setRegJenjang(student?.jenjang ?? (student ? getDegreeLevel(student.degree || '') : jenjang) ?? 'S1');
        setRegTahunLulus(student?.tahunLulus ?? '');
        setRegError(''); setRegSuccess('');
        setShowRegModal(true);
    };

    const submitRegister = async () => {
        if (!regNim.trim() || !regName.trim()) {
            setRegError('NIM dan Nama wajib diisi.'); return;
        }
        setRegLoading(true); setRegError(''); setRegSuccess('');
        try {
            const timestamp = Date.now();
            const message = `TranscriptChain: Register NIM ${regNim.trim()} for ${account.toLowerCase()} at ${timestamp}`;
            const signature = await signer.signMessage(message);

            const res = await fetch('/api/nim/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    schoolWallet: account, nim: regNim.trim(),
                    name: regName.trim(), email: regEmail.trim(),
                    walletAddress: regWallet.trim(),
                    birthPlace: regBirthPlace.trim(), birthDate: regBirthDate.trim(),
                    faculty: regFaculty.trim(), major: regMajor.trim(),
                    degree: regDegree.trim(), jenjang: regJenjang,
                    tahunLulus: regTahunLulus.trim(),
                    signature, timestamp,
                }),
            });
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.error || 'Gagal mendaftarkan.');
            setRegSuccess(`NIM ${regNim} berhasil disimpan.`);
            if (activeTab === 'mahasiswa') fetchStudents();
        } catch (err) {
            if (err.code === 4001 || err.message?.includes('user rejected')) {
                setRegError('Signing dibatalkan.');
            } else {
                setRegError(err.message || 'Gagal mendaftarkan NIM.');
            }
        } finally { setRegLoading(false); }
    };

    // ─── Grades helpers ──────────────────────────────────────────
    const updateGrade = (idx, field, val) =>
        setGrades(prev => prev.map((r, i) => i === idx ? { ...r, [field]: val } : r));
    const addRow = () => setGrades(prev => [...prev, emptyRow()]);
    const removeRow = (idx) => { if (grades.length > 1) setGrades(prev => prev.filter((_, i) => i !== idx)); };

    // ─── Foto handler ────────────────────────────────────────────
    const handlePhotoChange = (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        if (!f.type.startsWith('image/')) { setError('Hanya file gambar (JPG/PNG) yang diperbolehkan.'); return; }
        if (f.size > 3 * 1024 * 1024) { setError('Ukuran foto maks. 3MB.'); return; }
        setPhotoFile(f);
        setPhotoPreview(URL.createObjectURL(f));
        setError('');
    };

    const handleBulkFile = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        e.target.value = '';
        if (!file.name.toLowerCase().endsWith('.csv')) {
            setBulkError('Hanya file CSV yang didukung. Di Excel: File → Save As → CSV UTF-8.'); return;
        }
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const rows = parseCSV(ev.target.result).map(mapCSVRow).filter(r => r.nim && r.name);
                if (rows.length === 0) throw new Error('Tidak ada data valid. Pastikan kolom NIM dan Nama terisi.');
                setBulkData(rows); setBulkError(''); setBulkDone(false); setBulkResult(null);
                setShowBulkModal(true);
            } catch (err) { setBulkError(err.message || 'Gagal membaca CSV.'); }
        };
        reader.readAsText(file, 'utf-8');
    };

    const submitBulkImport = async () => {
        setBulkLoading(true); setBulkError('');
        try {
            const timestamp = Date.now();
            const message = `TranscriptChain: Bulk register ${bulkData.length} students for ${account.toLowerCase()} at ${timestamp}`;
            const signature = await signer.signMessage(message);
            const res = await fetch('/api/nim/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ schoolWallet: account, students: bulkData, signature, timestamp, isBulk: true }),
            });
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.error || 'Gagal import.');
            setBulkResult(data); setBulkDone(true);
            if (activeTab === 'mahasiswa') fetchStudents();
        } catch (err) {
            if (err.code === 4001 || err.message?.includes('user rejected')) setBulkError('Signing dibatalkan.');
            else setBulkError(err.message || 'Gagal import.');
        } finally { setBulkLoading(false); }
    };

    const renderPDFtoBase64 = async (file) => {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const totalPages = Math.min(pdf.numPages, 5);
        const scale = 1.5;
        const canvases = [];
        let totalHeight = 0, maxWidth = 0;
        for (let i = 1; i <= totalPages; i++) {
            const page = await pdf.getPage(i);
            const viewport = page.getViewport({ scale });
            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
            canvases.push(canvas);
            totalHeight += viewport.height;
            maxWidth = Math.max(maxWidth, viewport.width);
        }
        const combined = document.createElement('canvas');
        combined.width = maxWidth;
        combined.height = totalHeight;
        const ctx = combined.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, maxWidth, totalHeight);
        let y = 0;
        for (const c of canvases) { ctx.drawImage(c, 0, y); y += c.height; }
        return combined.toDataURL('image/jpeg', 0.88).split(',')[1];
    };

    const handleParseImage = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        e.target.value = '';
        const isPDF = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
        const isImage = file.type.startsWith('image/');
        if (!isPDF && !isImage) { setParseError('Hanya file gambar (JPG/PNG) atau PDF yang didukung.'); return; }
        if (file.size > 30 * 1024 * 1024) { setParseError('Ukuran file maks. 30MB.'); return; }

        setParseLoading(true); setParseError('');
        try {
            let base64, mimeType;
            if (isPDF) {
                base64 = await renderPDFtoBase64(file);
                mimeType = 'image/jpeg';
            } else {
                base64 = await toBase64(file);
                mimeType = file.type;
            }
            const res = await fetch('/api/school/upload-pdf', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'parse', imageBase64: base64, mimeType }),
            });
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.error || 'Gagal memproses file.');
            setGrades(data.grades);
        } catch (err) {
            setParseError(err.message || 'Gagal membaca transkrip dari file.');
        } finally { setParseLoading(false); }
    };

    const formatDate = (iso) => iso ? new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
    const gradesValid = grades.every(r => r.kmk.trim() && r.courseName.trim());
    const totalSks = grades.reduce((sum, r) => sum + (parseInt(r.sks) || 0), 0);
    const degLevel = jenjang || getDegreeLevel(degree);
    const { min: sksMin, max: sksMax } = SKS_LIMITS[degLevel];
    const sksOk = totalSks >= sksMin && totalSks <= sksMax;

    // ─── Submit flow ─────────────────────────────────────────────
    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(''); setResult(null);

        if (!nimFound || !studentName) return setError('Lakukan lookup NIM terlebih dahulu.');
        if (!ethers.isAddress(studentWallet)) return setError('Wallet mahasiswa tidak valid.');
        if (!gradesValid) return setError('Isi semua kolom KMK dan Nama Mata Kuliah.');

        const degLevel = jenjang || getDegreeLevel(degree);
        const totalSks = grades.reduce((sum, r) => sum + (parseInt(r.sks) || 0), 0);
        const { min: sksMin, max: sksMax } = SKS_LIMITS[degLevel];
        if (totalSks < sksMin || totalSks > sksMax) {
            return setError(`Total SKS ${totalSks} tidak memenuhi syarat ${degLevel}: minimal ${sksMin} SKS, maksimal ${sksMax} SKS.`);
        }

        setProcessing(true);
        try {
            setCurrentStep(0);
            let photoBase64 = '';
            if (photoFile) photoBase64 = await toBase64(photoFile);

            const uploadRes = await fetch('/api/school/upload-pdf', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    studentName, nim: nim.trim(), schoolName, schoolWallet: account,
                    studentWallet, grades, birthPlace, birthDate, faculty, major, degree, jenjang,
                    photoBase64,
                }),
            });
            const uploadData = await uploadRes.json();
            if (!uploadRes.ok || !uploadData.success) throw new Error(uploadData.error || 'Gagal generate PDF.');
            const { pdfCID, photoCID, metadataURI } = uploadData;

            setCurrentStep(1);
            const msgHash = await contract.getMintApprovalHash(studentWallet, metadataURI, studentName, pdfCID);
            const schoolSignature = await signer.signMessage(ethers.getBytes(msgHash));

            setCurrentStep(2);
            const submitRes = await fetch('/api/school/submit-transcript', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    schoolWallet: account, schoolName, studentWallet, studentName,
                    nim: nim.trim(), grades, pdfCID, photoCID, metadataURI, schoolSignature,
                    birthPlace, birthDate, faculty, major, degree, jenjang,
                    ...(editingRequestId ? { editingRequestId } : {}),
                }),
            });
            const submitData = await submitRes.json();
            if (!submitRes.ok || !submitData.success) throw new Error(submitData.error || 'Gagal menyimpan request.');

            setCurrentStep(3);
            setResult({ requestId: submitData.requestId, studentName, nim: nim.trim(), studentWallet, metadataURI, pdfCID, pdfURL: uploadData.pdfURL, resubmitted: !!editingRequestId });

            if (editingRequestId) {
                // Update the existing entry in local state instead of refetching
                setSubmittedRequests(prev => prev.map(r =>
                    r.requestId === editingRequestId
                        ? { ...r, ...{ schoolWallet: account, schoolName, studentWallet, studentName, nim: nim.trim(), grades, pdfCID, photoCID, metadataURI, schoolSignature, birthPlace, birthDate, faculty, major, degree, jenjang }, status: 'pending', rejectReason: null }
                        : r
                ));
            } else {
                fetchRequests();
            }
        } catch (err) {
            if (err.code === 4001 || err.message?.includes('user rejected')) {
                setError('Signing dibatalkan.');
            } else {
                setError(err.message || 'Proses gagal. Silakan coba lagi.');
            }
            setCurrentStep(-1);
        } finally { setProcessing(false); }
    };

    const resetForm = () => {
        setNim(''); setStudentName(''); setStudentWallet('');
        setRegisteredWallet('');
        setBirthPlace(''); setBirthDate(''); setFaculty(''); setMajor(''); setDegree('');
        setJenjang('S1');
        setNimFound(false); setGrades([emptyRow()]);
        setPhotoFile(null); setPhotoPreview('');
        setCurrentStep(-1); setError(''); setResult(null);
        setEditingRequestId(null);
    };

    const loadRejectedRequest = (req) => {
        setActiveTab('transkrip');
        setNim(req.nim || '');
        setStudentName(req.studentName || '');
        setStudentWallet(req.studentWallet || '');
        setRegisteredWallet(req.studentWallet || '');
        setBirthPlace(req.birthPlace || '');
        setBirthDate(req.birthDate || '');
        setFaculty(req.faculty || '');
        setMajor(req.major || '');
        setDegree(req.degree || '');
        setJenjang(req.jenjang || getDegreeLevel(req.degree || '') || 'S1');
        setGrades(req.grades?.length ? req.grades : [emptyRow()]);
        setNimFound(true);
        setPhotoFile(null); setPhotoPreview('');
        setCurrentStep(-1); setError(''); setResult(null);
        setEditingRequestId(req.requestId || null);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    if (!account) {
        return (
            <div className="container">
                <div className="connect-prompt">
                    <div className="connect-prompt-icon">🦊</div>
                    <h2>Connect Wallet Anda</h2>
                    <p>Hubungkan wallet MetaMask untuk mengakses School Dashboard.</p>
                    <button className="btn btn-primary btn-lg" onClick={connectWallet} disabled={walletLoading}>
                        {walletLoading ? <><span className="spinner"></span> Connecting...</> : '🔗 Connect MetaMask'}
                    </button>
                </div>
            </div>
        );
    }

    if (!isSchool) {
        return (
            <div className="container">
                <div className="access-denied">
                    <div className="access-denied-icon">🚫</div>
                    <h2>Akses Ditolak</h2>
                    <p>Wallet Anda tidak terdaftar sebagai sekolah di smart contract.</p>
                    <div className="wallet-display">{account}</div>
                </div>
            </div>
        );
    }

    if (result) {
        return (
            <div className="container" style={{ paddingTop: 'var(--space-2xl)', paddingBottom: 'var(--space-3xl)' }}>
                <div className="verify-result valid animate-fade-in">
                    <div className="verify-icon">✅</div>
                    <h2 style={{ marginBottom: 'var(--space-sm)' }}>
                        {result.resubmitted ? 'Request Berhasil Dikirim Ulang!' : 'Request Approval Terkirim!'}
                    </h2>
                    <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-xl)' }}>
                        {result.resubmitted
                            ? 'Data transkrip telah diperbarui dan status kembali ke "Menunggu Student".'
                            : 'Mahasiswa akan menerima notifikasi dan dapat mint NFT dari halaman Owner Approval.'}
                    </p>
                    <div className="metadata-grid" style={{ textAlign: 'left', marginBottom: 'var(--space-xl)' }}>
                        <div className="metadata-item">
                            <div className="metadata-label">Request ID</div>
                            <div className="metadata-value mono" style={{ fontSize: 'var(--font-xs)' }}>{result.requestId}</div>
                        </div>
                        <div className="metadata-item">
                            <div className="metadata-label">Mahasiswa</div>
                            <div className="metadata-value">{result.studentName} — {result.nim}</div>
                        </div>
                        <div className="metadata-item">
                            <div className="metadata-label">Wallet Mahasiswa</div>
                            <div className="metadata-value mono" style={{ fontSize: 'var(--font-xs)' }}>{result.studentWallet}</div>
                        </div>
                        {result.pdfCID && (
                            <div className="metadata-item">
                                <div className="metadata-label">Dokumen PDF</div>
                                <div className="metadata-value">
                                    <a href={result.pdfURL} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', textDecoration: 'underline' }}>
                                        📄 Lihat Ijazah & Transkrip ↗
                                    </a>
                                </div>
                            </div>
                        )}
                    </div>
                    <button className="btn btn-primary" onClick={resetForm}>➕ Buat Request Baru</button>
                </div>
            </div>
        );
    }

    const uniqueFaculties = [...new Set(students.map(s => s.faculty).filter(Boolean))].sort();
    const uniqueMajors = [...new Set(
        (filterFaculty ? students.filter(s => s.faculty === filterFaculty) : students).map(s => s.major).filter(Boolean)
    )].sort();
    const uniqueTahunLulus = [...new Set(students.map(s => s.tahunLulus).filter(Boolean))].sort((a, b) => b.localeCompare(a));

    const filteredStudents = students.filter(s => {
        const q = studentSearch.toLowerCase();
        if (q && !s.nim?.toLowerCase().includes(q) && !s.name?.toLowerCase().includes(q) &&
            !s.major?.toLowerCase().includes(q) && !s.email?.toLowerCase().includes(q)) return false;
        if (filterFaculty && s.faculty !== filterFaculty) return false;
        if (filterMajor && s.major !== filterMajor) return false;
        if (filterTahunLulus && s.tahunLulus !== filterTahunLulus) return false;
        return true;
    });

    const activeFilterCount = [filterFaculty, filterMajor, filterTahunLulus].filter(Boolean).length;

    const clearFilters = () => { setFilterFaculty(''); setFilterMajor(''); setFilterTahunLulus(''); setStudentSearch(''); };

    return (
        <div className="container" style={{ paddingTop: 'var(--space-2xl)', paddingBottom: 'var(--space-3xl)' }}>
            <div className="dashboard-header">
                <h1>🏫 School Dashboard</h1>
                <p>Terbitkan ijazah dan transkrip akademik mahasiswa sebagai NFT</p>
            </div>

            {/* Tab navigation */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 'var(--space-xl)', borderBottom: '1px solid var(--border)' }}>
                {[['transkrip', '📨 Kirim Transkrip'], ['mahasiswa', '👥 Data Mahasiswa']].map(([id, label]) => (
                    <button key={id} type="button"
                        onClick={() => setActiveTab(id)}
                        style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            padding: '10px 20px', fontSize: 'var(--font-sm)', fontWeight: 600,
                            color: activeTab === id ? 'var(--primary)' : 'var(--text-muted)',
                            borderBottom: `2px solid ${activeTab === id ? 'var(--primary)' : 'transparent'}`,
                            marginBottom: -1,
                            transition: 'color 0.15s',
                        }}>
                        {label}
                    </button>
                ))}
            </div>

            {/* ══ Tab: Kirim Transkrip ══ */}
            {activeTab === 'transkrip' && (<>
                {editingRequestId && (
                    <div style={{ marginBottom: 'var(--space-lg)', padding: '10px 16px', borderRadius: 'var(--radius-md)', background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                        <div style={{ fontSize: 'var(--font-sm)', color: '#fbbf24' }}>
                            ✏️ <strong>Mode Edit:</strong> Anda sedang memperbaiki request yang ditolak. Setelah dikirim ulang, status akan kembali ke "Menunggu Student".
                        </div>
                        <button type="button" className="btn btn-secondary"
                            style={{ fontSize: 'var(--font-xs)', padding: '4px 10px', flexShrink: 0 }}
                            onClick={resetForm}>
                            Batal
                        </button>
                    </div>
                )}

                {currentStep >= 0 && (
                    <div className="progress-steps animate-fade-in">
                        {STEPS.map((step, i) => (
                            <span key={step} style={{ display: 'contents' }}>
                                {i > 0 && <div className={`progress-line ${currentStep > i - 1 ? 'done' : ''}`} />}
                                <div className={`progress-step ${currentStep === i ? 'active' : ''} ${currentStep > i ? 'done' : ''}`}>
                                    <div className="progress-step-dot">{currentStep > i ? '✓' : i + 1}</div>
                                    <span className="progress-step-label">{step}</span>
                                </div>
                            </span>
                        ))}
                    </div>
                )}

                {error && (
                    <div className="alert alert-error animate-fade-in">
                        <span className="alert-icon">⚠️</span>
                        <div>{error}</div>
                    </div>
                )}

                <form onSubmit={handleSubmit}>
                    <div className="dashboard-grid">
                        {/* ── Left column ── */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>

                            {/* NIM Lookup */}
                            <div className="glass-card-static">
                                <h2 style={{ fontSize: 'var(--font-lg)', marginBottom: 'var(--space-lg)' }}>1. Data Mahasiswa (Ijazah)</h2>
                                <div className="form-group">
                                    <label className="form-label">NIM Mahasiswa</label>
                                    <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                                        <input
                                            type="text" className="form-input" placeholder="Contoh: 2021001"
                                            value={nim}
                                            onChange={(e) => { setNim(e.target.value); setNimFound(false); }}
                                            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), lookupNim())}
                                            disabled={processing} style={{ flex: 1 }}
                                        />
                                        <button type="button" className="btn btn-secondary"
                                            onClick={lookupNim} disabled={!nim.trim() || nimLookupLoading || processing}
                                            style={{ whiteSpace: 'nowrap' }}>
                                            {nimLookupLoading ? <span className="spinner"></span> : 'Cari'}
                                        </button>
                                    </div>
                                    <small style={{ color: 'var(--text-muted)', fontSize: 'var(--font-xs)' }}>
                                        Daftarkan data mahasiswa terlebih dahulu di tab <strong>Data Mahasiswa</strong>.
                                    </small>
                                </div>

                                {nimFound && (
                                    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
                                        <div style={{ background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: 'var(--radius-md)', padding: 'var(--space-md)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                                    <strong style={{ color: 'var(--success)' }}>✓ Mahasiswa ditemukan</strong>
                                                    {(() => {
                                                        const st = DEGREE_LEVEL_STYLE[degLevel];
                                                        return (
                                                            <span style={{ fontSize: 'var(--font-xs)', padding: '2px 10px', borderRadius: 999, background: st.bg, color: st.color, border: `1px solid ${st.border}`, fontWeight: 700 }}>
                                                                Jenjang {degLevel}
                                                            </span>
                                                        );
                                                    })()}
                                                </div>
                                                <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 'var(--font-sm)' }}>{studentName}</p>
                                            </div>
                                            <button type="button" className="btn btn-secondary"
                                                style={{ fontSize: 'var(--font-xs)', padding: '4px 10px' }}
                                                onClick={() => openRegModal()} disabled={processing}>
                                                ✏️ Update Data
                                            </button>
                                        </div>

                                        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-md)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                                            <InfoRow label="Nama Lengkap" value={studentName} />
                                            <InfoRow label="Tempat Lahir" value={birthPlace} />
                                            <InfoRow label="Tanggal Lahir" value={birthDate} />
                                            <InfoRow label="Fakultas" value={faculty} />
                                            <InfoRow label="Program Studi" value={major} />
                                            <InfoRow label="Jenjang" value={degLevel} />
                                            <InfoRow label="Gelar" value={degree || '-'} />
                                        </div>

                                        <div className="form-group" style={{ marginBottom: 0 }}>
                                            <label className="form-label">Wallet Address Mahasiswa</label>
                                            <input type="text" className="form-input mono" placeholder="0x..."
                                                value={studentWallet} onChange={(e) => setStudentWallet(e.target.value)} disabled={processing} />
                                            <small style={{ color: 'var(--text-muted)', fontSize: 'var(--font-xs)' }}>NFT akan di-mint ke wallet ini</small>
                                        </div>

                                        {registeredWallet && studentWallet && studentWallet.toLowerCase() !== registeredWallet.toLowerCase() && (
                                            <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 'var(--radius-md)', padding: 'var(--space-sm) var(--space-md)', fontSize: 'var(--font-xs)', color: '#f87171' }}>
                                                ⚠️ <strong>Peringatan:</strong> Wallet address yang kamu masukkan tidak sesuai dengan wallet yang terdaftar untuk NIM ini.
                                                <br />
                                                <span style={{ opacity: 0.75 }}>Terdaftar: <span style={{ fontFamily: 'monospace' }}>{registeredWallet.slice(0, 6)}…{registeredWallet.slice(-4)}</span></span>
                                            </div>
                                        )}

                                        {(!birthPlace || !faculty || !major) && (
                                            <div style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)', borderRadius: 'var(--radius-md)', padding: 'var(--space-sm) var(--space-md)', fontSize: 'var(--font-xs)', color: '#fbbf24' }}>
                                                ⚠️ Beberapa data belum lengkap. Klik <strong>Update Data</strong> untuk melengkapi.
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Foto Mahasiswa */}
                            {nimFound && (
                                <div className="glass-card-static animate-fade-in">
                                    <h2 style={{ fontSize: 'var(--font-lg)', marginBottom: 'var(--space-lg)' }}>2. Foto Mahasiswa</h2>
                                    <div style={{ display: 'flex', gap: 'var(--space-lg)', alignItems: 'flex-start' }}>
                                        <div
                                            style={{ width: 100, height: 130, borderRadius: 'var(--radius-md)', border: '2px dashed var(--border)', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.04)', cursor: 'pointer' }}
                                            onClick={() => photoInputRef.current?.click()}
                                        >
                                            {photoPreview
                                                ? <img src={photoPreview} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                : <span style={{ fontSize: '2rem' }}>🖼️</span>
                                            }
                                        </div>

                                        <div style={{ flex: 1 }}>
                                            <input ref={photoInputRef} type="file" accept="image/*"
                                                onChange={handlePhotoChange} disabled={processing} style={{ display: 'none' }} />
                                            <button type="button" className="btn btn-secondary"
                                                onClick={() => photoInputRef.current?.click()} disabled={processing}>
                                                {photoFile ? '🔄 Ganti Foto' : '📷 Upload Foto'}
                                            </button>
                                            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--font-xs)', marginTop: 'var(--space-sm)' }}>
                                                Format JPG/PNG, maks. 3MB.<br />
                                                Foto akan tampil di ijazah PDF.<br />
                                                {!photoFile && <span style={{ color: '#fbbf24' }}>Opsional — jika tidak diupload, kotak foto akan kosong.</span>}
                                            </p>
                                            {photoFile && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', marginTop: 'var(--space-sm)' }}>
                                                    <span style={{ fontSize: 'var(--font-xs)', color: 'var(--success)' }}>✓ {photoFile.name}</span>
                                                    <button type="button" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 'var(--font-xs)' }}
                                                        onClick={() => { setPhotoFile(null); setPhotoPreview(''); }}>
                                                        ✕ Hapus
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Grades Table */}
                            {nimFound && (
                                <div className="glass-card-static animate-fade-in">
                                    <input ref={parseInputRef} type="file" accept="image/*,.pdf" style={{ display: 'none' }} onChange={handleParseImage} />
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                                        <h2 style={{ fontSize: 'var(--font-lg)', margin: 0 }}>3. Transkrip Nilai</h2>
                                        <button type="button"
                                            className="btn btn-secondary"
                                            style={{ fontSize: 'var(--font-xs)', padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 5 }}
                                            onClick={() => parseInputRef.current?.click()}
                                            disabled={processing || parseLoading}>
                                            {parseLoading
                                                ? <><span className="spinner" style={{ width: 12, height: 12 }}></span> Membaca...</>
                                                : '📷 Scan Foto / PDF'}
                                        </button>
                                        {/* SKS meter */}
                                        <div style={{ textAlign: 'right' }}>
                                            <span style={{
                                                fontSize: 'var(--font-sm)', fontWeight: 700, padding: '3px 12px', borderRadius: 999,
                                                background: sksOk ? 'rgba(74,222,128,0.12)' : totalSks === 0 ? 'rgba(255,255,255,0.06)' : 'rgba(248,113,113,0.12)',
                                                color: sksOk ? '#4ade80' : totalSks === 0 ? 'var(--text-muted)' : '#f87171',
                                                border: `1px solid ${sksOk ? 'rgba(74,222,128,0.3)' : totalSks === 0 ? 'var(--border)' : 'rgba(248,113,113,0.3)'}`,
                                            }}>
                                                {totalSks} SKS
                                            </span>
                                            <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginTop: 3 }}>
                                                {degLevel}: {sksMin}–{sksMax} SKS
                                            </div>
                                        </div>
                                    </div>
                                    <p style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginBottom: 'var(--space-lg)' }}>
                                        Nilai & SKS tersimpan terpisah, hanya terlihat setelah mahasiswa berhasil mint NFT.
                                    </p>
                                    <div style={{ overflowX: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-sm)' }}>
                                            <thead>
                                                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                                    <th style={{ textAlign: 'left', padding: '8px 6px', color: 'var(--text-muted)', fontWeight: 600, width: 120 }}>KMK</th>
                                                    <th style={{ textAlign: 'left', padding: '8px 6px', color: 'var(--text-muted)', fontWeight: 600 }}>Nama Mata Kuliah</th>
                                                    <th style={{ textAlign: 'center', padding: '8px 6px', color: 'var(--text-muted)', fontWeight: 600, width: 60 }}>SKS</th>
                                                    <th style={{ textAlign: 'center', padding: '8px 6px', color: 'var(--text-muted)', fontWeight: 600, width: 72 }}>Nilai</th>
                                                    <th style={{ width: 36 }}></th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {grades.map((row, idx) => (
                                                    <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                                        <td style={{ padding: 6 }}>
                                                            <input type="text" className="form-input" placeholder="MK-001"
                                                                value={row.kmk} onChange={(e) => updateGrade(idx, 'kmk', e.target.value)}
                                                                disabled={processing} style={{ fontSize: 'var(--font-sm)', padding: '6px 10px' }} />
                                                        </td>
                                                        <td style={{ padding: 6 }}>
                                                            <input type="text" className="form-input" placeholder="Kalkulus I"
                                                                value={row.courseName} onChange={(e) => updateGrade(idx, 'courseName', e.target.value)}
                                                                disabled={processing} style={{ fontSize: 'var(--font-sm)', padding: '6px 10px' }} />
                                                        </td>
                                                        <td style={{ padding: 6 }}>
                                                            <input type="number" className="form-input" min={1} max={12}
                                                                value={row.sks} onChange={(e) => updateGrade(idx, 'sks', Math.max(1, parseInt(e.target.value) || 1))}
                                                                disabled={processing} style={{ fontSize: 'var(--font-sm)', padding: '6px 8px', textAlign: 'center' }} />
                                                        </td>
                                                        <td style={{ padding: 6 }}>
                                                            <select className="form-input" value={row.grade}
                                                                onChange={(e) => updateGrade(idx, 'grade', e.target.value)}
                                                                disabled={processing} style={{ fontSize: 'var(--font-sm)', padding: '6px 8px' }}>
                                                                {GRADE_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
                                                            </select>
                                                        </td>
                                                        <td style={{ padding: 6, textAlign: 'center' }}>
                                                            <button type="button" onClick={() => removeRow(idx)}
                                                                disabled={grades.length === 1 || processing}
                                                                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1rem', padding: '4px 6px' }}>✕</button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>

                                    {parseError && (
                                        <div className="alert alert-error animate-fade-in" style={{ marginTop: 'var(--space-sm)', fontSize: 'var(--font-xs)' }}>
                                            <span className="alert-icon">⚠️</span>
                                            <div>{parseError}</div>
                                            <button style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', marginLeft: 'auto', opacity: 0.7 }} onClick={() => setParseError('')}>✕</button>
                                        </div>
                                    )}

                                    {/* SKS validation message */}
                                    {!sksOk && totalSks > 0 && (
                                        <div style={{ marginTop: 'var(--space-sm)', padding: '8px 12px', borderRadius: 'var(--radius-md)', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.25)', fontSize: 'var(--font-xs)', color: '#f87171' }}>
                                            ⚠️ Total SKS {totalSks} belum memenuhi syarat {degLevel} ({sksMin}–{sksMax} SKS).
                                            {totalSks < sksMin && ` Kurang ${sksMin - totalSks} SKS lagi.`}
                                            {totalSks > sksMax && ` Kelebihan ${totalSks - sksMax} SKS.`}
                                        </div>
                                    )}
                                    {sksOk && (
                                        <div style={{ marginTop: 'var(--space-sm)', padding: '8px 12px', borderRadius: 'var(--radius-md)', background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.2)', fontSize: 'var(--font-xs)', color: '#4ade80' }}>
                                            ✓ Total SKS {totalSks} memenuhi syarat {degLevel} ({sksMin}–{sksMax} SKS).
                                        </div>
                                    )}

                                    <button type="button" className="btn btn-secondary" onClick={addRow}
                                        disabled={processing} style={{ marginTop: 'var(--space-md)', fontSize: 'var(--font-sm)' }}>
                                        + Tambah Mata Kuliah
                                    </button>
                                </div>
                            )}

                            {nimFound && (
                                <button type="submit" className="btn btn-primary btn-lg" style={{ width: '100%' }}
                                    disabled={processing || !studentWallet || !gradesValid || !sksOk}>
                                    {processing
                                        ? <><span className="spinner"></span>
                                            {currentStep === 0 && ' Membuat PDF & mengupload...'}
                                            {currentStep === 1 && ' Menunggu tanda tangan...'}
                                            {currentStep === 2 && ' Menyimpan request...'}
                                        </>
                                        : !sksOk
                                            ? `⚠️ Lengkapi SKS terlebih dahulu (${totalSks}/${sksMin}–${sksMax})`
                                            : editingRequestId
                                                ? '🔄 Kirim Ulang Request (Perbaikan)'
                                                : '📨 Kirim Request Approval ke Mahasiswa'}
                                </button>
                            )}
                        </div>

                        {/* ── Right column: sidebar ── */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
                            <div className="glass-card-static">
                                <h3 style={{ fontSize: 'var(--font-md)', marginBottom: 'var(--space-md)' }}>🔑 School Wallet</h3>
                                {schoolName && <p style={{ color: 'var(--text-primary)', fontWeight: 600, marginBottom: 6 }}>{schoolName}</p>}
                                <div className="metadata-value mono" style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)' }}>{account}</div>
                                <div className="status-badge verified" style={{ marginTop: 'var(--space-md)' }}>✓ Registered School</div>
                            </div>

                            {nimFound && (
                                <div className="glass-card-static animate-fade-in">
                                    <h3 style={{ fontSize: 'var(--font-md)', marginBottom: 'var(--space-md)' }}>📊 Ringkasan</h3>
                                    <div style={{ fontSize: 'var(--font-sm)', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        {[
                                            ['NIM', nim],
                                            ['Mahasiswa', studentName || '-'],
                                            ['Jenjang', degree ? `${degLevel} — ${degree}` : degLevel],
                                            ['TTL', birthPlace && birthDate ? `${birthPlace}, ${birthDate}` : '-'],
                                            ['Prodi', major || '-'],
                                            ['Foto', photoFile ? '✓ Siap' : 'Tidak ada'],
                                            ['Mata Kuliah', `${grades.length} MK`],
                                        ].map(([k, v]) => (
                                            <div key={k} style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                <span>{k}</span>
                                                <span style={{ color: v === '-' || v === 'Tidak ada' ? 'var(--text-muted)' : 'var(--text-primary)' }}>{v}</span>
                                            </div>
                                        ))}
                                        {/* SKS meter di sidebar */}
                                        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 4 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                                <span>Total SKS</span>
                                                <span style={{ fontWeight: 700, color: sksOk ? '#4ade80' : totalSks === 0 ? 'var(--text-muted)' : '#f87171' }}>
                                                    {totalSks} / {sksMin}–{sksMax}
                                                </span>
                                            </div>
                                            <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                                                <div style={{
                                                    height: '100%', borderRadius: 3,
                                                    width: `${Math.min(100, (totalSks / sksMax) * 100)}%`,
                                                    background: sksOk ? '#4ade80' : totalSks > sksMax ? '#f87171' : '#fbbf24',
                                                    transition: 'width 0.3s',
                                                }} />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="glass-card-static">
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
                                    <h3 style={{ fontSize: 'var(--font-md)' }}>📋 Request Terkirim</h3>
                                    <button type="button" className="btn btn-secondary"
                                        style={{ fontSize: 'var(--font-xs)', padding: '4px 10px' }}
                                        onClick={fetchRequests} disabled={requestsLoading}>
                                        {requestsLoading ? <span className="spinner" style={{ width: 12, height: 12 }}></span> : '↻'}
                                    </button>
                                </div>

                                {requestsLoading && submittedRequests.length === 0 && (
                                    <p style={{ color: 'var(--text-muted)', fontSize: 'var(--font-sm)', textAlign: 'center' }}>Memuat...</p>
                                )}
                                {!requestsLoading && submittedRequests.length === 0 && (
                                    <p style={{ color: 'var(--text-muted)', fontSize: 'var(--font-sm)', textAlign: 'center' }}>Belum ada request.</p>
                                )}
                                {submittedRequests.length > 0 && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                        {submittedRequests.map(req => {
                                            const s = STATUS_LABEL[req.status] || STATUS_LABEL.pending;
                                            const isRejected = req.status === 'rejected';
                                            return (
                                                <div key={req.requestId} style={{ padding: '10px 12px', borderRadius: 'var(--radius-md)', background: isRejected ? 'rgba(248,113,113,0.05)' : 'rgba(255,255,255,0.03)', border: `1px solid ${isRejected ? 'rgba(248,113,113,0.2)' : 'var(--border)'}` }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                            <p style={{ fontWeight: 600, fontSize: 'var(--font-sm)', marginBottom: 2 }}>{req.studentName}</p>
                                                            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--font-xs)' }}>NIM: {req.nim} · {formatDate(req.createdAt)}</p>
                                                        </div>
                                                        <span style={{ fontSize: 'var(--font-xs)', padding: '3px 8px', borderRadius: 4, background: s.bg, color: s.color, border: `1px solid ${s.border}`, whiteSpace: 'nowrap', flexShrink: 0 }}>
                                                            {s.text}
                                                        </span>
                                                    </div>
                                                    {isRejected && req.rejectReason && (
                                                        <div style={{ marginTop: 8, padding: '6px 10px', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 6, fontSize: 'var(--font-xs)', color: '#fca5a5' }}>
                                                            <span style={{ fontWeight: 600 }}>Alasan:</span> {req.rejectReason}
                                                        </div>
                                                    )}
                                                    {isRejected && (
                                                        <button
                                                            type="button"
                                                            className="btn btn-secondary"
                                                            style={{ marginTop: 8, fontSize: 'var(--font-xs)', padding: '4px 10px', width: '100%', borderColor: 'rgba(248,113,113,0.3)', color: '#fca5a5' }}
                                                            onClick={() => loadRejectedRequest(req)}
                                                        >
                                                            ✏️ Edit &amp; Kirim Ulang
                                                        </button>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </form>
            </>)}

            {/* ══ Tab: Data Mahasiswa ══ */}
            {activeTab === 'mahasiswa' && (
                <div className="animate-fade-in">
                    {/* ── Baris 1: Search + Tombol ── */}
                    <div style={{ display: 'flex', gap: 'var(--space-sm)', marginBottom: 'var(--space-md)', flexWrap: 'wrap', alignItems: 'center' }}>
                        <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 180 }}>
                            <input type="text" className="form-input" placeholder="Cari NIM, nama, email, prodi..."
                                value={studentSearch} onChange={(e) => setStudentSearch(e.target.value)}
                                style={{ paddingLeft: 36 }} />
                            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }}>🔍</span>
                        </div>
                        <button type="button" className="btn btn-secondary" onClick={fetchStudents} disabled={studentsLoading} style={{ flexShrink: 0 }}>
                            {studentsLoading ? <span className="spinner" style={{ width: 14, height: 14 }}></span> : '↻'}
                        </button>
                        <input ref={bulkInputRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleBulkFile} />
                        <a href="/template-import-mahasiswa.csv" download
                            className="btn btn-secondary"
                            style={{ flexShrink: 0, textDecoration: 'none', fontSize: 'var(--font-sm)' }}>
                            📄 Unduh Template
                        </a>
                        <button type="button" className="btn btn-secondary"
                            onClick={() => { setBulkError(''); bulkInputRef.current?.click(); }}
                            style={{ flexShrink: 0 }}>
                            📥 Import CSV
                        </button>
                        <button type="button" className="btn btn-primary" onClick={() => openRegModal(null)} style={{ flexShrink: 0 }}>
                            + Tambah Mahasiswa
                        </button>
                    </div>

                    {/* ── Baris 2: Filter dropdowns ── */}
                    {students.length > 0 && (
                        <div style={{ display: 'flex', gap: 'var(--space-sm)', marginBottom: 'var(--space-lg)', flexWrap: 'wrap', alignItems: 'center' }}>
                            <select className="form-input" value={filterFaculty}
                                onChange={(e) => { setFilterFaculty(e.target.value); setFilterMajor(''); }}
                                style={{ flex: '1 1 160px', minWidth: 140, fontSize: 'var(--font-sm)', padding: '8px 12px' }}>
                                <option value="">Semua Fakultas</option>
                                {uniqueFaculties.map(f => <option key={f} value={f}>{f}</option>)}
                            </select>

                            <select className="form-input" value={filterMajor}
                                onChange={(e) => setFilterMajor(e.target.value)}
                                style={{ flex: '1 1 180px', minWidth: 160, fontSize: 'var(--font-sm)', padding: '8px 12px' }}>
                                <option value="">Semua Program Studi</option>
                                {uniqueMajors.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>

                            <select className="form-input" value={filterTahunLulus}
                                onChange={(e) => setFilterTahunLulus(e.target.value)}
                                style={{ flex: '1 1 140px', minWidth: 130, fontSize: 'var(--font-sm)', padding: '8px 12px' }}>
                                <option value="">Semua Tahun Lulus</option>
                                {uniqueTahunLulus.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>

                            {(activeFilterCount > 0 || studentSearch) && (
                                <button type="button" className="btn btn-secondary"
                                    onClick={clearFilters}
                                    style={{ fontSize: 'var(--font-xs)', padding: '8px 12px', color: '#f87171', borderColor: 'rgba(248,113,113,0.3)', flexShrink: 0 }}>
                                    ✕ Reset Filter
                                </button>
                            )}
                        </div>
                    )}

                    {studentsError && (
                        <div className="alert alert-error animate-fade-in" style={{ marginBottom: 'var(--space-md)' }}>
                            <span className="alert-icon">⚠️</span>
                            <div>
                                <strong>Gagal memuat data:</strong> {studentsError}
                                <div style={{ fontSize: 'var(--font-xs)', marginTop: 4, opacity: 0.8 }}>Wallet: {account}</div>
                            </div>
                        </div>
                    )}

                    <div className="glass-card-static">
                        {studentsLoading && (
                            <div style={{ textAlign: 'center', padding: 'var(--space-xl)' }}>
                                <span className="spinner" style={{ width: 28, height: 28 }}></span>
                                <p style={{ color: 'var(--text-muted)', marginTop: 12, fontSize: 'var(--font-sm)' }}>Memuat data mahasiswa...</p>
                            </div>
                        )}
                        {!studentsLoading && !studentsError && students.length === 0 && (
                            <div style={{ textAlign: 'center', padding: 'var(--space-xl)', color: 'var(--text-muted)' }}>
                                <p style={{ fontSize: '2.5rem', marginBottom: 'var(--space-md)' }}>👥</p>
                                <p style={{ fontWeight: 600, marginBottom: 4, color: 'var(--text-primary)' }}>Belum ada data mahasiswa</p>
                                <p style={{ fontSize: 'var(--font-sm)', marginBottom: 8 }}>Klik <strong>+ Tambah Mahasiswa</strong> untuk mendaftarkan mahasiswa ke database.</p>
                                <p style={{ fontSize: 'var(--font-xs)', fontFamily: 'monospace', background: 'rgba(255,255,255,0.05)', padding: '4px 10px', borderRadius: 6, display: 'inline-block' }}>
                                    Wallet: {account?.slice(0,10)}...{account?.slice(-8)}
                                </p>
                            </div>
                        )}

                        {students.length > 0 && (
                            <>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)', flexWrap: 'wrap', gap: 8 }}>
                                    <p style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)' }}>
                                        Menampilkan <strong style={{ color: 'var(--text-primary)' }}>{filteredStudents.length}</strong> dari {students.length} mahasiswa
                                        {activeFilterCount > 0 && <span style={{ color: 'var(--primary)', marginLeft: 6 }}>· {activeFilterCount} filter aktif</span>}
                                    </p>
                                </div>

                                {filteredStudents.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: 'var(--space-xl)', color: 'var(--text-muted)' }}>
                                        <p style={{ fontSize: '1.5rem', marginBottom: 8 }}>🔍</p>
                                        <p style={{ fontSize: 'var(--font-sm)' }}>Tidak ada mahasiswa yang cocok dengan filter saat ini.</p>
                                        <button type="button" className="btn btn-secondary" onClick={clearFilters} style={{ marginTop: 12, fontSize: 'var(--font-xs)' }}>
                                            Reset Filter
                                        </button>
                                    </div>
                                ) : (
                                    <div style={{ overflowX: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-sm)' }}>
                                            <thead>
                                                <tr style={{ borderBottom: '2px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
                                                    <th style={{ textAlign: 'left', padding: '10px 12px', color: 'var(--text-muted)', fontWeight: 600, fontSize: 'var(--font-xs)', whiteSpace: 'nowrap' }}>NIM</th>
                                                    <th style={{ textAlign: 'left', padding: '10px 12px', color: 'var(--text-muted)', fontWeight: 600, fontSize: 'var(--font-xs)' }}>Nama & TTL</th>
                                                    <th style={{ textAlign: 'left', padding: '10px 12px', color: 'var(--text-muted)', fontWeight: 600, fontSize: 'var(--font-xs)' }}>Program Studi</th>
                                                    <th style={{ textAlign: 'center', padding: '10px 12px', color: 'var(--text-muted)', fontWeight: 600, fontSize: 'var(--font-xs)', whiteSpace: 'nowrap' }}>Jenjang</th>
                                                    <th style={{ textAlign: 'left', padding: '10px 12px', color: 'var(--text-muted)', fontWeight: 600, fontSize: 'var(--font-xs)', whiteSpace: 'nowrap' }}>Tahun Lulus</th>
                                                    <th style={{ textAlign: 'left', padding: '10px 12px', color: 'var(--text-muted)', fontWeight: 600, fontSize: 'var(--font-xs)' }}>Email</th>
                                                    <th style={{ textAlign: 'left', padding: '10px 12px', color: 'var(--text-muted)', fontWeight: 600, fontSize: 'var(--font-xs)' }}>Wallet</th>
                                                    <th style={{ width: 60 }}></th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {filteredStudents.map((s, idx) => (
                                                    <tr key={s.nim} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                                                        <td style={{ padding: '11px 12px', fontFamily: 'monospace', fontSize: 'var(--font-xs)', color: 'var(--primary)', whiteSpace: 'nowrap', fontWeight: 600 }}>
                                                            {s.nim}
                                                        </td>
                                                        <td style={{ padding: '11px 12px' }}>
                                                            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{s.name}</div>
                                                            {(s.birthPlace || s.birthDate) && (
                                                                <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginTop: 2 }}>
                                                                    {[s.birthPlace, s.birthDate].filter(Boolean).join(', ')}
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td style={{ padding: '11px 12px' }}>
                                                            <div style={{ color: 'var(--text-secondary)' }}>{s.major || '-'}</div>
                                                            {s.faculty && <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginTop: 2 }}>{s.faculty}</div>}
                                                            {s.degree && <div style={{ fontSize: 'var(--font-xs)', color: 'var(--primary)', marginTop: 2, fontWeight: 500 }}>{s.degree}</div>}
                                                        </td>
                                                        <td style={{ padding: '11px 12px', textAlign: 'center' }}>
                                                            {(() => {
                                                                const j = s.jenjang || getDegreeLevel(s.degree || '') || 'S1';
                                                                const st = DEGREE_LEVEL_STYLE[j] || DEGREE_LEVEL_STYLE.S1;
                                                                return (
                                                                    <span style={{ background: st.bg, color: st.color, border: `1px solid ${st.border}`, padding: '2px 10px', borderRadius: 999, fontSize: 'var(--font-xs)', fontWeight: 700 }}>
                                                                        {j}
                                                                    </span>
                                                                );
                                                            })()}
                                                        </td>
                                                        <td style={{ padding: '11px 12px', textAlign: 'center' }}>
                                                            {s.tahunLulus
                                                                ? <span style={{ background: 'rgba(99,102,241,0.15)', color: 'var(--primary)', padding: '2px 10px', borderRadius: 999, fontSize: 'var(--font-xs)', fontWeight: 600 }}>{s.tahunLulus}</span>
                                                                : <span style={{ color: 'var(--text-muted)', fontSize: 'var(--font-xs)' }}>-</span>}
                                                        </td>
                                                        <td style={{ padding: '11px 12px', color: 'var(--text-muted)', fontSize: 'var(--font-xs)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                            {s.email || '-'}
                                                        </td>
                                                        <td style={{ padding: '11px 12px', fontSize: 'var(--font-xs)', fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                                                            {s.walletAddress ? `${s.walletAddress.slice(0, 6)}…${s.walletAddress.slice(-4)}` : '-'}
                                                        </td>
                                                        <td style={{ padding: '11px 12px', textAlign: 'right' }}>
                                                            <button type="button" className="btn btn-secondary"
                                                                style={{ fontSize: 'var(--font-xs)', padding: '4px 10px', whiteSpace: 'nowrap' }}
                                                                onClick={() => openRegModal(s)}>
                                                                ✏️ Edit
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* ── Modal Registrasi / Update NIM (shared) ── */}
            {showRegModal && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-lg)', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
                    onClick={(e) => { if (e.target === e.currentTarget && !regLoading) setShowRegModal(false); }}>
                    <div className="glass-card-static animate-fade-in" style={{ maxWidth: 540, width: '100%', zIndex: 1001, maxHeight: '90vh', overflowY: 'auto' }}>
                        <h2 style={{ fontSize: 'var(--font-xl)', marginBottom: 'var(--space-sm)' }}>Daftarkan / Update Data Mahasiswa</h2>
                        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--font-sm)', marginBottom: 'var(--space-lg)' }}>
                            Data ini akan disimpan ke database dan muncul otomatis saat NIM diinput.
                        </p>

                        {/* Jenjang Pendidikan */}
                        <div className="form-group" style={{ marginBottom: 'var(--space-md)' }}>
                            <label className="form-label" style={{ fontSize: 'var(--font-xs)' }}>Jenjang Pendidikan</label>
                            <div style={{ display: 'flex', gap: 8 }}>
                                {['S1', 'S2', 'S3'].map(j => {
                                    const st = DEGREE_LEVEL_STYLE[j];
                                    const isActive = regJenjang === j;
                                    return (
                                        <button key={j} type="button"
                                            onClick={() => setRegJenjang(j)}
                                            disabled={regLoading}
                                            style={{
                                                flex: 1, padding: '8px 12px', borderRadius: 'var(--radius-md)', cursor: 'pointer',
                                                border: `1.5px solid ${isActive ? st.border : 'var(--border)'}`,
                                                background: isActive ? st.bg : 'transparent',
                                                color: isActive ? st.color : 'var(--text-muted)',
                                                fontWeight: isActive ? 700 : 400,
                                                fontSize: 'var(--font-sm)', transition: 'all 0.15s',
                                            }}>
                                            {j}
                                            <div style={{ fontSize: '10px', fontWeight: 400, color: isActive ? st.color : 'var(--text-muted)', opacity: 0.8 }}>
                                                {j === 'S1' ? '144–166 SKS' : j === 'S2' ? '36–50 SKS' : '42–50 SKS'}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)', marginBottom: 'var(--space-md)' }}>
                            {[
                                ['NIM *', regNim, setRegNim, 'text', '2021001'],
                                ['Nama Lengkap *', regName, setRegName, 'text', 'Budi Santoso'],
                                ['Email', regEmail, setRegEmail, 'email', 'mahasiswa@univ.ac.id'],
                                ['Wallet Address', regWallet, setRegWallet, 'text', '0x...'],
                                ['Tempat Lahir', regBirthPlace, setRegBirthPlace, 'text', 'Jakarta'],
                                ['Tanggal Lahir', regBirthDate, setRegBirthDate, 'text', '1 Januari 2000'],
                                ['Fakultas', regFaculty, setRegFaculty, 'text', 'Fakultas Teknik'],
                                ['Program Studi', regMajor, setRegMajor, 'text', 'Teknik Informatika'],
                                ['Gelar', regDegree, setRegDegree, 'text', 'S.Kom'],
                                ['Tahun Lulus', regTahunLulus, setRegTahunLulus, 'text', '2024'],
                            ].map(([label, val, setter, type, ph]) => (
                                <div key={label} className="form-group" style={{ marginBottom: 0 }}>
                                    <label className="form-label" style={{ fontSize: 'var(--font-xs)' }}>{label}</label>
                                    <input type={type} className="form-input" placeholder={ph}
                                        value={val} onChange={(e) => setter(e.target.value)}
                                        disabled={regLoading}
                                        style={{ fontSize: 'var(--font-sm)', padding: '8px 12px' }} />
                                </div>
                            ))}
                        </div>

                        {regError && (
                            <div className="alert alert-error" style={{ marginBottom: 'var(--space-md)' }}>
                                <span className="alert-icon">⚠️</span><div>{regError}</div>
                            </div>
                        )}
                        {regSuccess && (
                            <div style={{ background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: 'var(--radius-md)', padding: 'var(--space-md)', marginBottom: 'var(--space-md)', fontSize: 'var(--font-sm)', color: 'var(--success)' }}>
                                ✓ {regSuccess}
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: 'var(--space-md)', justifyContent: 'flex-end' }}>
                            <button className="btn btn-secondary" onClick={() => setShowRegModal(false)} disabled={regLoading}>
                                Tutup
                            </button>
                            <button className="btn btn-primary" onClick={submitRegister} disabled={regLoading}>
                                {regLoading ? <><span className="spinner"></span> Menyimpan...</> : '💾 Simpan ke Database'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Bulk Import Error (outside modal) ── */}
            {bulkError && !showBulkModal && (
                <div className="alert alert-error animate-fade-in" style={{ marginTop: 'var(--space-md)' }}>
                    <span className="alert-icon">⚠️</span>
                    <div>{bulkError}</div>
                    <button style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', marginLeft: 'auto' }} onClick={() => setBulkError('')}>✕</button>
                </div>
            )}

            {/* ── Modal Bulk Import CSV ── */}
            {showBulkModal && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-lg)', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
                    onClick={(e) => { if (e.target === e.currentTarget && !bulkLoading) { setShowBulkModal(false); setBulkDone(false); } }}>
                    <div className="glass-card-static animate-fade-in" style={{ maxWidth: 680, width: '100%', zIndex: 1001, maxHeight: '90vh', overflowY: 'auto' }}>

                        {/* Header */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 'var(--space-lg)' }}>
                            <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', flexShrink: 0 }}>
                                📥
                            </div>
                            <div>
                                <h2 style={{ fontSize: 'var(--font-xl)', margin: 0 }}>
                                    {bulkDone ? 'Import Selesai' : `Import ${bulkData.length} Mahasiswa`}
                                </h2>
                                <p style={{ color: 'var(--text-muted)', fontSize: 'var(--font-sm)', margin: 0 }}>
                                    {bulkDone ? 'Data berhasil disimpan ke database' : 'Tinjau data sebelum menyimpan'}
                                </p>
                            </div>
                        </div>

                        {/* Done state */}
                        {bulkDone && bulkResult ? (
                            <div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)', marginBottom: 'var(--space-lg)' }}>
                                    <div style={{ background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.25)', borderRadius: 'var(--radius-md)', padding: 'var(--space-lg)', textAlign: 'center' }}>
                                        <div style={{ fontSize: '2rem', fontWeight: 800, color: '#4ade80' }}>{bulkResult.imported}</div>
                                        <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginTop: 4 }}>Berhasil Diimpor</div>
                                    </div>
                                    <div style={{ background: bulkResult.errors?.length ? 'rgba(248,113,113,0.08)' : 'rgba(255,255,255,0.03)', border: `1px solid ${bulkResult.errors?.length ? 'rgba(248,113,113,0.25)' : 'var(--border)'}`, borderRadius: 'var(--radius-md)', padding: 'var(--space-lg)', textAlign: 'center' }}>
                                        <div style={{ fontSize: '2rem', fontWeight: 800, color: bulkResult.errors?.length ? '#f87171' : 'var(--text-muted)' }}>{bulkResult.errors?.length || 0}</div>
                                        <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginTop: 4 }}>Gagal</div>
                                    </div>
                                </div>
                                {bulkResult.errors?.length > 0 && (
                                    <div style={{ background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 'var(--radius-md)', padding: 'var(--space-md)', marginBottom: 'var(--space-lg)', maxHeight: 160, overflowY: 'auto' }}>
                                        <p style={{ fontSize: 'var(--font-xs)', color: '#f87171', fontWeight: 600, marginBottom: 8 }}>Detail error:</p>
                                        {bulkResult.errors.map((e, i) => (
                                            <div key={i} style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginBottom: 4 }}>
                                                NIM {e.nim}: {e.error}
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <button className="btn btn-primary" style={{ width: '100%' }}
                                    onClick={() => { setShowBulkModal(false); setBulkDone(false); }}>
                                    Selesai
                                </button>
                            </div>
                        ) : (
                            /* Preview state */
                            <>
                                {/* Preview table */}
                                <div style={{ overflowX: 'auto', marginBottom: 'var(--space-md)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-xs)' }}>
                                        <thead>
                                            <tr style={{ background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid var(--border)' }}>
                                                {['NIM', 'Nama', 'Jenjang', 'Program Studi', 'Tahun Lulus', 'Email'].map(h => (
                                                    <th key={h} style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {bulkData.slice(0, 8).map((s, i) => {
                                                const st = DEGREE_LEVEL_STYLE[s.jenjang] || DEGREE_LEVEL_STYLE.S1;
                                                return (
                                                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                                        <td style={{ padding: '7px 12px', fontFamily: 'monospace', color: 'var(--primary)', fontWeight: 600 }}>{s.nim}</td>
                                                        <td style={{ padding: '7px 12px', color: 'var(--text-primary)' }}>{s.name}</td>
                                                        <td style={{ padding: '7px 12px' }}>
                                                            <span style={{ background: st.bg, color: st.color, border: `1px solid ${st.border}`, padding: '1px 8px', borderRadius: 999, fontWeight: 700 }}>{s.jenjang}</span>
                                                        </td>
                                                        <td style={{ padding: '7px 12px', color: 'var(--text-secondary)' }}>{s.major || '-'}</td>
                                                        <td style={{ padding: '7px 12px', color: 'var(--text-muted)', textAlign: 'center' }}>{s.tahunLulus || '-'}</td>
                                                        <td style={{ padding: '7px 12px', color: 'var(--text-muted)' }}>{s.email || '-'}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                    {bulkData.length > 8 && (
                                        <div style={{ padding: '8px 12px', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', borderTop: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
                                            + {bulkData.length - 8} mahasiswa lainnya
                                        </div>
                                    )}
                                </div>

                                {bulkError && (
                                    <div className="alert alert-error" style={{ marginBottom: 'var(--space-md)', fontSize: 'var(--font-sm)' }}>
                                        <span className="alert-icon">⚠️</span><div>{bulkError}</div>
                                    </div>
                                )}

                                <div style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: 'var(--radius-md)', padding: 'var(--space-md)', marginBottom: 'var(--space-lg)', fontSize: 'var(--font-xs)', color: '#fbbf24' }}>
                                    ⚠️ MetaMask akan meminta <strong>1 tanda tangan</strong> untuk memverifikasi seluruh batch import ini.
                                </div>

                                <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
                                    <button className="btn btn-secondary" style={{ flex: 1 }}
                                        onClick={() => { setShowBulkModal(false); setBulkError(''); }}
                                        disabled={bulkLoading}>
                                        Batal
                                    </button>
                                    <button className="btn btn-primary" style={{ flex: 2 }}
                                        onClick={submitBulkImport} disabled={bulkLoading}>
                                        {bulkLoading
                                            ? <><span className="spinner"></span> Menyimpan {bulkData.length} mahasiswa...</>
                                            : `💾 Import ${bulkData.length} Mahasiswa`}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default SchoolDashboard;
