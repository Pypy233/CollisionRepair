# CollisionRepair
Artifact for paper "COLLISIONREPAIR: First-Aid and Automated Patching for Storage Collision Vulnerabilities in Smart Contracts"

# CollisionRepair Project

This repository contains scripts and results for evaluating the correctness of smart contract deployments and transaction replays.

## Artifact: evaluation/correctness

The `evaluation/correctness/` directory contains all scripts, data, and results related to correctness evaluation.

### Directory Structure

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

### Main Scripts

- **evaluation/correctness/scripts/correctness/deploy_original_replay.js**
  - Batch deploys contracts and replays their transactions.
  - Saves all results in `evaluation/correctness/results/<contract_address>/`.
  - Supports checkpointing to resume interrupted runs.




### Usage

1. **Prepare contracts.txt**
   - Dataset of contracts' addresses are in `evaluation/correctness/contracts.txt`.

2. **Run the deployment and replay script:**
   ```bash
   node evaluation/correctness/scripts/correctness/deploy_original_replay.js
   ```
   - This will process each contract, deploy it, and replay its transactions.
   - Results are saved in `evaluation/correctness/results/`.

3. **Filter for clean results:**
   ```bash
   node evaluation/correctness/scripts/correctness/find_clean_results.js
   ```
   - This will copy only contracts with at least one successful replay to `evaluation/correctness/clean/`.
   - A summary is saved in `evaluation/correctness/clean/summary.json`.

### Notes
- The scripts are designed to be robust to interruptions and can resume from checkpoints.
- The `clean/` directory is useful for downstream analysis, as it contains only contracts with meaningful replay results.
- All scripts are written in Node.js and require a working Node.js environment.

---

For any questions or issues, please refer to the script comments or contact the maintainer.
