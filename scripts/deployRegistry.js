/**
 * deployRegistry.js
 *
 * Script deploy UserRegistry.sol ke jaringan Sepolia.
 *
 * Cara pakai:
 *   1. Set REGISTRY_SIGNER_PRIVATE_KEY di .env (private key backend signer)
 *   2. Jalankan server, lalu cek alamat signer:
 *        GET http://localhost:3001/api/auth/signer-address
 *   3. Deploy:
 *        npx hardhat run scripts/deployRegistry.js --network sepolia
 *   4. Salin alamat kontrak ke src/contracts/UserRegistry.json.js
 *
 * PENTING: REGISTRY_SIGNER_PRIVATE_KEY adalah private key yang digunakan
 * backend untuk menandatangani registrasi. Ini BERBEDA dengan deployer key.
 * Jangan gunakan private key wallet MetaMask utama Anda sebagai signer backend.
 */

import hre from 'hardhat';
import dotenv from 'dotenv';
dotenv.config();

async function main() {
    const [deployer] = await hre.ethers.getSigners();

    console.log('\n=== UserRegistry Deployment ===');
    console.log('Deployer:', deployer.address);
    console.log('Network :', hre.network.name);
    console.log('Chain ID:', (await hre.ethers.provider.getNetwork()).chainId.toString());

    // Ambil alamat trusted signer dari private key di .env
    const signerPrivKey = process.env.REGISTRY_SIGNER_PRIVATE_KEY;
    if (!signerPrivKey) {
        throw new Error(
            'REGISTRY_SIGNER_PRIVATE_KEY tidak ditemukan di .env!\n' +
            'Generate baru: node -e "const {ethers}=require(\'ethers\');console.log(ethers.Wallet.createRandom().privateKey)"'
        );
    }

    const signerWallet = new hre.ethers.Wallet(signerPrivKey);
    console.log('Trusted Signer:', signerWallet.address);
    console.log('');

    // Deploy
    const UserRegistry = await hre.ethers.getContractFactory('UserRegistry');
    console.log('Deploying UserRegistry...');
    const registry = await UserRegistry.deploy(signerWallet.address);
    await registry.waitForDeployment();

    const address = await registry.getAddress();
    console.log('\nUserRegistry deployed to:', address);
    console.log('\n--- Langkah Selanjutnya ---');
    console.log(`1. Update src/contracts/UserRegistry.json.js:`);
    console.log(`   address: '${address}'`);
    console.log(`2. Set USER_REGISTRY_ADDRESS=${address} di .env server`);
    console.log(`3. Restart server\n`);
}

main().catch(err => {
    console.error(err);
    process.exitCode = 1;
});
