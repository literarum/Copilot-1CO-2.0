#!/usr/bin/env bash
# Полная синхронизация песочницы (Copilot-1CO-2.0-main) в git-клон и пуш для PR.
# Запуск: из папки Copilot-1CO-2.0-main выполнить: bash sync-and-push-pr.sh

set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
CLONE="$ROOT/Copilot-1CO-2.0"
REPO_URL="https://github.com/literarum/Copilot-1CO-2.0.git"
BRANCH="feat/yandex-cloud-migration"

echo "=== Корень песочницы: $ROOT ==="

# 1) Клон есть?
if [ ! -d "$CLONE/.git" ]; then
  echo "Клонирую репозиторий в $CLONE ..."
  git clone "$REPO_URL" "$CLONE"
  cd "$CLONE"
else
  cd "$CLONE"
  git fetch origin
fi

# 2) Ветка: переключиться на main, подтянуть, создать feature-ветку
git checkout main 2>/dev/null || true
git pull origin main 2>/dev/null || true
git checkout -B "$BRANCH" 2>/dev/null || git checkout "$BRANCH"

# 3) Удалить в клоне легаси (если есть)
git rm -rf worker 2>/dev/null || rm -rf worker
git rm -f wrangler.toml vercel.json .vercelignore 2>/dev/null || true
git rm -f .github/workflows/deploy-worker-cloudflare.yml 2>/dev/null || true
git rm -f scripts/deploy-prod.sh api/health.js 2>/dev/null || true
git rm -f "docs/plans/2026-02-28-cert-revocation-macos-and-styles-fix.md" 2>/dev/null || true
rm -rf site/.vercel 2>/dev/null || true

# 4) Синхронизировать песочницу -> клон (без node_modules, .git, .cursor, .vercel)
echo "Синхронизирую дерево из песочницы в клон..."
rsync -a --delete \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='.cursor' \
  --exclude='.vercel' \
  --exclude='Copilot-1CO-2.0' \
  --exclude='sync-and-push-pr.sh' \
  "$ROOT/" "$CLONE/" || {
  echo "rsync не найден, копирую вручную..."
  for f in README.md DEPLOY_INSTRUCTIONS.md package.json vitest.config.mjs .gitignore eslint.config.js .eslintrc.json .gitattributes MIGRATION_REPORT.md MIGRATION_PLAN.md; do
    [ -f "$ROOT/$f" ] && cp -f "$ROOT/$f" .
  done
  rm -rf api scripts site docs desktop-helper helper yandex-function
  cp -R "$ROOT/api" "$ROOT/scripts" "$ROOT/site" "$ROOT/docs" "$ROOT/desktop-helper" "$ROOT/helper" "$ROOT/yandex-function" .
}
# Убрать из клона то, чего в песочнице уже нет (легаси)
rm -rf worker .vercel site/.vercel
rm -f wrangler.toml vercel.json .vercelignore
rm -f scripts/deploy-prod.sh api/health.js
[ -d .github/workflows ] && rm -f .github/workflows/deploy-worker-cloudflare.yml

# Не коммитить артефакты
grep -q '\.DS_Store' .gitignore 2>/dev/null || echo ".DS_Store" >> .gitignore
grep -q 'crl-checker/\*\.zip' .gitignore 2>/dev/null || echo "yandex-function/crl-checker/*.zip" >> .gitignore
git rm --cached yandex-function/.DS_Store 2>/dev/null || true
git rm --cached yandex-function/crl-checker/crl-checker.zip 2>/dev/null || true

# 5) Статус и коммит
git add -A
git status
echo "---"
read -p "Закоммитить и запушить? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Выход без push. Коммит можно сделать вручную: git add -A && git commit -m '...' && git push -u origin $BRANCH"
  exit 0
fi
git commit -m "Migrate hosting to Yandex Cloud and clean legacy" || true
git push -u origin "$BRANCH"

echo ""
echo "=== Готово. Открой PR (base: main, compare: $BRANCH): ==="
# GitHub принимает слэш в имени ветки (кодируется как %2F)
echo "https://github.com/literarum/Copilot-1CO-2.0/compare/main...${BRANCH//\//%2F}?expand=1"
