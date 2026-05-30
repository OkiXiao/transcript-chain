/**
 * signerService.js
 *
 * Backend ECDSA signing service untuk menerbitkan signature registrasi.
 *
 * ALUR KERJA:
 *   1. Backend memvalidasi email (domain edu / korporat / keberadaan di DB)
 *   2. Backend memanggil signRegistration() untuk menandatangani params
 *   3. Frontend mengirim (emailHash, signature, ...) ke smart contract
 *   4. Kontrak memverifikasi signature menggunakan ecrecover → hanya menerima
 *      registrasi yang benar-benar divalidasi backend
 *
 * KEAMANAN:
 *   - Private key HARUS ada di .env sebagai REGISTRY_SIGNER_PRIVATE_KEY
 *   - Private key TIDAK BOLEH di-commit ke repository
 *   - Alamat publik (getSignerAddress()) harus di-set sebagai trustedSigner
 *     saat deploy UserRegistry.sol
 *
 * PESAN YANG DITANDATANGANI (harus identik dengan rumus di smart contract):
 *   School  → keccak256("REGISTER_SCHOOL"  || wallet || emailHash || nonce || chainId)
 *   Student → keccak256("REGISTER_STUDENT" || wallet || emailHash || schoolWallet || nonce || chainId)
 *   HR      → keccak256("REGISTER_HR"      || wallet || emailHash || nonce || chainId)
 *
 * ANTI-REPLAY:
 *   - Nonce di-fetch dari kontrak sebelum signing (getCurrentNonce(wallet))
 *   - ChainId disertakan agar signature tidak bisa dipakai di chain lain
 */

import { ethers } from 'ethers';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env') });

// ──────────────────── Inisialisasi Signer ────────────────────

let _signerWallet = null;

function getSignerWallet() {
    if (_signerWallet) return _signerWallet;

    const privateKey = process.env.REGISTRY_SIGNER_PRIVATE_KEY;
    if (!privateKey) {
        throw new Error(
            '[signerService] REGISTRY_SIGNER_PRIVATE_KEY tidak ditemukan di .env. ' +
            'Generate dengan: node -e "console.log(require(\'ethers\').Wallet.createRandom().privateKey)"'
        );
    }

    try {
        _signerWallet = new ethers.Wallet(privateKey);
        return _signerWallet;
    } catch (err) {
        throw new Error(`[signerService] Private key tidak valid: ${err.message}`);
    }
}

/**
 * Kembalikan alamat publik backend signer.
 * Ini adalah nilai yang harus di-set sebagai `trustedSigner` di UserRegistry.sol.
 *
 * @returns {string} Alamat checksum Ethereum
 */
function getSignerAddress() {
    return getSignerWallet().address;
}

// ──────────────────── Hash Helpers ────────────────────

/**
 * Kalkulasi emailHash (keccak256 dari email lowercase).
 * Hasil ini yang disimpan on-chain, bukan email plain-text.
 *
 * @param {string} email
 * @returns {string} bytes32 hex string (0x...)
 */
function hashEmail(email) {
    return ethers.keccak256(ethers.toUtf8Bytes(email.toLowerCase().trim()));
}

/**
 * Encode dan hash parameter registrasi sesuai rumus di smart contract.
 * Menggunakan ethers.solidityPackedKeccak256 yang ekivalen dengan
 * keccak256(abi.encodePacked(...)) di Solidity.
 */
function buildSchoolHash(walletAddress, emailHash, nonce, chainId) {
    return ethers.solidityPackedKeccak256(
        ['string',           'address',     'bytes32',   'uint256', 'uint256'],
        ['REGISTER_SCHOOL',  walletAddress, emailHash,   nonce,     chainId]
    );
}

function buildStudentHash(walletAddress, emailHash, schoolWallet, nonce, chainId) {
    return ethers.solidityPackedKeccak256(
        ['string',            'address',     'bytes32',  'address',    'uint256', 'uint256'],
        ['REGISTER_STUDENT',  walletAddress, emailHash,  schoolWallet, nonce,     chainId]
    );
}

