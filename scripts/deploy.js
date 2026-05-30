import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function main() {
    const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
    const deployer = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);

    console.log('Deploying TranscriptNFT with account:', deployer.address);
    console.log('Balance:', ethers.formatEther(await provider.getBalance(deployer.address)), 'ETH');

    // Read compiled artifact
    const artifactPath = path.resolve(__dirname, '../artifacts/contracts/TranscriptNFT.sol/TranscriptNFT.json');
    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));

    // Deploy
    const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, deployer);
    console.log('Deploying...');
    const contract = await factory.deploy();
    await contract.waitForDeployment();

    const address = await contract.getAddress();
    console.log('TranscriptNFT deployed to:', address);

    // Save deployment info for frontend
    const deploymentInfo = {
        address,
        abi: artifact.abi,
        network: 'sepolia',
        deployer: deployer.address,
        deployedAt: new Date().toISOString(),
    };

    const outputDir = path.resolve(__dirname, '../src/contracts');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    fs.writeFileSync(
        path.join(outputDir, 'TranscriptNFT.json'),
        JSON.stringify(deploymentInfo, null, 2)
    );

    console.log('Deployment info saved to src/contracts/TranscriptNFT.json');
}

main().catch(console.error);
