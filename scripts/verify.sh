#!/bin/bash
# Надёжная система самопроверки Copilot 1CO
# Прогоняет lint, format-check и тесты. Exit 0 = все проверки пройдены.
# Использование: ./scripts/verify.sh [--quick]
# --quick: только тесты (без lint/format)

set -e
cd "$(dirname "$0")/.."
ROOT="$(pwd)"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

quick=0
for arg in "$@"; do
    [ "$arg" = "--quick" ] && quick=1
done

fail() {
    echo -e "${RED}❌ $1${NC}"
    exit 1
}
ok() {
    echo -e "${GREEN}✓ $1${NC}"
}

echo ""
echo "=== Copilot 1CO Verification Pipeline ==="
echo ""

if [ "$quick" -eq 0 ]; then
    echo "[1/3] Lint..."
    npm run lint || fail "Lint failed. Run: npm run lint"
    ok "Lint passed"
    echo ""

    echo "[2/3] Format check..."
    npm run format:check || {
        echo -e "${YELLOW}Run 'npm run format' to fix formatting${NC}"
        fail "Format check failed"
    }
    ok "Format check passed"
    echo ""
fi

echo "[$([ "$quick" -eq 1 ] && echo "1/1" || echo "3/3")] Tests..."
npm test -- --run || fail "Tests failed"
ok "All tests passed"
echo ""

echo -e "${GREEN}=== All verification steps passed ===${NC}"
echo ""
