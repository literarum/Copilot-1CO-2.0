#!/bin/bash

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$REPO_DIR" || exit 1

./scripts/deploy-legacy-1cohelp.sh --quick
status=$?

echo
if [ "$status" -eq 0 ]; then
  echo "Готово. Legacy-deploy завершён без ошибок."
else
  echo "Deploy завершился с ошибкой. Смотри вывод выше."
fi

echo
read -r -p "Нажми Enter, чтобы закрыть окно..."
exit "$status"