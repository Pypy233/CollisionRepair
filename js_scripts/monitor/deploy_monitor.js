const { Web3 } = require('web3');
const fs = require('fs');
const path = require('path');

// Connect to local Ganache
const web3 = new Web3('http://127.0.0.1:7545');

async function deployContract() {
    try {
        // Read bytecode and ABI from files
        const bytecode = fs.readFileSync(path.join(__dirname, 'monitor.bin'), 'utf8').trim();
        const abi = JSON.parse(fs.readFileSync(path.join(__dirname, 'monitor.abi'), 'utf8'));

        // Get accounts from Ganache
        const accounts = await web3.eth.getAccounts();
        const deployer = accounts[0];
        
        console.log('Using account:', deployer);
        
        // Create contract instance
        const contract = new web3.eth.Contract(abi);
        
        // Deploy contract
        console.log('Deploying Monitor contract...');
        const deployTx = contract.deploy({
            data: bytecode,
            arguments: [] // No constructor arguments needed
        });

        // Estimate gas
        const gas = await deployTx.estimateGas();
        console.log('Estimated gas:', gas);

        // Send deployment transaction
        const deployedContract = await deployTx.send({
            from: deployer,
            gas: gas
        });
        
        console.log('Monitor contract deployed at:', deployedContract.options.address);
        
        // Update config.json in the parent directory
        console.log('Updating config.json...');
        const configPath = path.join(__dirname, '..', 'config.json');
        const config = {
            monitor_address: deployedContract.options.address
        };
        fs.writeFileSync(configPath, JSON.stringify(config, null, 4));
        console.log('Done!');
    } catch (error) {
        console.error('Error deploying contract:', error);
        throw error;
    }
}

deployContract().catch(console.error); 