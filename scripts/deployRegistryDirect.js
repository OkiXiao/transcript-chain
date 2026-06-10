import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const RPC = process.env.SEPOLIA_RPC_URL || process.env.RPC_URL;

async function broadcast(provider, signedTx) {
    // Fire-and-forget via raw fetch — avoids ethers waiting on the HTTP response
    const body = JSON.stringify({
        jsonrpc: '2.0', id: 1,
        method: 'eth_sendRawTransaction',
        params: [signedTx],
    });
    fetch(RPC, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
        .then(r => r.json())
        .then(j => {
            if (j.result) console.log('Broadcast accepted, tx hash:', j.result);
            else if (j.error) console.log('Broadcast response:', JSON.stringify(j.error));
        })
        .catch(() => { /* RPC may not respond — that's OK */ });
}

async function pollForCode(provider, address, intervalMs = 5000, timeoutMs = 300_000) {
    const deadline = Date.now() + timeoutMs;
    process.stdout.write('Polling for deployed bytecode');
    while (Date.now() < deadline) {
        const code = await provider.getCode(address);
        if (code !== '0x') {
            console.log('\nContract confirmed at', address);
            return true;
        }
        process.stdout.write('.');
        await new Promise(r => setTimeout(r, intervalMs));
    }
    console.log('\nTimeout — contract not confirmed within 5 minutes.');
    return false;
}

async function main() {
    const provider = new ethers.JsonRpcProvider(RPC);
    const deployer = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);

    const confirmedNonce = await provider.getTransactionCount(deployer.address, 'latest');
    const pendingNonce   = await provider.getTransactionCount(deployer.address, 'pending');
    const balance        = await provider.getBalance(deployer.address);
    const feeData        = await provider.getFeeData();

    console.log('Deployer :', deployer.address);
    console.log('Balance  :', ethers.formatEther(balance), 'ETH');
    console.log('Nonce    : confirmed =', confirmedNonce, '| pending =', pendingNonce);
    console.log('Base fee :', ethers.formatUnits(feeData.gasPrice || 0n, 'gwei'), 'Gwei');

    if (pendingNonce > confirmedNonce) {
        console.error('There are pending txs in mempool! Wait for them to confirm first.');
        process.exit(1);
    }

    // Load artifact
    const artifactPath = path.resolve(__dirname, '../artifacts/contracts/UserRegistry.sol/UserRegistry.json');
    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));

    // Get trusted signer address from private key
    const signerWallet = new ethers.Wallet(process.env.REGISTRY_SIGNER_PRIVATE_KEY);
    console.log('\nTrusted signer:', signerWallet.address);

    // Predict address
    const predictedAddress = ethers.getCreateAddress({ from: deployer.address, nonce: confirmedNonce });
    console.log('Predicted contract address:', predictedAddress);

    // Build deployment tx
    const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, deployer);
    const deployTx = await factory.getDeployTransaction(signerWallet.address);
    deployTx.nonce = confirmedNonce;
    deployTx.gasLimit = 1_500_000n;
    deployTx.maxFeePerGas = ethers.parseUnits('20', 'gwei');
    deployTx.maxPriorityFeePerGas = ethers.parseUnits('2', 'gwei');
    deployTx.chainId = 11155111n; // Sepolia

    const signedTx = await deployer.signTransaction(deployTx);
    console.log('\nBroadcasting signed tx (fire-and-forget)...');
    await broadcast(provider, signedTx);

    // Poll until confirmed
    const confirmed = await pollForCode(provider, predictedAddress);
    if (!confirmed) {
        console.log('\nManual check: look up', deployer.address, 'on Sepolia Etherscan.');
        process.exit(1);
    }

    // Save result
    const deploymentInfo = {
        address: predictedAddress,
        abi: artifact.abi,
        trustedSigner: signerWallet.address,
        network: 'sepolia',
        deployer: deployer.address,
        deployedAt: new Date().toISOString(),
    };

    const outputDir = path.resolve(__dirname, '../src/contracts');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(path.join(outputDir, 'UserRegistry.json'), JSON.stringify(deploymentInfo, null, 2));
    console.log('Saved to src/contracts/UserRegistry.json');
    console.log('USER_REGISTRY_ADDRESS=' + predictedAddress);
}

main().catch(console.error);
