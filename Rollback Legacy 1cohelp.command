#!/bin/bash

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$REPO_DIR" || exit 1

./scripts/rollback-legacy-1cohelp.sh
status=$?

echo
if [ "$status" -eq 0 ]; then
  echo "Rollback legacy-сайта завершён."
else
  echo "Rollback завершился с ошибкой. Смотри вывод выше."
fi

echo
read -r -p "Нажми Enter, чтобы закрыть окно..."
exit "$status"
