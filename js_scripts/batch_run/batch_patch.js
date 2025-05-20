const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Function to get all contract directories
function getContractDirectories() {
    const baseDir = __dirname;
    return fs.readdirSync(baseDir)
        .filter(item => {
            const fullPath = path.join(baseDir, item);
            return fs.statSync(fullPath).isDirectory() && 
                   item.startsWith('0x') && 
                   fs.existsSync(path.join(fullPath, 'bytecode.txt'));
        });
}

// Function to run deployment and save results
async function processContract(contractDir) {
    try {
        console.log(`\nProcessing contract in ${contractDir}...`);
        
        // Create patched directory
        const patchedDir = path.join(__dirname, contractDir, 'patched');
        if (!fs.existsSync(patchedDir)) {
            fs.mkdirSync(patchedDir);
        }

        // Copy bytecode to a .hex file for Python script
        const originalBytecode = fs.readFileSync(
            path.join(__dirname, contractDir, 'bytecode.txt'),
            'utf8'
        ).trim();
        
        const hexFile = path.join(patchedDir, 'bytecode.hex');
        fs.writeFileSync(hexFile, originalBytecode);

        // Run Python patching script
        console.log('Running bytecode patching...');
        const pythonScript = path.join(__dirname, '..', '..', 'octopus', 'patch_batch_bytecode.py');
        
        execSync(
            `python3 ${pythonScript} ${patchedDir}`,
            { encoding: 'utf8' }
        );
        console.log('Bytecode patching completed');

        // Copy patched bytecode to bytecode.txt
        const patchedBytecode = fs.readFileSync(
            path.join(patchedDir, 'bytecode.hex.patched'),
            'utf8'
        ).trim();
        fs.writeFileSync(
            path.join(patchedDir, 'bytecode.txt'),
            patchedBytecode
        );

        // Copy ABI from original contract if it exists
        const originalAbiPath = path.join(__dirname, contractDir, 'abi.json');
        if (fs.existsSync(originalAbiPath)) {
            fs.copyFileSync(
                originalAbiPath,
                path.join(patchedDir, 'abi.json')
            );
        }
        
        // Deploy patched contract
        console.log('Deploying patched contract...');
        const deployOutput = execSync(
            `node deploy.js ${contractDir} --patched`,
            { encoding: 'utf8' }
        );
        console.log(deployOutput);
        
        // Compare results
        const originalResults = JSON.parse(
            fs.readFileSync(
                path.join(__dirname, contractDir, 'replay_results.json'),
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
        
        console.log(`Completed processing ${contractDir}`);
        
    } catch (error) {
        console.error(`Error processing ${contractDir}:`, error);
    }
}

// Main function
async function main() {
    try {
        const contractDirs = getContractDirectories();
        console.log(`Found ${contractDirs.length} contracts to process`);
        
        for (const contractDir of contractDirs) {
            await processContract(contractDir);
        }
        
        console.log('\nBatch processing completed!');
        
    } catch (error) {
        console.error('Batch processing failed:', error);
        process.exit(1);
    }
}

main(); 