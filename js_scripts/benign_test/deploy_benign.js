const { Web3 } = require('web3');
const fs = require('fs');
const path = require('path');

// Connect to forked network
const web3 = new Web3('http://127.0.0.1:7545');

async function deployContract(bytecodeFile, abiFile, constructorArgs = [], deployer) {
    try {
        // Read bytecode and ABI from files
        const bytecode = fs.readFileSync(bytecodeFile, 'utf8').trim();
        const abi = JSON.parse(fs.readFileSync(abiFile, 'utf8'));

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

        console.log('Contract deployed at address:', deployedContract.options.address);
        return deployedContract.options.address;
    } catch (error) {
        console.error('Error deploying contract:', error);
        throw error;
    }
}

async function main() {
    try {
        // Get the test directory
        const testDir = __dirname;

        // Get accounts from forked network
        const accounts = await web3.eth.getAccounts();
        const deployer = accounts[0]; // Using first account as deployer
        
        console.log('Deployer address:', deployer);

        // Deploy test contract
        console.log('\nDeploying test contract...');
        const testAddress = await deployContract(
            path.join(testDir, 'test.bin.instrumented'),
            path.join(testDir, 'test.abi'),
            [],  // No constructor arguments needed
            deployer
        );
        console.log('Test contract deployed at:', testAddress);

        // Create contract instance for interaction
        const testContract = new web3.eth.Contract(
            JSON.parse(fs.readFileSync(path.join(testDir, 'test.abi'), 'utf8')),
            testAddress
        );

        // Test some operations
        console.log('\nTesting operations...');
        // Add your test operations here based on the test contract's interface

        console.log('\nDeployment and verification completed successfully!');
        console.log('Test contract:', testAddress);

    } catch (error) {
        console.error('Deployment failed:', error);
        process.exit(1);
    }
}

main();
