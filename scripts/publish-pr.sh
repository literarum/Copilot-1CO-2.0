#!/usr/bin/env bash
set -euo pipefail

BASE_BRANCH="${1:-main}"

# Проверки
if ! command -v gh >/dev/null 2>&1; then
  echo "Ошибка: не найден GitHub CLI (gh). Установите: https://cli.github.com/"
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "Ошибка: gh не авторизован. Выполните: gh auth login"
  exit 1
fi

BRANCH="$(git rev-parse --abbrev-ref HEAD)"

if [[ "$BRANCH" == "HEAD" ]]; then
  echo "Ошибка: detached HEAD. Переключитесь на обычную ветку."
  exit 1
fi

if [[ "$BRANCH" == "main" || "$BRANCH" == "master" ]]; then
  echo "Стоп: вы на ветке $BRANCH. Создайте feature/fix ветку и работайте в ней."
  exit 1
fi

# Убеждаемся, что origin есть
git remote get-url origin >/dev/null 2>&1

echo "Пушу ветку: $BRANCH"
git push -u origin "$BRANCH"

# Проверка существующего PR (open)
EXISTING_PR_NUMBER="$(gh pr list --head "$BRANCH" --state open --json number --jq '.[0].number // empty')"

if [[ -n "${EXISTING_PR_NUMBER}" ]]; then
  echo "PR уже существует: #$EXISTING_PR_NUMBER"
  gh pr view "$EXISTING_PR_NUMBER" --web >/dev/null 2>&1 || true
  gh pr view "$EXISTING_PR_NUMBER"
  exit 0
fi

# Создание PR
echo "Создаю PR: $BRANCH -> $BASE_BRANCH"
gh pr create \
  --base "$BASE_BRANCH" \
  --head "$BRANCH" \
  --fill

echo "Готово. PR создан."
gh pr view --web >/dev/null 2>&1 || true