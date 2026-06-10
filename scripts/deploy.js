import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function main() {
    const provider = new ethers.JsonRpcProvider('https://ethereum-sepolia-rpc.publicnode.com');
    const deployer = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);

    const balance = await provider.getBalance(deployer.address);
    const confirmedNonce = await provider.getTransactionCount(deployer.address, 'latest');
    const pendingNonce  = await provider.getTransactionCount(deployer.address, 'pending');

    console.log('Deployer :', deployer.address);
    console.log('Balance  :', ethers.formatEther(balance), 'ETH');
    console.log('Nonce    : confirmed =', confirmedNonce, '| pending =', pendingNonce);

    // ── Step 1: Cancel all stuck nonces above confirmed, except the deploy slot ──
    // Send 0 ETH to self with just 10% gas bump over original stuck txs (10 Gwei → 12 Gwei)
    // This frees up reserved balance so the deploy tx can fit.
    const DEPLOY_NONCE = confirmedNonce;      // replace the first stuck tx with the deploy
    const CANCEL_START = confirmedNonce + 1;  // cancel everything above it

    if (pendingNonce > CANCEL_START) {
        console.log(`\nStep 1: Cancelling stuck nonces ${CANCEL_START}..${pendingNonce - 1}...`);
        for (let nonce = CANCEL_START; nonce < pendingNonce; nonce++) {
            try {
                const tx = await deployer.sendTransaction({
                    to: deployer.address,
                    value: 0n,
                    maxFeePerGas: ethers.parseUnits('50', 'gwei'),
                    maxPriorityFeePerGas: ethers.parseUnits('2', 'gwei'),
                    gasLimit: 21_000,
                    nonce,
                });
                console.log(`  Cancel nonce ${nonce}: ${tx.hash}`);
            } catch (e) {
                if (e.message?.includes('already known')) {
                    console.log(`  Cancel nonce ${nonce}: already in mempool, continuing...`);
                } else {
                    throw e;
                }
            }
        }
    }

    // ── Step 2: Deploy TranscriptNFT, replacing nonce DEPLOY_NONCE ──────────────
    // After cancelling nonces above, total queued cost drops to ~0.000252 ETH (21k * 12 Gwei)
    // So deploy at 43 Gwei with 3.2M gas = 0.1376 ETH fits within 0.14085 ETH balance.
    const artifactPath = path.resolve(__dirname, '../artifacts/contracts/TranscriptNFT.sol/TranscriptNFT.json');
    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
    const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, deployer);

    console.log(`\nStep 2: Deploying TranscriptNFT (nonce ${DEPLOY_NONCE}, gasLimit 3.2M, maxFee 43 Gwei)...`);
    const contract = await factory.deploy({
        maxFeePerGas: ethers.parseUnits('43', 'gwei'),
        maxPriorityFeePerGas: ethers.parseUnits('2', 'gwei'),  // > 1.1x original 1 Gwei
        gasLimit: 3_200_000,
        nonce: DEPLOY_NONCE,
    });
    console.log('Tx hash:', contract.deploymentTransaction().hash);
    console.log('Waiting for block confirmation...');
    await contract.waitForDeployment();

    const address = await contract.getAddress();
    console.log('\nTranscriptNFT deployed to:', address);

    // ── Save deployment info ──────────────────────────────────────────────────
    const deploymentInfo = {
        address,
        abi: artifact.abi,
        network: 'sepolia',
        deployer: deployer.address,
        deployedAt: new Date().toISOString(),
    };

    const outputDir = path.resolve(__dirname, '../src/contracts');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(path.join(outputDir, 'TranscriptNFT.json'), JSON.stringify(deploymentInfo, null, 2));
    console.log('Saved to src/contracts/TranscriptNFT.json');
    console.log('CONTRACT_ADDRESS=' + address);
}

main().catch(console.error);
