const { Web3 } = require('web3');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Connect to forked network
const web3 = new Web3('http://127.0.0.1:7545');

// Etherscan API configuration
const ETHERSCAN_API_KEY = 'KZKJBGG6YVWH6S3PVSRY5YTPI7X2HSCI2B';
const ETHERSCAN_API_URL = 'https://api.etherscan.io/api';

async function getContractBytecode(contractAddress) {
    try {
        const response = await axios.get(ETHERSCAN_API_URL, {
            params: {
                module: 'proxy',
                action: 'eth_getCode',
                address: contractAddress,
                tag: 'latest',
                apikey: ETHERSCAN_API_KEY
            }
        });

        if (response.data && response.data.result) {
            const bytecode = response.data.result;
            if (bytecode === '0x' || bytecode === '') {
                throw new Error('No bytecode found at the specified address');
            }
            return bytecode;
        } else {
            throw new Error(`Etherscan API error: ${response.data.message || 'Unknown error'}`);
        }
    } catch (error) {
        console.error('Error fetching contract bytecode:', error);
        throw error;
    }
}

async function getContractABI(contractAddress) {
    try {
        // First try to read from saved ABI file
        const contractDir = path.join(__dirname, '../../evaluation/correctness/results', contractAddress);
        const abiPath = path.join(contractDir, 'abi.json');
        if (fs.existsSync(abiPath)) {
            return JSON.parse(fs.readFileSync(abiPath, 'utf8'));
        }

        // If not found, try to fetch from Etherscan
        const response = await axios.get(ETHERSCAN_API_URL, {
            params: {
                module: 'contract',
                action: 'getabi',
                address: contractAddress,
                apikey: ETHERSCAN_API_KEY
            }
        });

        if (response.data.status === '1') {
            const abi = JSON.parse(response.data.result);
            // Save the ABI for future use
            if (!fs.existsSync(contractDir)) {
                fs.mkdirSync(contractDir, { recursive: true });
            }
            fs.writeFileSync(abiPath, JSON.stringify(abi, null, 2));
            return abi;
        } else {
            throw new Error(`Etherscan API error: ${response.data.message || 'Unknown error'}`);
        }
    } catch (error) {
        console.error('Error fetching contract ABI:', error);
        // If we can't get the ABI, return a minimal ABI that allows basic interactions
        return [
            {
                "inputs": [],
                "name": "fallback",
                "outputs": [],
                "stateMutability": "payable",
                "type": "function"
            },
            {
                "inputs": [],
                "name": "receive",
                "outputs": [],
                "stateMutability": "payable",
                "type": "function"
            }
        ];
    }
}

async function deployContract(bytecode, abi, constructorArgs = [], deployer, contractName) {
    try {
        console.log('Deploying contract from account:', deployer);

        // Create contract instance
        const contract = new web3.eth.Contract(abi);

        // Deploy contract
        const deployTx = contract.deploy({
            data: bytecode,
            arguments: constructorArgs
        });

        // Estimate gas
        const gas = await deployTx.estimateGas();
        console.log('Estimated gas:', gas);

        // Get current gas price
        const gasPrice = await web3.eth.getGasPrice();
        console.log('Current gas price:', gasPrice);

        // Calculate total cost
        const totalCost = BigInt(gas) * BigInt(gasPrice);
        console.log('Total deployment cost:', web3.utils.fromWei(totalCost.toString(), 'ether'), 'ETH');

        // Send deployment transaction with legacy pricing
        const deployedContract = await deployTx.send({
            from: deployer,
            gas: gas,
            gasPrice: gasPrice,
            type: '0x0'  // Explicitly set transaction type to legacy
        });

        const contractAddress = deployedContract.options.address;
        console.log('Contract deployed at address:', contractAddress);

        // Create directory for contract data
        const contractDir = path.join(__dirname, '../../evaluation/correctness/results', contractAddress);
        if (!fs.existsSync(contractDir)) {
            fs.mkdirSync(contractDir, { recursive: true });
        }

        // Save contract address
        fs.writeFileSync(
            path.join(contractDir, 'address.txt'),
            contractAddress
        );

        // Save contract name
        fs.writeFileSync(
            path.join(contractDir, 'name.txt'),
            contractName
        );

        // Save original bytecode and ABI
        fs.writeFileSync(
            path.join(contractDir, 'bytecode.txt'),
            bytecode
        );
        fs.writeFileSync(
            path.join(contractDir, 'abi.json'),
            JSON.stringify(abi, null, 2)
        );

        return contractAddress;
    } catch (error) {
        console.error('Error deploying contract:', error);
        throw error;
    }
}

