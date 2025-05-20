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
async function connectToGanache(rateLimiter, maxRetries = 3, retryDelay = 2000) {
    let retries = 0;
    while (retries < maxRetries) {
        try {
            const web3 = new Web3('http://127.0.0.1:7545');
            // Add rate limiter to web3 instance
            const originalSend = web3.eth.sendTransaction;
            web3.eth.sendTransaction = async function(...args) {
                await rateLimiter.waitForSlot();
                return originalSend.apply(this, args);
            };
            const originalCall = web3.eth.call;
            web3.eth.call = async function(...args) {
                await rateLimiter.waitForSlot();
                return originalCall.apply(this, args);
            };
            const originalEstimateGas = web3.eth.estimateGas;
            web3.eth.estimateGas = async function(...args) {
                await rateLimiter.waitForSlot();
                return originalEstimateGas.apply(this, args);
            };
            const originalGetAccounts = web3.eth.getAccounts;
            web3.eth.getAccounts = async function(...args) {
                await rateLimiter.waitForSlot();
                return originalGetAccounts.apply(this, args);
            };
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

// Function to check if error is out of gas
function isOutOfGasError(error) {
    return error && (
        error.includes('out of gas') || 
        error.includes('insufficient gas') ||
        error.includes('gas required exceeds allowance')
    );
}

// Function to check if error is insufficient balance
function isInsufficientBalanceError(error) {
    return error && (
        error.includes('insufficient balance') ||
        error.includes('insufficient funds') ||
        error.includes('exceeds balance')
    );
}

// Function to get next available account
async function getNextAccount(web3, currentAccount) {
    const accounts = await web3.eth.getAccounts();
    const currentIndex = accounts.indexOf(currentAccount);
    if (currentIndex === -1 || currentIndex === accounts.length - 1) {
        return accounts[0];
    }
    return accounts[currentIndex + 1];
}

// Function to save checkpoint
function saveCheckpoint(contracts, currentIndex) {
    const checkpointDir = path.join(__dirname, '../../correctness/checkpoints');
    if (!fs.existsSync(checkpointDir)) {
        fs.mkdirSync(checkpointDir, { recursive: true });
    }
    fs.writeFileSync(
        path.join(checkpointDir, 'deploy_checkpoint.json'),
        JSON.stringify({
            lastProcessedIndex: currentIndex,
            remainingContracts: contracts.slice(currentIndex),
            timestamp: new Date().toISOString()
        }, null, 2)
    );
}

// Function to load checkpoint
function loadCheckpoint() {
    const checkpointPath = path.join(__dirname, '../../correctness/checkpoints/deploy_checkpoint.json');
    if (fs.existsSync(checkpointPath)) {
        const checkpoint = JSON.parse(fs.readFileSync(checkpointPath, 'utf8'));
        console.log(`Found checkpoint from ${checkpoint.timestamp}`);
        console.log(`Last processed index: ${checkpoint.lastProcessedIndex}`);
        return checkpoint;
    }
    return null;
}

// Function to process a contract
async function processContract(web3, contractAddress, rateLimiter) {
    const contractDir = path.join(__dirname, '../../correctness/results', contractAddress);
    let currentAccount = null;
    let attempts = 0;
    const maxAttempts = 10;
    
    try {
        if (!fs.existsSync(contractDir)) {
            fs.mkdirSync(contractDir, { recursive: true });
        }

        const replayResultsDir = path.join(contractDir, 'replay_results');
        if (!fs.existsSync(replayResultsDir)) {
            fs.mkdirSync(replayResultsDir, { recursive: true });
        }

        // Check if already processed but continue anyway
        const resultsPath = path.join(replayResultsDir, 'original_replay_results.json');
        if (fs.existsSync(resultsPath)) {
            console.log('Results exist, overwriting...');
        }

        while (attempts < maxAttempts) {
            try {
                if (!currentAccount) {
                    await rateLimiter.waitForSlot();
                    currentAccount = (await web3.eth.getAccounts())[0];
                }

                console.log(`Attempting deployment with account ${currentAccount} (attempt ${attempts + 1}/${maxAttempts})...`);
                
                await rateLimiter.waitForSlot();
                const deployOutput = execSync(
                    `node ${path.join(__dirname, '../../../js_scripts/batch_run/deploy.js')} ${contractAddress} ${currentAccount}`,
                    { encoding: 'utf8' }
                );
                console.log(deployOutput);

                return true;
            } catch (error) {
                if (isOutOfGasError(error.message)) {
                    console.log('Deployment failed due to out of gas, saving checkpoint and stopping...');
                    fs.writeFileSync(
                        path.join(replayResultsDir, 'original_replay_results.json'),
                        JSON.stringify([{
                            status: 'failed',
                            error: 'Deployment failed: out of gas',
                            checkpoint: 'deployment',
                            account: currentAccount
                        }], null, 2)
                    );
                    return false;
                } else if (isInsufficientBalanceError(error.message)) {
                    console.log('Insufficient balance, trying next account...');
                    currentAccount = await getNextAccount(web3, currentAccount);
                    attempts++;
                    if (attempts >= maxAttempts) {
                        console.log('Max attempts reached, saving checkpoint and stopping...');
                        fs.writeFileSync(
                            path.join(replayResultsDir, 'original_replay_results.json'),
                            JSON.stringify([{
                                status: 'failed',
                                error: 'Deployment failed: insufficient balance after trying all accounts',
                                checkpoint: 'deployment',
                                lastAccount: currentAccount
                            }], null, 2)
                        );
                        return false;
                    }
                    continue;
                }
                throw error;
            }
        }
        return false;
    } catch (error) {
        console.error(`Error processing ${contractAddress}:`, error);
        const replayResultsDir = path.join(contractDir, 'replay_results');
        if (!fs.existsSync(replayResultsDir)) {
            fs.mkdirSync(replayResultsDir, { recursive: true });
        }
        fs.writeFileSync(
            path.join(replayResultsDir, 'original_replay_results.json'),
            JSON.stringify([{
                status: 'failed',
                error: error.message,
                checkpoint: 'error',
                account: currentAccount
            }], null, 2)
        );
        return false;
    }
}

// Function to read contract list
function readContractList(filePath) {
    if (!fs.existsSync(filePath)) {
        throw new Error(`Contract list file not found: ${filePath}`);
    }
    return fs.readFileSync(filePath, 'utf8')
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && line.startsWith('0x'));
}

// Main function
async function main() {
    try {
        console.log('Connecting to Ganache...');
        const rateLimiter = new RateLimiter(4);
        const web3 = await connectToGanache(rateLimiter);
        console.log('Connected to Ganache successfully');

        // Read contract list
        const contractsFile = path.join(__dirname, '../../correctness/contracts.txt');
        const contracts = readContractList(contractsFile);
        console.log(`Found ${contracts.length} contracts to process`);

        // Load checkpoint if exists
        const checkpoint = loadCheckpoint();
        let startIndex = checkpoint ? checkpoint.lastProcessedIndex + 1 : 0;
        
        // Initialize counters
        let successCount = 0;
        let failureCount = 0;
        
        // Process each contract with delay between them
        for (let i = startIndex; i < contracts.length; i++) {
            const contract = contracts[i];
            console.log(`\nProcessing contract ${i + 1}/${contracts.length} (${contract})`);
            
            const success = await processContract(web3, contract, rateLimiter);
            if (success) {
                successCount++;
            } else {
                failureCount++;
            }
            
            // Save checkpoint after each contract
            saveCheckpoint(contracts, i);
            
            // Print progress
            console.log(`\nProgress: ${i + 1}/${contracts.length} contracts processed`);
            console.log(`Success: ${successCount}, Failures: ${failureCount}`);
            
            // Add delay between contracts
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        // Save final summary
        const summary = {
            totalContracts: contracts.length,
            successCount,
            failureCount,
            completionTime: new Date().toISOString()
        };
        
        const summaryPath = path.join(__dirname, '../../correctness/results/summary.json');
        fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
        
        console.log('\nBatch processing completed!');
        console.log(`Total contracts: ${contracts.length}`);
        console.log(`Successful: ${successCount}`);
        console.log(`Failed: ${failureCount}`);
        console.log('Results are saved in evaluation/correctness/results/');
        
        // Clean up checkpoint if everything completed successfully
        const checkpointPath = path.join(__dirname, '../../correctness/checkpoints/deploy_checkpoint.json');
        if (fs.existsSync(checkpointPath)) {
            fs.unlinkSync(checkpointPath);
        }
        
    } catch (error) {
        console.error('Processing failed:', error);
        process.exit(1);
    }
}

main(); 