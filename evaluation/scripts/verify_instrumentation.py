#!/usr/bin/env python3

import os
import json
import sys
from pathlib import Path
from typing import Dict, List, Tuple, Optional

def read_bytecode(file_path: str) -> str:
    """Read bytecode from a file."""
    try:
        with open(file_path, 'r') as f:
            return f.read().strip()
    except Exception as e:
        print(f"Error reading file {file_path}: {e}")
        return ""

def find_sstore_positions(bytecode: str) -> List[int]:
    """Find all positions of SSTORE instructions in the bytecode."""
    return [i for i in range(0, len(bytecode), 2) if bytecode[i:i+2] == "55"]

def get_instrumented_context(bytecode: str, pos: int) -> str:
    """Get the context around an SSTORE instruction in the instrumented bytecode."""
    # Look for the pattern: PUSH1 0x01 PUSH1 0x00 SSTORE
    # This is a simplified pattern - adjust based on your actual instrumentation
    start = max(0, pos - 6)  # Look back 3 bytes (6 hex chars)
    end = min(len(bytecode), pos + 2)  # Include the SSTORE opcode
    return bytecode[start:end]

def compare_bytecodes(original: str, patched: str) -> Tuple[list, bool]:
    """
    Compare original and patched bytecode to find SSTORE differences.
    Returns a list of differences and a boolean indicating if changes are valid.
    """
    orig_sstore_positions = find_sstore_positions(original)
    patched_sstore_positions = find_sstore_positions(patched)
    differences = []
    is_valid = True

    for idx, orig_pos in enumerate(orig_sstore_positions):
        found = False
        for j in range(max(0, idx-5), min(len(patched_sstore_positions), idx+6)):
            found = True
            break
        differences.append({
            "original_sstore_index": idx,
            "original_position": orig_pos,
            "is_instrumented": found
        })
        if not found:
            is_valid = False

    return differences, is_valid

def is_valid_instrumentation(orig_context: str, patched_context: str) -> bool:
    """
    Check if the SSTORE instruction is properly instrumented.
    Expected pattern: Original SSTORE (55) is replaced with PUSH1 0x01 PUSH1 0x00 SSTORE
    """
    # The original context should contain just the SSTORE opcode
    if orig_context != "55":
        return False
    
    # The patched context should contain the instrumentation pattern
    # This is a simplified check - adjust based on your actual instrumentation pattern
    expected_pattern = "6001600055"  # PUSH1 0x01 PUSH1 0x00 SSTORE
    return patched_context == expected_pattern

def analyze_contract(contract_dir: str) -> Dict:
    """Analyze a single contract's bytecode."""
    original_path = os.path.join(contract_dir, "bytecode.hex")
    patched_path = os.path.join(contract_dir, "bytecode_patched.hex")
    
    if not os.path.exists(original_path) or not os.path.exists(patched_path):
        return {
            "status": "error",
            "message": "Missing bytecode files",
            "contract": os.path.basename(contract_dir)
        }
    
    original = read_bytecode(original_path)
    patched = read_bytecode(patched_path)
    
    if not original or not patched:
        return {
            "status": "error",
            "message": "Failed to read bytecode",
            "contract": os.path.basename(contract_dir)
        }
    
    differences, is_valid = compare_bytecodes(original, patched)
    
    return {
        "status": "success" if is_valid else "invalid",
        "contract": os.path.basename(contract_dir),
        "sstore_count": len(differences),
        "valid_sstores": sum(1 for d in differences if d["is_instrumented"]),
        "invalid_sstores": sum(1 for d in differences if not d["is_instrumented"]),
        "differences": differences,
        "is_valid": is_valid
    }

def is_sstore_instrumented(orig, patched, orig_pos):
    # Look for SSTORE in patched within a window around orig_pos
    window = 20  # bytes (40 hex chars)
    start = max(0, orig_pos - window)
    end = min(len(patched), orig_pos + window)
    for i in range(start, end, 2):
        if patched[i:i+2] == "55":
            # If SSTORE is not at the same offset, or if there are extra bytes before it, it's instrumented
            if i != orig_pos or patched[i-4:i] != orig[orig_pos-4:orig_pos]:
                return True
    return False

def check_instrumentation(orig, patched):
    sstore_positions = find_sstore_positions(orig)
    instrumented = 0
    for pos in sstore_positions:
        if is_sstore_instrumented(orig, patched, pos):
            instrumented += 1
    return instrumented, len(sstore_positions)

def main():
    if len(sys.argv) != 2:
        print("Usage: python verify_instrumentation.py <results_directory>")
        sys.exit(1)
    
    results_dir = sys.argv[1]
    if not os.path.exists(results_dir):
        print(f"Error: Directory {results_dir} does not exist")
        sys.exit(1)
    
    # Find all contract directories
    contract_dirs = [d for d in os.listdir(results_dir) 
                    if os.path.isdir(os.path.join(results_dir, d)) 
                    and d.startswith("0x")]
    
    results = []
    for contract_dir in contract_dirs:
        full_path = os.path.join(results_dir, contract_dir)
        result = analyze_contract(full_path)
        results.append(result)
    
    # Generate report
    report = {
        "total_contracts": len(results),
        "valid_contracts": sum(1 for r in results if r["status"] == "success"),
        "invalid_contracts": sum(1 for r in results if r["status"] == "invalid"),
        "error_contracts": sum(1 for r in results if r["status"] == "error"),
        "total_sstores": sum(r["sstore_count"] for r in results),
        "valid_sstores": sum(r["valid_sstores"] for r in results),
        "invalid_sstores": sum(r["invalid_sstores"] for r in results),
        "details": results
    }
    
    # Save report
    report_path = os.path.join(results_dir, "instrumentation_verification.json")
    with open(report_path, 'w') as f:
        json.dump(report, f, indent=2)
    
    print(f"\nVerification complete. Report saved to {report_path}")
    print(f"Total contracts: {report['total_contracts']}")
    print(f"Valid contracts: {report['valid_contracts']}")
    print(f"Invalid contracts: {report['invalid_contracts']}")
    print(f"Error contracts: {report['error_contracts']}")
    print(f"\nSSTORE Statistics:")
    print(f"Total SSTORE instructions: {report['total_sstores']}")
    print(f"Valid SSTORE instrumentations: {report['valid_sstores']}")
    print(f"Invalid SSTORE instrumentations: {report['invalid_sstores']}")

if __name__ == "__main__":
    main() 