async function fetchHistoricalTransactions(contractAddress) {
    try {
        const response = await axios.get(ETHERSCAN_API_URL, {
            params: {
                module: 'account',
                action: 'txlist',
                address: contractAddress,
                startblock: 0,
                endblock: 99999999,
                sort: 'asc',
                apikey: ETHERSCAN_API_KEY
            }
        });

        if (response.data.status === '1') {
            const contractDir = path.join(__dirname, '../../evaluation/correctness/results', contractAddress);
            // Create directory if it doesn't exist
            if (!fs.existsSync(contractDir)) {
                fs.mkdirSync(contractDir, { recursive: true });
            }
            fs.writeFileSync(
                path.join(contractDir, 'transactions.json'),
                JSON.stringify(response.data.result, null, 2)
            );
            return response.data.result;
        } else {
            throw new Error(`Etherscan API error: ${response.data.message}`);
        }
    } catch (error) {
        console.error('Error fetching historical transactions:', error);
        throw error;
    }
}

async function replayTransaction(tx, contract) {
    try {
        // Set a minimum gas limit to ensure transaction has enough gas
        const minGasLimit = 21000; // Base gas cost
        const gasLimit = Math.max(tx.gas || minGasLimit, minGasLimit);
        
        // Add buffer to gas limit (30% more for complex transactions)
        const adjustedGasLimit = Math.floor(gasLimit * 1.3);

        console.log(`Transaction ${tx.hash}:`);
        console.log(`- Original gas limit: ${tx.gas || 'not specified'}`);
        console.log(`- Adjusted gas limit: ${adjustedGasLimit}`);

        // First try to estimate gas for this specific transaction
        let finalGasLimit = adjustedGasLimit;
        try {
            const estimatedGas = await web3.eth.estimateGas({
                from: tx.from,
                to: tx.to,
                data: tx.input,
                value: tx.value
            });
            // Use the higher of estimated gas or adjusted gas limit
            finalGasLimit = Math.max(estimatedGas, adjustedGasLimit);
            console.log(`- Estimated gas: ${estimatedGas}`);
            console.log(`- Final gas limit: ${finalGasLimit}`);
        } catch (error) {
            console.log(`- Gas estimation failed, using adjusted limit: ${finalGasLimit}`);
        }

        // Simulate the transaction using eth_call
        const txResult = await web3.eth.call({
            from: tx.from,
            to: tx.to,
            data: tx.input,
            value: tx.value,
            gas: finalGasLimit,
            gasPrice: tx.gasPrice
        });

        return {
            hash: tx.hash,
            status: 'success',
            result: txResult,
            gasUsed: finalGasLimit
        };
    } catch (error) {
        // Check if error is due to out of gas
        if (error.message && (
            error.message.includes('out of gas') ||
            error.message.includes('gas required exceeds allowance') ||
            error.message.includes('insufficient gas')
        )) {
            console.log(`Transaction ${tx.hash} failed due to insufficient gas`);
            return {
                hash: tx.hash,
                status: 'failed',
                error: 'Insufficient gas',
                gasLimit: tx.gas,
                adjustedGasLimit: Math.floor((tx.gas || 21000) * 1.3)
            };
        }

        return {
            hash: tx.hash,
            status: 'failed',
            error: error.message
        };
    }
}

