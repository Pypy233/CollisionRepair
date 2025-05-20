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

// Function to read contract list from file
function readContractList(filePath) {
    return fs.readFileSync(filePath, 'utf8')
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && line.startsWith('0x'));
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

// Function to deploy a contract
async function deployContract(web3, contractAddress, rateLimiter) {
    const contractDir = path.join(__dirname, '../../correctness/results', contractAddress);
    let currentAccount = null;
    
    try {
        if (!fs.existsSync(contractDir)) {
            fs.mkdirSync(contractDir, { recursive: true });
        }

        const deployDir = path.join(contractDir, 'deploy_results');
        if (!fs.existsSync(deployDir)) {
            fs.mkdirSync(deployDir, { recursive: true });
        }

        const resultsPath = path.join(deployDir, 'deploy_results.json');
        if (fs.existsSync(resultsPath)) {
            console.log('Deployment results already exist, skipping...');
            return;
        }

        let attempts = 0;
        const maxAttempts = 10;
        
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

                // Save successful deployment results
                fs.writeFileSync(
                    resultsPath,
                    JSON.stringify({
                        status: 'completed',
                        account: currentAccount,
                        timestamp: new Date().toISOString(),
                        attempts: attempts + 1,
                        output: deployOutput
                    }, null, 2)
                );

                console.log(`Completed deploying ${contractAddress}`);
                return true;
                
            } catch (error) {
                if (isOutOfGasError(error.message)) {
                    console.log('Deployment failed due to out of gas, saving checkpoint and stopping...');
                    fs.writeFileSync(
                        resultsPath,
                        JSON.stringify({
                            status: 'failed',
                            error: 'Deployment failed: out of gas',
                            account: currentAccount,
                            attempt: attempts + 1
                        }, null, 2)
                    );
                    return false;
                } else if (isInsufficientBalanceError(error.message)) {
                    console.log('Insufficient balance, trying next account...');
                    await rateLimiter.waitForSlot();
                    currentAccount = await getNextAccount(web3, currentAccount);
                    attempts++;
                    if (attempts >= maxAttempts) {
                        console.log('Max attempts reached, saving checkpoint and stopping...');
                        fs.writeFileSync(
                            resultsPath,
                            JSON.stringify({
                                status: 'failed',
                                error: 'Deployment failed: insufficient balance after trying all accounts',
                                lastAccount: currentAccount,
                                attempts: attempts
                            }, null, 2)
                        );
                        return false;
                    }
                    continue;
                }
                throw error;
            }
        }
        
    } catch (error) {
        console.error(`Error deploying ${contractAddress}:`, error);
        const deployDir = path.join(contractDir, 'deploy_results');
        if (!fs.existsSync(deployDir)) {
            fs.mkdirSync(deployDir, { recursive: true });
        }
        fs.writeFileSync(
            path.join(deployDir, 'deploy_results.json'),
            JSON.stringify({
                status: 'failed',
                error: error.message,
                account: currentAccount || 'unknown',
                attempts: attempts + 1
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

        const contractsFile = path.join(__dirname, '../../correctness/contracts.txt');
        const contracts = readContractList(contractsFile);
        const totalContracts = contracts.length;
        console.log(`Found ${totalContracts} contracts to deploy`);
        
        let successCount = 0;
        for (let i = 0; i < contracts.length; i++) {
            const contract = contracts[i];
            console.log(`\n[${i + 1}/${totalContracts}] Deploying contract ${contract}...`);
            const success = await deployContract(web3, contract, rateLimiter);
            if (success) successCount++;
        }
        
        console.log('\nDeployment completed!');
        console.log(`Successfully deployed ${successCount} out of ${totalContracts} contracts`);
        console.log('Results are saved in evaluation/correctness/results/');
        
    } catch (error) {
        console.error('Deployment failed:', error);
        process.exit(1);
    }
}

main(); 