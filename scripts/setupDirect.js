import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const RPC = process.env.SEPOLIA_RPC_URL || process.env.RPC_URL;

const SCHOOLS = [
    { address: '0xA708D88dC049186691561c5F90DCd55a498af8f9', name: 'Universitas TranscriptChain' },
];

async function broadcastAndWait(provider, signer, txRequest, label) {
    const signed = await signer.signTransaction(txRequest);

    // Fire-and-forget broadcast
    const body = JSON.stringify({
        jsonrpc: '2.0', id: 1,
        method: 'eth_sendRawTransaction',
        params: [signed],
    });
    let txHash = null;
    try {
        const resp = await Promise.race([
            fetch(RPC, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }).then(r => r.json()),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000)),
        ]);
        if (resp.result) txHash = resp.result;
        else if (resp.error) console.log(`  Broadcast error: ${JSON.stringify(resp.error)}`);
    } catch {
        // RPC may not respond — tx is still in mempool
    }

    if (txHash) console.log(`  ${label} tx: ${txHash}`);
    else console.log(`  ${label}: broadcast sent (no hash returned — polling receipt)`);

    // Poll for receipt by checking if the tx nonce has been consumed
    const nonceBefore = txRequest.nonce;
    process.stdout.write(`  Waiting for nonce ${nonceBefore} to confirm`);
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
        const confirmed = await provider.getTransactionCount(signer.address, 'latest');
        if (confirmed > nonceBefore) {
            console.log(' confirmed.');
            return;
        }
        process.stdout.write('.');
        await new Promise(r => setTimeout(r, 5000));
    }
    console.log('\nTimeout waiting for confirmation.');
    process.exit(1);
}

async function main() {
    const provider = new ethers.JsonRpcProvider(RPC);
    const admin = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);

    const contractPath = path.resolve(__dirname, '../src/contracts/TranscriptNFT.json');
    const { address, abi } = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
    const contract = new ethers.Contract(address, abi, admin);

    const feeData = await provider.getFeeData();
    const baseFee = feeData.lastBaseFeePerGas || ethers.parseUnits('2', 'gwei');
    const gasOpts = {
        maxFeePerGas: baseFee + ethers.parseUnits('5', 'gwei'),
        maxPriorityFeePerGas: ethers.parseUnits('2', 'gwei'),
        gasLimit: 100_000n,
        chainId: 11155111n,
    };

    let nonce = await provider.getTransactionCount(admin.address, 'latest');
    console.log('Contract:', address);
    console.log('Admin:', admin.address, '| nonce:', nonce);

    // 1. Set ministry address
    const ministryWallet = process.env.MINISTRY_WALLET;
    console.log('\nSetting ministry address:', ministryWallet);
    const setMinistryData = contract.interface.encodeFunctionData('setMinistryAddress', [ministryWallet]);
    await broadcastAndWait(provider, admin, { to: address, data: setMinistryData, nonce, ...gasOpts }, 'setMinistryAddress');
    nonce++;

    // 2. Register schools
    for (const school of SCHOOLS) {
        console.log(`\nRegistering school: ${school.name} (${school.address})`);
        const registerData = contract.interface.encodeFunctionData('registerSchool', [school.address, school.name]);
        await broadcastAndWait(provider, admin, { to: address, data: registerData, nonce, ...gasOpts }, 'registerSchool');
        nonce++;
    }

    // 3. Verify
    const onChainMinistry = await contract.ministryAddress();
    const isSchoolRegistered = await contract.isSchoolRegistered(SCHOOLS[0].address);
    console.log('\nVerification:');
    console.log('  ministryAddress:', onChainMinistry);
    console.log('  school registered:', isSchoolRegistered);
    console.log('\nSetup complete!');
}

main().catch(console.error);
