const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Function to read contract list from file
function readContractList(filePath) {
    return fs.readFileSync(filePath, 'utf8')
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && line.startsWith('0x'));
}

// Function to deploy and replay transactions for a contract
async function processContract(contractAddress, outputDir) {
    try {
        console.log(`\nProcessing contract ${contractAddress}...`);
        
        // Create contract directory
        const contractDir = path.join(outputDir, contractAddress);
        if (!fs.existsSync(contractDir)) {
            fs.mkdirSync(contractDir);
        }

        // Deploy contract
        console.log('Deploying contract...');
        const deployOutput = execSync(
            `node deploy.js ${contractAddress}`,
            { encoding: 'utf8' }
        );
        console.log(deployOutput);

        // Move results to evaluation directory
        const originalDir = path.join(__dirname, contractAddress);
        if (fs.existsSync(originalDir)) {
            // Copy all files from original directory to evaluation directory
            const files = fs.readdirSync(originalDir);
            for (const file of files) {
                fs.copyFileSync(
                    path.join(originalDir, file),
                    path.join(contractDir, file)
                );
            }
            // Clean up original directory
            fs.rmSync(originalDir, { recursive: true, force: true });
        }

        console.log(`Completed processing ${contractAddress}`);
        
    } catch (error) {
        console.error(`Error processing ${contractAddress}:`, error);
    }
}

// Main function
async function main() {
    try {
        // Process correctness contracts
        console.log('\nProcessing correctness contracts...');
        const correctnessContracts = readContractList(
            path.join(__dirname, '..', '..', 'evaluation', 'correctness', 'contracts.txt')
        );
        console.log(`Found ${correctnessContracts.length} contracts for correctness evaluation`);
        
        for (const contract of correctnessContracts) {
            await processContract(
                contract,
                path.join(__dirname, '..', '..', 'evaluation', 'correctness', 'results')
            );
        }

        // Process effectiveness contracts
        console.log('\nProcessing effectiveness contracts...');
        const effectivenessContracts = readContractList(
            path.join(__dirname, '..', '..', 'evaluation', 'effectiveness', 'contracts.txt')
        );
        console.log(`Found ${effectivenessContracts.length} contracts for effectiveness evaluation`);
        
        for (const contract of effectivenessContracts) {
            await processContract(
                contract,
                path.join(__dirname, '..', '..', 'evaluation', 'effectiveness', 'results')
            );
        }
        
        console.log('\nEvaluation setup completed!');
        console.log('\nNext steps:');
        console.log('1. Run the Python patching script on the results directories');
        console.log('2. Deploy and replay transactions for patched contracts');
        
    } catch (error) {
        console.error('Evaluation setup failed:', error);
        process.exit(1);
    }
}

main(); 