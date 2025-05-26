#!/bin/bash

set -e

# Helper function
echo_section() {
  echo
  echo "==============================="
  echo "$1"
  echo "==============================="
}

echo_section "Checking for Python 3 and pip..."
if ! command -v python3 &> /dev/null; then
  echo "Python 3 is not installed. Please install Python 3 first."
  exit 1
fi
if ! command -v pip &> /dev/null; then
  echo "pip is not installed. Please install pip for Python 3."
  exit 1
fi

echo_section "Checking for Node.js and npm..."
if ! command -v node &> /dev/null; then
  echo "Node.js is not installed. Please install Node.js first."
  exit 1
fi
if ! command -v npm &> /dev/null; then
  echo "npm is not installed. Please install npm."
  exit 1
fi

echo_section "Installing Python dependencies (including octopus-multiprocess if listed)..."
if [ -f evaluation/scripts/requirements.txt ]; then
  pip install -r evaluation/scripts/requirements.txt
else
  echo "No requirements.txt found in evaluation/scripts/. Skipping Python dependencies."
fi

echo_section "Installing Node.js dependencies in project root (if package.json exists)..."
if [ -f package.json ]; then
  npm install
else
  echo "No package.json found in project root. Skipping root Node.js dependencies."
fi

echo_section "Installing Node.js dependencies in evaluation/correctness/ (if package.json exists)..."
if [ -f evaluation/correctness/package.json ]; then
  cd evaluation/correctness
  npm install
  cd - > /dev/null
else
  echo "No package.json found in evaluation/correctness/. Skipping Node.js dependencies there."
fi

echo_section "All dependencies installed!"
echo "You are now ready to use the CollisionRepair artifact." 