const hre = require('hardhat');
require('dotenv').config();

async function main() {
    const [deployer] = await hre.ethers.getSigners();

    console.log('\n=== UserRegistry Deployment ===');
    console.log('Deployer:', deployer.address);
    console.log('Network :', hre.network.name);
    console.log('Chain ID:', (await hre.ethers.provider.getNetwork()).chainId.toString());

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

    const UserRegistry = await hre.ethers.getContractFactory('UserRegistry');
    console.log('Deploying UserRegistry...');
    const registry = await UserRegistry.deploy(signerWallet.address);
    await registry.waitForDeployment();

    const address = await registry.getAddress();
    console.log('\nUserRegistry deployed to:', address);
    console.log('\n--- Langkah Selanjutnya ---');
    console.log(`1. Update src/contracts/UserRegistry.json.js:`);
    console.log(`   address: '${address}'`);
    console.log(`2. Set USER_REGISTRY_ADDRESS=${address} di Vercel env vars`);
    console.log(`3. Redeploy: vercel --prod\n`);
}

main().catch(err => {
    console.error(err);
    process.exitCode = 1;
});
