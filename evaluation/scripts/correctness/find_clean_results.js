const fs = require('fs');
const path = require('path');

// Function to check if a result file exists and has at least one successful transaction
function checkResultFile(resultPath) {
    if (!fs.existsSync(resultPath)) {
        return false;
    }

    try {
        const content = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
        // Check if it's an array of results
        if (!Array.isArray(content)) {
            return false;
        }
        
        // Check if all transactions contain errors
        const allErrors = content.every(result => 
            result.error && result.error.includes('Returned error')
        );
        
        // Return true if not all transactions are errors
        return !allErrors;
    } catch (error) {
        console.error(`Error reading ${resultPath}:`, error);
        return false;
    }
}

// Function to copy directory recursively
function copyDir(src, dest) {
    if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
    }

    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
            copyDir(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

async function main() {
    try {
        const resultsDir = path.join(__dirname, '../../correctness/results');
        const cleanDir = path.join(__dirname, '../../correctness/clean');
        
        // Create clean directory if it doesn't exist
        if (!fs.existsSync(cleanDir)) {
            fs.mkdirSync(cleanDir, { recursive: true });
        }

        // Get all contract directories
        const contracts = fs.readdirSync(resultsDir)
            .filter(name => name.startsWith('0x'))
            .map(name => ({
                address: name,
                path: path.join(resultsDir, name)
            }));

        console.log(`Found ${contracts.length} contracts to check`);

        // Track statistics
        let totalChecked = 0;
        let withResultsCount = 0;
        let withoutResultsCount = 0;
        let allErrorsCount = 0;

        // Process each contract
        for (const contract of contracts) {
            const resultPath = path.join(contract.path, 'replay_results.json');
            
            if (checkResultFile(resultPath)) {
                console.log(`Found valid results for ${contract.address}`);
                // Copy the entire contract directory to clean
                const cleanContractDir = path.join(cleanDir, contract.address);
                copyDir(contract.path, cleanContractDir);
                withResultsCount++;
            } else {
                if (fs.existsSync(resultPath)) {
                    console.log(`Skipping ${contract.address} - all transactions contain errors`);
                    allErrorsCount++;
                } else {
                    console.log(`Skipping ${contract.address} - no replay results found`);
                    withoutResultsCount++;
                }
            }
            totalChecked++;
        }

        // Save summary
        const summary = {
            totalContracts: totalChecked,
            contractsWithValidResults: withResultsCount,
            contractsWithAllErrors: allErrorsCount,
            contractsWithoutResults: withoutResultsCount,
            timestamp: new Date().toISOString()
        };

        fs.writeFileSync(
            path.join(cleanDir, 'summary.json'),
            JSON.stringify(summary, null, 2)
        );

        console.log('\nProcessing completed!');
        console.log('Summary:');
        console.log(`- Total contracts checked: ${summary.totalContracts}`);
        console.log(`- Contracts with valid results: ${summary.contractsWithValidResults}`);
        console.log(`- Contracts with all errors: ${summary.contractsWithAllErrors}`);
        console.log(`- Contracts without results: ${summary.contractsWithoutResults}`);
        console.log(`Results saved in: ${cleanDir}`);

    } catch (error) {
        console.error('Process failed:', error);
        process.exit(1);
    }
}

main(); 