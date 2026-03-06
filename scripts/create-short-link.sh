#!/usr/bin/env bash
# Создаёт короткую ссылку clc.is для существующего PR и опционально добавляет комментарий.
# Использование: ./scripts/create-short-link.sh <номер_PR>
# Пример: ./scripts/create-short-link.sh 98

set -euo pipefail

PR_NUM="${1:?Укажите номер PR}"

err() { echo "Ошибка: $*" >&2; }
info() { echo "$*"; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    err "не найдено: $1"
    exit 1
  }
}

get_repo_owner() {
  gh repo view --json owner --jq '.owner.login' 2>/dev/null || true
}

get_repo_name() {
  gh repo view --json name --jq '.name' 2>/dev/null || true
}

parse_owner_repo_from_origin() {
  local origin_url repo_path
  origin_url="$(git remote get-url origin 2>/dev/null || true)"
  repo_path="$(printf '%s' "$origin_url" | sed -E 's#^git@[^:]+:##; s#^https?://[^/]+/##; s#\.git$##')"
  printf '%s\n%s\n' "${repo_path%%/*}" "${repo_path##*/}"
}

create_short_link_clcis() {
  local long_url="$1"
  local slug="$2"
  local resp status
  resp="$(curl -sS -w '\n%{http_code}' -X POST 'https://clc.is/api/links' \
    -H 'Content-Type: application/json' \
    -d "{\"domain\":\"clc.is\",\"target_url\":\"${long_url}\",\"slug\":\"${slug}\"}" 2>/dev/null)" || true
  status="$(printf '%s' "$resp" | tail -1)"
  if [[ "$status" == "200" ]]; then
    printf '%s' "$resp" | grep -oE 'https://clc\.is/[^"]+' | head -1
  elif [[ "$status" == "409" ]]; then
    printf 'https://clc.is/%s\n' "$slug"
  fi
}

require_cmd curl
require_cmd gh

REPO_OWNER="$(get_repo_owner)"
REPO_NAME="$(get_repo_name)"
[[ -z "$REPO_OWNER" || -z "$REPO_NAME" ]] && {
  mapfile_tmp="$(parse_owner_repo_from_origin)"
  REPO_OWNER="$(printf '%s' "$mapfile_tmp" | sed -n '1p')"
  REPO_NAME="$(printf '%s' "$mapfile_tmp" | sed -n '2p')"
}

[[ -z "$REPO_OWNER" || -z "$REPO_NAME" ]] && { err "не удалось определить owner/repo"; exit 1; }

PREVIEW_URL="https://${REPO_OWNER}.github.io/${REPO_NAME}/pr-preview/pr-${PR_NUM}/"
SLUG="copilot-1co-2.0-pr-${PR_NUM}"

info "Создаю короткую ссылку: $SLUG -> $PREVIEW_URL"
SHORT_URL="$(create_short_link_clcis "$PREVIEW_URL" "$SLUG")"

if [[ -n "$SHORT_URL" ]]; then
  info "Готово: $SHORT_URL"
  if gh pr comment "$PR_NUM" --body "## Короткая ссылка на приложение (preview)

[copilot-1co-2.0]($SHORT_URL) → редирект на preview

*(Создано вручную.)*" 2>/dev/null; then
    info "Комментарий добавлен в PR #$PR_NUM."
  else
    info "Не удалось добавить комментарий (gh pr comment). Добавьте ссылку вручную."
  fi
else
  err "Не удалось создать короткую ссылку. Проверьте: curl, сеть, доступность clc.is."
  exit 1
fi