async function main() {
    try {
        // Check if contract address is provided
        if (process.argv.length < 3) {
            console.error('Please provide a contract address as an argument');
            console.error('Usage: node deploy.js <contract_address>');
            process.exit(1);
        }

        const originalContractAddress = process.argv[2];
        console.log('Original contract address:', originalContractAddress);

        // Get accounts from forked network
        const accounts = await web3.eth.getAccounts();
        const deployer = accounts[0]; // Using first account as deployer
        
        console.log('Deployer address:', deployer);

        // Determine if we're using patched bytecode
        const isPatched = process.argv[3] === '--patched';
        const contractDir = path.join(__dirname, '../../evaluation/correctness/results', originalContractAddress);
        const targetDir = isPatched ? path.join(contractDir, 'patched') : contractDir;

        // Create directory if it doesn't exist
        if (!fs.existsSync(contractDir)) {
            fs.mkdirSync(contractDir, { recursive: true });
        }
        if (isPatched && !fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }

        // Get bytecode
        console.log('\nFetching contract bytecode...');
        let bytecode;
        const bytecodePath = path.join(targetDir, 'bytecode.txt');
        
        if (fs.existsSync(bytecodePath)) {
            bytecode = fs.readFileSync(bytecodePath, 'utf8').trim();
            console.log('Contract bytecode read from file');
        } else {
            bytecode = await getContractBytecode(originalContractAddress);
            fs.writeFileSync(bytecodePath, bytecode);
            console.log('Contract bytecode fetched and saved');
        }

        // Fetch contract ABI
        console.log('\nFetching contract ABI...');
        const abi = await getContractABI(originalContractAddress);
        console.log('Contract ABI fetched successfully');

        // Deploy contract
        console.log('\nDeploying contract...');
        const testAddress = await deployContract(
            bytecode,
            abi,
            [],  // No constructor arguments needed
            deployer,
            isPatched ? 'PatchedContract' : 'TestContract'
        );
        console.log('Contract deployed at:', testAddress);

        // Fetch historical transactions
        console.log('\nFetching historical transactions...');
        const transactions = await fetchHistoricalTransactions(originalContractAddress);
        console.log(`Found ${transactions.length} transactions`);

        // Create contract instance for replay
        const testContract = new web3.eth.Contract(abi, testAddress);

        // Replay transactions
        console.log('\nReplaying transactions...');
        const replayResults = [];
        let outOfGasCount = 0;
        let successCount = 0;
        let otherErrorCount = 0;

        for (const tx of transactions) {
            console.log(`\nReplaying transaction ${tx.hash}...`);
            const result = await replayTransaction(tx, testContract);
            replayResults.push(result);

            // Count different types of results
            if (result.status === 'success') {
                successCount++;
            } else if (result.error === 'Insufficient gas') {
                outOfGasCount++;
            } else {
                otherErrorCount++;
            }
        }

        // Add summary to replay results
        const summary = {
            totalTransactions: transactions.length,
            successfulTransactions: successCount,
            outOfGasTransactions: outOfGasCount,
            otherErrors: otherErrorCount,
            timestamp: new Date().toISOString()
        };

        // Save replay results with summary
        fs.writeFileSync(
            path.join(targetDir, 'replay_results.json'),
            JSON.stringify({
                summary,
                transactions: replayResults
            }, null, 2)
        );

        console.log('\nDeployment and transaction replay completed!');
        console.log('Summary:');
        console.log(`- Total transactions: ${summary.totalTransactions}`);
        console.log(`- Successful: ${summary.successfulTransactions}`);
        console.log(`- Out of gas: ${summary.outOfGasTransactions}`);
        console.log(`- Other errors: ${summary.otherErrors}`);
        console.log('Results saved in:', targetDir);

    } catch (error) {
        console.error('Process failed:', error);
        process.exit(1);
    }
}

main();