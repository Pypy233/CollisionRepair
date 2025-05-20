const fs = require('fs');
const path = require('path');

// Configuration
const RESULTS_DIR = path.join(__dirname, '../correctness/results');

function compareResults(contractDir) {
    const resultsPath = path.join(contractDir, 'replay_results.json');
    if (!fs.existsSync(resultsPath)) {
        console.log(`No results found for ${path.basename(contractDir)}`);
        return null;
    }

    const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
    const comparison = {
        contract: path.basename(contractDir),
        deploymentGasDiff: BigInt(results.patched.deploymentGas) - BigInt(results.original.deploymentGas),
        transactionResults: []
    };

    // Compare each transaction
    for (let i = 0; i < results.original.transactions.length; i++) {
        const originalTx = results.original.transactions[i];
        const patchedTx = results.patched.transactions[i];

        const txComparison = {
            index: i,
            statusMatch: originalTx.status === patchedTx.status,
            gasDiff: BigInt(patchedTx.gasUsed) - BigInt(originalTx.gasUsed),
            logsMatch: compareLogs(originalTx.logs, patchedTx.logs)
        };

        comparison.transactionResults.push(txComparison);
    }

    return comparison;
}

function compareLogs(originalLogs, patchedLogs) {
    if (originalLogs.length !== patchedLogs.length) {
        return false;
    }

    // Sort logs by index to ensure consistent comparison
    const sortLogs = (logs) => logs.sort((a, b) => a.logIndex - b.logIndex);

    const sortedOriginal = sortLogs([...originalLogs]);
    const sortedPatched = sortLogs([...patchedLogs]);

    return sortedOriginal.every((log, i) => {
        const patchedLog = sortedPatched[i];
        return (
            log.address === patchedLog.address &&
            log.topics.join(',') === patchedLog.topics.join(',') &&
            log.data === patchedLog.data
        );
    });
}

function main() {
    // Get all contract directories
    const contractDirs = fs.readdirSync(RESULTS_DIR)
        .filter(dir => dir.startsWith('0x'))
        .map(dir => path.join(RESULTS_DIR, dir));

    const comparisons = [];
    let totalContracts = 0;
    let successfulPatches = 0;
    let failedPatches = 0;

    // Process each contract
    for (const contractDir of contractDirs) {
        try {
            const comparison = compareResults(contractDir);
            if (comparison) {
                comparisons.push(comparison);
                totalContracts++;

                // Check if patch was successful
                const isSuccessful = comparison.transactionResults.every(
                    result => result.statusMatch && result.logsMatch
                );

                if (isSuccessful) {
                    successfulPatches++;
                } else {
                    failedPatches++;
                }
            }
        } catch (error) {
            console.error(`Error comparing results for ${path.basename(contractDir)}:`, error);
        }
    }

    // Generate summary
    const summary = {
        totalContracts,
        successfulPatches,
        failedPatches,
        successRate: (successfulPatches / totalContracts * 100).toFixed(2) + '%',
        detailedResults: comparisons
    };

    // Save comparison results
    const outputPath = path.join(RESULTS_DIR, 'comparison_results.json');
    fs.writeFileSync(outputPath, JSON.stringify(summary, null, 2));

    // Print summary
    console.log('\nComparison Summary:');
    console.log('==================');
    console.log(`Total Contracts: ${totalContracts}`);
    console.log(`Successful Patches: ${successfulPatches}`);
    console.log(`Failed Patches: ${failedPatches}`);
    console.log(`Success Rate: ${summary.successRate}`);
    console.log(`\nDetailed results saved to: ${outputPath}`);
}

main(); 