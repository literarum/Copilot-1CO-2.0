#!/usr/bin/env bash
set -e
if [ "$(uname -s)" != "Linux" ]; then
    echo "Skipping Linux build (run only on Linux/Vercel)"
    exit 0
fi
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/desktop-helper"

echo "Building CRL-Helper for Linux..."
python3 -m venv .venv
.venv/bin/pip install -q -r requirements.txt
.venv/bin/pyinstaller --onefile --console --name CRL-Helper main.py

mkdir -p "$ROOT/site/files"
cp dist/CRL-Helper "$ROOT/site/files/CRL-Helper-linux"
cd "$ROOT/site/files"
zip -j CRL-Helper-linux.zip CRL-Helper-linux
rm -f CRL-Helper-linux
echo "Created $ROOT/site/files/CRL-Helper-linux.zip"
