const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { Web3 } = require('web3');

// Rate limiter class
class RateLimiter {
    constructor(maxRequestsPerSecond) {
        this.maxRequestsPerSecond = maxRequestsPerSecond;
        this.requests = [];
    }

    async waitForSlot() {
        const now = Date.now();
        this.requests = this.requests.filter(time => now - time < 1000);
        
        if (this.requests.length >= this.maxRequestsPerSecond) {
            const oldestRequest = this.requests[0];
            const waitTime = 1000 - (now - oldestRequest);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            return this.waitForSlot();
        }
        
        this.requests.push(now);
    }
}

// Function to connect to Ganache with retry logic
async function connectToGanache(maxRetries = 3, retryDelay = 2000) {
    let retries = 0;
    while (retries < maxRetries) {
        try {
            const web3 = new Web3('http://127.0.0.1:7545');
            await web3.eth.getAccounts();
            return web3;
        } catch (error) {
            retries++;
            if (retries === maxRetries) {
                throw new Error(`Failed to connect to Ganache after ${maxRetries} attempts: ${error.message}`);
            }
            console.log(`Connection to Ganache failed, retrying in ${retryDelay/1000} seconds... (${retries}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
    }
}

// Function to get deployed contracts
function getDeployedContracts() {
    const resultsDir = path.join(__dirname, '../../correctness/results');
    if (!fs.existsSync(resultsDir)) {
        return [];
    }
    
    return fs.readdirSync(resultsDir)
        .filter(dir => dir.startsWith('0x'))
        .filter(dir => {
            const deployResultsPath = path.join(resultsDir, dir, 'deploy_results', 'deploy_results.json');
            if (!fs.existsSync(deployResultsPath)) return false;
            
            const results = JSON.parse(fs.readFileSync(deployResultsPath, 'utf8'));
            return results.status === 'completed';
        });
}

// Function to replay transactions for a contract
async function replayTransactions(web3, contractAddress, rateLimiter) {
    const contractDir = path.join(__dirname, '../../correctness/results', contractAddress);
    let currentAccount = null;
    
    try {
        const replayDir = path.join(contractDir, 'replay_results');
        if (!fs.existsSync(replayDir)) {
            fs.mkdirSync(replayDir, { recursive: true });
        }

        const resultsPath = path.join(replayDir, 'replay_results.json');
        if (fs.existsSync(resultsPath)) {
            console.log('Replay results already exist, skipping...');
            return true;
        }

        // Get initial account
        await rateLimiter.waitForSlot();
        currentAccount = (await web3.eth.getAccounts())[0];

        console.log(`Replaying transactions for ${contractAddress}...`);
        
        await rateLimiter.waitForSlot();
        const replayOutput = execSync(
            `node ${path.join(__dirname, '../../../js_scripts/batch_run/replay.js')} ${contractAddress} ${currentAccount}`,
            { encoding: 'utf8' }
        );
        console.log(replayOutput);

        // Save successful replay results
        fs.writeFileSync(
            resultsPath,
            JSON.stringify({
                status: 'completed',
                account: currentAccount,
                timestamp: new Date().toISOString(),
                output: replayOutput
            }, null, 2)
        );

        console.log(`Completed replaying transactions for ${contractAddress}`);
        return true;
        
    } catch (error) {
        console.error(`Error replaying transactions for ${contractAddress}:`, error);
        const replayDir = path.join(contractDir, 'replay_results');
        if (!fs.existsSync(replayDir)) {
            fs.mkdirSync(replayDir, { recursive: true });
        }
        fs.writeFileSync(
            path.join(replayDir, 'replay_results.json'),
            JSON.stringify({
                status: 'failed',
                error: error.message,
                account: currentAccount || 'unknown'
            }, null, 2)
        );
        return false;
    }
}

// Main function
async function main() {
    try {
        console.log('Connecting to Ganache...');
        const web3 = await connectToGanache();
        console.log('Connected to Ganache successfully');

        const rateLimiter = new RateLimiter(4);

        const contracts = getDeployedContracts();
        const totalContracts = contracts.length;
        console.log(`Found ${totalContracts} deployed contracts to replay transactions for`);
        
        let successCount = 0;
        for (let i = 0; i < contracts.length; i++) {
            const contract = contracts[i];
            console.log(`\n[${i + 1}/${totalContracts}] Replaying transactions for contract ${contract}...`);
            const success = await replayTransactions(web3, contract, rateLimiter);
            if (success) successCount++;
        }
        
        console.log('\nTransaction replay completed!');
        console.log(`Successfully replayed transactions for ${successCount} out of ${totalContracts} contracts`);
        console.log('Results are saved in evaluation/correctness/results/');
        
    } catch (error) {
        console.error('Transaction replay failed:', error);
        process.exit(1);
    }
}

main(); 