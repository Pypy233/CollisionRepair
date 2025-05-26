const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

// Configuration
const RESULTS_DIR = path.join(__dirname, '../../correctness/results');
const CHECKPOINT_PATH = path.join(__dirname, '../../correctness/checkpoints/patch_replay_checkpoint.json');
const RPC_URL = 'http://localhost:7545'; // Change this to your node URL

// Load checkpoint
function loadCheckpoint() {
    if (fs.existsSync(CHECKPOINT_PATH)) {
        try {
            const data = JSON.parse(fs.readFileSync(CHECKPOINT_PATH, 'utf8'));
            return new Set(data.completed || []);
        } catch (e) {
            console.error('Error reading checkpoint, starting fresh.');
        }
    }
    return new Set();
}

// Save checkpoint
function saveCheckpoint(completedSet) {
    const checkpointDir = path.dirname(CHECKPOINT_PATH);
    if (!fs.existsSync(checkpointDir)) {
        fs.mkdirSync(checkpointDir, { recursive: true });
    }
    fs.writeFileSync(CHECKPOINT_PATH, JSON.stringify({
        completed: Array.from(completedSet),
        timestamp: new Date().toISOString()
    }, null, 2));
}

async function deployAndReplay(contractDir) {
    const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
    // Get the first account from the node
    const accounts = await provider.listAccounts();
    if (!accounts || accounts.length === 0) {
        throw new Error('No accounts available in the node');
    }
    const wallet = provider.getSigner(accounts[0]);
    
    // Read patched bytecode file
    const patchedBytecode = '0x' + fs.readFileSync(path.join(contractDir, 'bytecode_patched.hex'), 'utf8').trim();
    
    // Read transaction data
    const txData = JSON.parse(fs.readFileSync(path.join(contractDir, 'transactions.json'), 'utf8'));
    
    // Create results directory
    const resultsDir = path.join(contractDir, 'replay_results');
    if (!fs.existsSync(resultsDir)) {
        fs.mkdirSync(resultsDir);
    }
    
    // Deploy patched contract
    console.log(`Deploying patched contract in ${path.basename(contractDir)}...`);
    const tx = await wallet.sendTransaction({
        data: patchedBytecode,
        gasLimit: 5000000
    });
    const receipt = await tx.wait();
    const address = receipt.contractAddress;
    
    // Replay transactions
    const results = {
        address: address,
        transactions: []
    };
    
    // Replay each transaction
    for (const tx of txData) {
        const contract = new ethers.Contract(address, [], provider);
        const replayTx = await wallet.sendTransaction({
            to: address,
            data: tx.data,
            gasLimit: tx.gasLimit || 5000000
        });
        const replayReceipt = await replayTx.wait();
        
        // Save results
        results.transactions.push({
            txHash: replayReceipt.transactionHash,
            status: replayReceipt.status,
            logs: replayReceipt.logs
        });
    }
    
    // Save results
    fs.writeFileSync(
        path.join(resultsDir, 'patched_replay_results.json'),
        JSON.stringify(results, null, 2)
    );
    
    return results;
}

async function main() {
    // Get all contract directories
    const contractDirs = fs.readdirSync(RESULTS_DIR)
        .filter(dir => dir.startsWith('0x'))
        .map(dir => path.join(RESULTS_DIR, dir));

    // Load checkpoint
    const completed = loadCheckpoint();

    // Process each contract
    for (const contractDir of contractDirs) {
        const contractName = path.basename(contractDir);
        if (completed.has(contractName)) {
            console.log(`Skipping ${contractName} (already processed)`);
            continue;
        }
        try {
            console.log(`\nProcessing ${contractName}...`);
            // Check if required files exist
            const requiredFiles = ['bytecode_patched.hex', 'transactions.json'];
            const missingFiles = requiredFiles.filter(file => !fs.existsSync(path.join(contractDir, file)));
            
            if (missingFiles.length > 0) {
                console.error(`Skipping ${contractName}: Missing required files: ${missingFiles.join(', ')}`);
                completed.add(contractName);
                saveCheckpoint(completed);
                continue;
            }
            await deployAndReplay(contractDir);
            completed.add(contractName);
            saveCheckpoint(completed);
        } catch (error) {
            console.error(`Error processing ${contractName}:`, error);
            // Still save progress so we can resume
            completed.add(contractName);
            saveCheckpoint(completed);
        }
    }
}

main().catch(console.error); 