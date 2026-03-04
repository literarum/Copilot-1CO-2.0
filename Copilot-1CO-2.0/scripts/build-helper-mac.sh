#!/usr/bin/env bash
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/desktop-helper"

echo "Building CRL-Helper for macOS..."
python3 -m pip install -q -r requirements.txt
python3 -m PyInstaller --onefile --console --name CRL-Helper main.py

ZIP="$ROOT/site/files/CRL-Helper-macos.zip"
mkdir -p "$ROOT/site/files"
rm -f "$ZIP"
cp dist/CRL-Helper "$ROOT/site/files/CRL-Helper-macos"
zip -j "$ZIP" "$ROOT/site/files/CRL-Helper-macos"
rm -f "$ROOT/site/files/CRL-Helper-macos"
echo "Created $ZIP"
