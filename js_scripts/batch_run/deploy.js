const fs = require('fs');
const path = require('path');
const { Web3 } = require('web3');

// Get command line arguments
const contractAddress = process.argv[2];
const deployerAddress = process.argv[3];

if (!contractAddress || !deployerAddress) {
    console.error('Usage: node deploy.js <contract_address> <deployer_address>');
    process.exit(1);
}

async function deployContract() {
    try {
        // Connect to Ganache
        const web3 = new Web3('http://127.0.0.1:7545');

        // Read original bytecode
        const contractDir = path.join(__dirname, '../../evaluation/correctness/results', contractAddress);
        const bytecodePath = path.join(contractDir, 'bytecode.hex');
        
        if (!fs.existsSync(bytecodePath)) {
            throw new Error(`Bytecode file not found at ${bytecodePath}`);
        }

        const bytecode = '0x' + fs.readFileSync(bytecodePath, 'utf8').trim();

        // Deploy contract
        console.log(`Deploying contract ${contractAddress}...`);
        const deployTx = await web3.eth.sendTransaction({
            from: deployerAddress,
            data: bytecode,
            gas: 6000000  // Set a high gas limit
        });

        console.log(`Contract deployed successfully!`);
        console.log(`Transaction hash: ${deployTx.transactionHash}`);
        console.log(`Contract address: ${deployTx.contractAddress}`);

        // Save deployment info
        const deploymentInfo = {
            originalAddress: contractAddress,
            deployedAddress: deployTx.contractAddress,
            transactionHash: deployTx.transactionHash,
            deployer: deployerAddress,
            timestamp: new Date().toISOString()
        };

        const deploymentPath = path.join(contractDir, 'deployment_info.json');
        fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));

    } catch (error) {
        console.error('Deployment failed:', error.message);
        process.exit(1);
    }
}

deployContract();