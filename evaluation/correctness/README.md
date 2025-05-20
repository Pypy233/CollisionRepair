# Correctness Evaluation Artifact

This directory contains scripts and results for evaluating the correctness of smart contract deployments and transaction replays.

## Directory Structure

```
evaluation/
  correctness/
    contracts.txt                # List of contract addresses to process
    results/                     # Main output directory for all contract results
      <contract_address>/        # Each contract has its own folder
        abi.json                 # ABI for the contract
        bytecode.txt             # Bytecode for the contract
        transactions.json        # Historical transactions for the contract
        replay_results.json      # Results of transaction replays
        ...                      # Other files (e.g., address.txt, name.txt)
    clean/                       # Subset of results with at least one valid replay
      <contract_address>/        # Same structure as results/
    checkpoints/                 # Checkpoint files for resuming batch jobs
      deploy_checkpoint.json     # Progress checkpoint for deployment script
    scripts/
      correctness/
        deploy_original_replay.js    # Main batch deployment and replay script
        find_clean_results.js        # Script to filter and copy clean results
```

## Main Scripts

- **deploy_original_replay.js**
  - Batch deploys contracts and replays their transactions.
  - Saves all results in `results/<contract_address>/`.
  - Supports checkpointing to resume interrupted runs.

- **find_clean_results.js**
  - Scans all contract results in `results/`.
  - Copies only those contracts with at least one successful transaction replay (not all errors) to `clean/`.
  - Produces a summary of how many contracts had valid results.

## Usage

1. **Prepare contracts.txt**
   - List all contract addresses (one per line) in `contracts.txt`.

2. **Run the deployment and replay script:**
   ```bash
   node evaluation/scripts/correctness/deploy_original_replay.js
   ```
   - This will process each contract, deploy it, and replay its transactions.
   - Results are saved in `results/`.

3. **Filter for clean results:**
   ```bash
   node evaluation/scripts/correctness/find_clean_results.js
   ```
   - This will copy only contracts with at least one successful replay to `clean/`.
   - A summary is saved in `clean/summary.json`.

## Notes
- The scripts are designed to be robust to interruptions and can resume from checkpoints.
- The `clean/` directory is useful for downstream analysis, as it contains only contracts with meaningful replay results.
- All scripts are written in Node.js and require a working Node.js environment.

---

For any questions or issues, please refer to the script comments or contact the maintainer. 