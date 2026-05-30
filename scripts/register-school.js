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

    // Read contract info
    const contractPath = path.resolve(__dirname, '../src/contracts/TranscriptNFT.json');
    const contractData = JSON.parse(fs.readFileSync(contractPath, 'utf8'));

    const contract = new ethers.Contract(contractData.address, contractData.abi, deployer);

    // Register the deployer wallet as a school
    const schoolAddress = deployer.address;
    const schoolName = "Universitas Demo TranscriptChain";

    console.log(`\n📝 Registering school...`);
    console.log(`   Address: ${schoolAddress}`);
    console.log(`   Name: ${schoolName}`);

    const tx = await contract.registerSchool(schoolAddress, schoolName);
    console.log(`\n⏳ Transaction sent: ${tx.hash}`);
    console.log(`   View: https://sepolia.etherscan.io/tx/${tx.hash}`);

    const receipt = await tx.wait();
    console.log(`\n✅ School registered successfully!`);
    console.log(`   Block: ${receipt.blockNumber}`);
    console.log(`   Gas used: ${receipt.gasUsed.toString()}`);
}

main().catch(console.error);