function buildHRHash(walletAddress, emailHash, nonce, chainId) {
    return ethers.solidityPackedKeccak256(
        ['string',       'address',     'bytes32',  'uint256', 'uint256'],
        ['REGISTER_HR',  walletAddress, emailHash,  nonce,     chainId]
    );
}

// ──────────────────── Signing Functions ────────────────────

/**
 * Tanda tangani registrasi School.
 *
 * @param {string} walletAddress  - Wallet yang akan didaftarkan
 * @param {string} email          - Email institusi pendidikan (sudah divalidasi domain)
 * @param {number|bigint} nonce   - Nonce wallet dari kontrak (getCurrentNonce(wallet))
 * @param {number|bigint} chainId - Chain ID jaringan (e.g. 11155111 untuk Sepolia)
 * @returns {Promise<{ emailHash: string, signature: string, signerAddress: string }>}
 */
async function signSchoolRegistration(walletAddress, email, nonce, chainId) {
    const wallet = getSignerWallet();
    const emailHash = hashEmail(email);
    const msgHash = buildSchoolHash(walletAddress, emailHash, nonce, chainId);

    // signMessage() secara otomatis menambahkan prefix EIP-191
    const signature = await wallet.signMessage(ethers.getBytes(msgHash));

    return { emailHash, signature, signerAddress: wallet.address };
}

/**
 * Tanda tangani registrasi Student.
 *
 * @param {string} walletAddress  - Wallet mahasiswa
 * @param {string} email          - Email mahasiswa (sudah dicek di DB sekolah)
 * @param {string} schoolWallet   - Wallet sekolah yang memiliki database mahasiswa ini
 * @param {number|bigint} nonce   - Nonce wallet mahasiswa dari kontrak
 * @param {number|bigint} chainId
 * @returns {Promise<{ emailHash: string, signature: string, signerAddress: string }>}
 */
async function signStudentRegistration(walletAddress, email, schoolWallet, nonce, chainId) {
    const wallet = getSignerWallet();
    const emailHash = hashEmail(email);
    const msgHash = buildStudentHash(walletAddress, emailHash, schoolWallet, nonce, chainId);

    const signature = await wallet.signMessage(ethers.getBytes(msgHash));

    return { emailHash, signature, signerAddress: wallet.address };
}

/**
 * Tanda tangani registrasi HR.
 *
 * @param {string} walletAddress  - Wallet HR/perusahaan
 * @param {string} email          - Email korporat (sudah divalidasi domain bukan webmail publik)
 * @param {number|bigint} nonce   - Nonce wallet HR dari kontrak
 * @param {number|bigint} chainId
 * @returns {Promise<{ emailHash: string, signature: string, signerAddress: string }>}
 */
async function signHRRegistration(walletAddress, email, nonce, chainId) {
    const wallet = getSignerWallet();
    const emailHash = hashEmail(email);
    const msgHash = buildHRHash(walletAddress, emailHash, nonce, chainId);

    const signature = await wallet.signMessage(ethers.getBytes(msgHash));

    return { emailHash, signature, signerAddress: wallet.address };
}

// ──────────────────── Nonce Fetcher via RPC ────────────────────

/**
 * Ambil nonce wallet saat ini dari kontrak UserRegistry.
 * Dipanggil sebelum signing untuk memastikan signature tidak dapat di-replay.
 *
 * @param {string} contractAddress - Alamat UserRegistry yang sudah di-deploy
 * @param {string} walletAddress   - Wallet yang akan di-query nonce-nya
 * @param {string} rpcUrl          - JSON-RPC endpoint
 * @returns {Promise<bigint>}
 */
async function fetchNonceFromChain(contractAddress, walletAddress, rpcUrl) {
    const provider = new ethers.JsonRpcProvider(rpcUrl);

    // ABI minimal: hanya fungsi getCurrentNonce
    const abi = ['function getCurrentNonce(address wallet) external view returns (uint256)'];
    const contract = new ethers.Contract(contractAddress, abi, provider);

    return await contract.getCurrentNonce(walletAddress);
}

export {
    getSignerAddress,
    hashEmail,
    signSchoolRegistration,
    signStudentRegistration,
    signHRRegistration,
    fetchNonceFromChain,
};
