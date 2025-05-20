const fs = require('fs');
const path = require('path');

// Configuration
const RESULTS_DIR = path.join(__dirname, '../../correctness/results');
const ORIGINAL_RESULTS_DIR = path.join(__dirname, '../../correctness/results_bk');

function compareResults(contractDir) {
    const contractName = path.basename(contractDir);
    const originalResultsPath = path.join(ORIGINAL_RESULTS_DIR, contractName, 'replay_results', 'original_replay_results.json');
    const patchedResultsPath = path.join(contractDir, 'replay_results', 'patched_replay_results.json');
    
    if (!fs.existsSync(originalResultsPath) || !fs.existsSync(patchedResultsPath)) {
        console.log(`No results found for ${contractName}`);
        return null;
    }

    const originalResults = JSON.parse(fs.readFileSync(originalResultsPath, 'utf8'));
    const patchedResults = JSON.parse(fs.readFileSync(patchedResultsPath, 'utf8'));
    
    const comparison = {
        contract: contractName,
        transactionResults: []
    };

    // Compare each transaction
    for (let i = 0; i < originalResults.transactions.length; i++) {
        const originalTx = originalResults.transactions[i];
        const patchedTx = patchedResults.transactions[i];

        const txComparison = {
            index: i,
            statusMatch: originalTx.status === patchedTx.status,
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
    let totalTransactions = 0;
    let successfulTransactions = 0;
    let failedTransactions = 0;

    // Process each contract
    for (const contractDir of contractDirs) {
        try {
            const comparison = compareResults(contractDir);
            if (comparison) {
                comparisons.push(comparison);
                totalContracts++;

                // Count transactions
                totalTransactions += comparison.transactionResults.length;
                
                // Count successful/failed transactions
                comparison.transactionResults.forEach(tx => {
                    if (tx.statusMatch && tx.logsMatch) {
                        successfulTransactions++;
                    } else {
                        failedTransactions++;
                    }
                });

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
        totalTransactions,
        successfulTransactions,
        failedTransactions,
        transactionSuccessRate: (successfulTransactions / totalTransactions * 100).toFixed(2) + '%',
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
    console.log(`Contract Success Rate: ${summary.successRate}`);
    console.log('\nTransaction Summary:');
    console.log(`Total Transactions: ${totalTransactions}`);
    console.log(`Successful Transactions: ${successfulTransactions}`);
    console.log(`Failed Transactions: ${failedTransactions}`);
    console.log(`Transaction Success Rate: ${summary.transactionSuccessRate}`);
    console.log(`\nDetailed results saved to: ${outputPath}`);
}

main(); 