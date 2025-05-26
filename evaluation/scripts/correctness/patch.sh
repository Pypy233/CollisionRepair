#!/bin/bash

# Get the absolute path of the project root directory
PROJECT_ROOT=$(pwd)

# Path to the results directory
RESULTS_DIR="$PROJECT_ROOT/evaluation/correctness/results"

# Path to the Python script
PATCH_SCRIPT="$PROJECT_ROOT/octopus/patch_batch_bytecode.py"

# Check if results directory exists
if [ ! -d "$RESULTS_DIR" ]; then
    echo "Error: Results directory not found at $RESULTS_DIR"
    exit 1
fi

# Check if Python script exists
if [ ! -f "$PATCH_SCRIPT" ]; then
    echo "Error: Python script not found at $PATCH_SCRIPT"
    exit 1
fi

# Process each contract directory
for dir in "$RESULTS_DIR"/*/; do
    if [ -d "$dir" ]; then
        # Check for bytecode.txt and rename it to bytecode.hex
        if [ -f "${dir}bytecode.txt" ]; then
            mv "${dir}bytecode.txt" "${dir}bytecode.hex"
            # Remove 0x prefix if it exists
            sed -i '' 's/^0x//' "${dir}bytecode.hex"
        fi
    fi
done

# Run the Python script on the results directory
python3 "$PATCH_SCRIPT" "$RESULTS_DIR"

# Check if the Python script executed successfully
if [ $? -ne 0 ]; then
    echo "Error: Batch patching failed!"
    exit 1
fi 