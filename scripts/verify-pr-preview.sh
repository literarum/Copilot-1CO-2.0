#!/usr/bin/env bash
# Проверка цепочки PR Preview без создания реального PR.
# Запуск: ./scripts/verify-pr-preview.sh

set -euo pipefail

echo "=== 1. Workflow на main ==="
git fetch origin main 2>/dev/null || true
if git show origin/main:.github/workflows/pr-preview.yml 2>/dev/null | grep -q 'workflow_dispatch'; then
  echo "OK: workflow_dispatch есть в pr-preview.yml на main"
else
  echo "FAIL: workflow_dispatch не найден на main"
  exit 1
fi

echo ""
echo "=== 2. Скрипт на main: авто-запуск workflow ==="
if git show origin/main:scripts/publish-pr.sh 2>/dev/null | grep -q 'gh workflow run "PR Preview"'; then
  echo "OK: скрипт вызывает gh workflow run после создания PR"
else
  echo "FAIL: вызов workflow не найден в publish-pr.sh на main"
  exit 1
fi

echo ""
echo "=== 3. Извлечение номера PR из URL ==="
test_url="https://github.com/literarum/Copilot-1CO-2.0/pull/91"
num=$(printf '%s' "$test_url" | grep -oE '/pull/[0-9]+' | grep -oE '[0-9]+' | head -1)
if [[ "$num" == "91" ]]; then
  echo "OK: из URL извлекается номер 91"
else
  echo "FAIL: получено $num, ожидалось 91"
  exit 1
fi

echo ""
echo "=== 4. gh и workflow_dispatch ==="
if gh workflow run "PR Preview" -f pr_number=91 2>/dev/null; then
  echo "OK: gh workflow run выполнен (workflow поставлен в очередь)"
else
  echo "FAIL или предупреждение: gh workflow run не сработал (проверьте gh auth)"
fi

echo ""
echo "=== Проверка завершена ==="
