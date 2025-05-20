#!/bin/bash

# Get the absolute path of the project root directory
PROJECT_ROOT="/Users/py/github/CollisionRepair"

# Path to the scripts
SCRIPTS_DIR="$PROJECT_ROOT/evaluation/scripts/correctness"
ORIGINAL_SCRIPT="$SCRIPTS_DIR/deploy_original_replay.js"
PATCHED_SCRIPT="$SCRIPTS_DIR/deploy_replay_patched.js"
COMPARE_SCRIPT="$SCRIPTS_DIR/compare_results.js"

# Check if scripts exist
if [ ! -f "$ORIGINAL_SCRIPT" ]; then
    echo "Error: Original deployment script not found at $ORIGINAL_SCRIPT"
    exit 1
fi

if [ ! -f "$PATCHED_SCRIPT" ]; then
    echo "Error: Patched deployment script not found at $PATCHED_SCRIPT"
    exit 1
fi

if [ ! -f "$COMPARE_SCRIPT" ]; then
    echo "Error: Compare script not found at $COMPARE_SCRIPT"
    exit 1
fi

echo "Starting contract evaluation..."

# Deploy and replay original contracts
echo "Deploying and replaying original contracts..."
node "$ORIGINAL_SCRIPT"

# Check if original deployment succeeded
if [ $? -ne 0 ]; then
    echo "Error: Original contract deployment and replay failed!"
    exit 1
fi

# Deploy and replay patched contracts
echo "Deploying and replaying patched contracts..."
node "$PATCHED_SCRIPT"

# Check if patched deployment succeeded
if [ $? -ne 0 ]; then
    echo "Error: Patched contract deployment and replay failed!"
    exit 1
fi

# Compare results
echo "Comparing results..."
node "$COMPARE_SCRIPT"

# Check if comparison succeeded
if [ $? -ne 0 ]; then
    echo "Error: Results comparison failed!"
    exit 1
fi

echo "Evaluation completed successfully!" 