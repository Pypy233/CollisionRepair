# CollisionRepair Artifact

Artifact for the paper “COLLISIONREPAIR: First-Aid and Automated Patching for Storage Collision Vulnerabilities in Smart Contracts”

This artifact provides scripts, datasets, and step-by-step instructions to evaluate and reproduce CollisionRepair — a patching framework for mitigating storage collision vulnerabilities in Ethereum smart contracts.

---

## 1. Environment Setup (Required)

Before proceeding, install the following tools:

| Tool          | Purpose                                     |
| ------------- | ------------------------------------------- |
| Node.js ≥ v16 | For deploying contracts and running scripts |
| Python 3      | For static verification and patching        |
| Ganache       | Local Ethereum testnet (must be running)    |
| Octopus       | Bytecode instrumentation engine             |

### Installation Steps

**1.1 Install Node.js and npm**  
Visit [https://nodejs.org/](https://nodejs.org/) or install via a package manager (e.g., `brew install node`)

**1.2 Install Python dependencies**  
```bash
pip install -r requirements.txt
```

**1.3 Install Ganache**

Ganache is a local Ethereum testnet used for deploying and replaying contracts.

- ✅ **Recommended: Ganache GUI**  
  1. Download the GUI from [https://trufflesuite.com/ganache/](https://trufflesuite.com/ganache/)  
  2. Launch it and click “Quickstart Ethereum”  
  3. Ensure it's running on `http://127.0.0.1:7545` (default)

  > The GUI makes it easy to view accounts, logs, and transactions interactively.

- 🧪 **Alternative: Ganache CLI**  

  > You must keep Ganache running in the background while patching or replaying.

**1.4 Install Octopus from source**  
```bash
cd octopus
python3 setup.py install
```

> **Important:** Ganache must be running at `http://127.0.0.1:7545` before applying patches or replaying transactions.

---

## 2. Verifying Existing Results

We provide two scripts to verify correctness of previously generated patch outputs.

### 2.1 Static Instrumentation Verification

Checks that all `SSTORE` instructions in patched contracts were correctly instrumented.

```bash
cd evaluation/scripts
python3 verify_instrumentation.py ../correctness
```

- **Performance**: This static verification takes less than 1 minute to complete.

### 2.2 Dynamic Result Comparison

Compares execution results of historical transactions between original and patched versions.

```bash
node evaluation/correctness/scripts/correctness/compare_results.js
```

**Example Output:**
```
Transaction Summary:
==================
Total Transactions:       392136
Successful Transactions:  365360
Failed Transactions:      26776
Transaction Success Rate: 93.17%
```

- **Performance**: This dynamic verification takes less than 1 minute to complete.

---

## 3. Applying the Patch Tool

### 3.1 Deploy the Monitor Contract

This step deploys a monitoring contract and saves the monitor address to be used during patching.

```bash
cd js_scripts/monitor
node deploy_monitor.js
```

### 3.2 Run the Patching Script

Return to the root directory and execute the patching script.

```bash
cd ../../
./evaluation/correctness/patch.sh
```

This script will:
- Load addresses from `evaluation/correctness/contracts.txt`
- Instrument contract bytecode using Octopus
- Save results under `evaluation/correctness/results/<contract_address>/`

After patching, you can run verification or transaction replay.

---

## 4. Regenerating Dynamic Execution Results

If you want to re-run transaction replays:

### 4.1 Start Ganache

Ganache must be running at `http://127.0.0.1:7545`.

### 4.2 Run Replay Scripts

```bash
node evaluation/correctness/scripts/correctness/deploy_original_replay.js
node evaluation/correctness/scripts/correctness/deploy_patch_replay.js
node evaluation/correctness/scripts/correctness/compare_results.js
```

- **What it does**: These scripts deploy each contract and replay its historical transactions on a local testnet, saving the results in `evaluation/correctness/results/`.

- **Performance**: Each deploy script can take **6 to 10 hours** to process all contracts, depending on your hardware and dataset size.

---

## 5. Notes

- All scripts support checkpointing and can resume after interruption.
- Octopus is required for both patching and static verification.
- Ganache is required to deploy the monitor contract and replay transactions.
- `compare_results.js` can be run independently to check replay consistency.
