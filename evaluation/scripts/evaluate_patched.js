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

// Function to deploy and replay transactions for a patched contract
async function processPatchedContract(contractAddress, outputDir) {
    try {
        console.log(`\nProcessing patched contract ${contractAddress}...`);
        
        // Create patched directory
        const contractDir = path.join(outputDir, contractAddress);
        const patchedDir = path.join(contractDir, 'patched');
        if (!fs.existsSync(patchedDir)) {
            fs.mkdirSync(patchedDir);
        }

        // Copy patched bytecode to bytecode.txt
        const patchedBytecode = fs.readFileSync(
            path.join(contractDir, 'bytecode.hex.patched'),
            'utf8'
        ).trim();
        fs.writeFileSync(
            path.join(patchedDir, 'bytecode.txt'),
            patchedBytecode
        );

        // Copy ABI if it exists
        const abiPath = path.join(contractDir, 'abi.json');
        if (fs.existsSync(abiPath)) {
            fs.copyFileSync(
                abiPath,
                path.join(patchedDir, 'abi.json')
            );
        }

        // Deploy patched contract
        console.log('Deploying patched contract...');
        const deployOutput = execSync(
            `node ${path.join(__dirname, 'deploy.js')} ${contractAddress} --patched`,
            { encoding: 'utf8' }
        );
        console.log(deployOutput);

        // Compare results
        const originalResults = JSON.parse(
            fs.readFileSync(
                path.join(contractDir, 'replay_results.json'),
                'utf8'
            )
        );
        
        const patchedResults = JSON.parse(
            fs.readFileSync(
                path.join(patchedDir, 'replay_results.json'),
                'utf8'
            )
        );
        
        // Generate diff
        const diff = {
            original: originalResults,
            patched: patchedResults,
            differences: []
        };
        
        for (let i = 0; i < originalResults.length; i++) {
            if (JSON.stringify(originalResults[i]) !== JSON.stringify(patchedResults[i])) {
                diff.differences.push({
                    transaction: i,
                    original: originalResults[i],
                    patched: patchedResults[i]
                });
            }
        }
        
        // Save diff
        fs.writeFileSync(
            path.join(patchedDir, 'diff.json'),
            JSON.stringify(diff, null, 2)
        );

        console.log(`Completed processing patched contract ${contractAddress}`);
        
    } catch (error) {
        console.error(`Error processing patched contract ${contractAddress}:`, error);
    }
}

// Main function
async function main() {
    try {
        // Process correctness contracts
        console.log('\nProcessing patched correctness contracts...');
        const correctnessContracts = readContractList(
            path.join(__dirname, '..', 'correctness', 'contracts.txt')
        );
        console.log(`Found ${correctnessContracts.length} contracts for correctness evaluation`);
        
        for (const contract of correctnessContracts) {
            await processPatchedContract(
                contract,
                path.join(__dirname, '..', 'correctness', 'results')
            );
        }

        // Process effectiveness contracts
        console.log('\nProcessing patched effectiveness contracts...');
        const effectivenessContracts = readContractList(
            path.join(__dirname, '..', 'effectiveness', 'contracts.txt')
        );
        console.log(`Found ${effectivenessContracts.length} contracts for effectiveness evaluation`);
        
        for (const contract of effectivenessContracts) {
            await processPatchedContract(
                contract,
                path.join(__dirname, '..', 'effectiveness', 'results')
            );
        }
        
        console.log('\nPatched evaluation completed!');
        
    } catch (error) {
        console.error('Patched evaluation failed:', error);
        process.exit(1);
    }
}

main(); 