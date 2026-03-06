#!/usr/bin/env bash
set -euo pipefail

BASE_BRANCH="${1:-main}"

# ===== Утилиты =====

err() { echo "Ошибка: $*" >&2; }
info() { echo "$*"; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    err "не найдено: $1"
    exit 1
  }
}

is_git_repo() {
  git rev-parse --is-inside-work-tree >/dev/null 2>&1
}

sanitize_branch_part() {
  # Приводим имя ветки к безопасному виду для remote-ветки
  # feat/my-change -> feat-my-change
  # Удаляем лишние символы, схлопываем дефисы
  printf '%s' "$1" \
    | tr '[:upper:]' '[:lower:]' \
    | sed -E 's#[^a-z0-9._/-]+#-#g; s#/#-#g; s#-+#-#g; s#^-+##; s#-+$##'
}

get_repo_owner() {
  gh repo view --json owner --jq '.owner.login' 2>/dev/null || true
}

get_repo_name() {
  gh repo view --json name --jq '.name' 2>/dev/null || true
}

parse_owner_repo_from_origin() {
  local origin_url repo_path owner repo
  origin_url="$(git remote get-url origin 2>/dev/null || true)"

  # Поддержка:
  # - https://github.com/owner/repo.git
  # - git@github.com:owner/repo.git
  repo_path="$(printf '%s' "$origin_url" | sed -E 's#^git@[^:]+:##; s#^https?://[^/]+/##; s#\.git$##')"
  owner="${repo_path%%/*}"
  repo="${repo_path##*/}"

  printf '%s\n%s\n' "$owner" "$repo"
}

ensure_base_remote_ref() {
  # Подтягиваем base-ветку с origin для построения описания PR
  git fetch -q origin "$BASE_BRANCH" || {
    info "Предупреждение: не удалось fetch origin/$BASE_BRANCH. Продолжу без подробного описания PR."
  }
}

working_tree_dirty() {
  [[ -n "$(git status --porcelain)" ]]
}

auto_commit_if_needed() {
  if working_tree_dirty; then
    info "Обнаружены незакоммиченные изменения. Автоматически коммичу..."
    git add -A
    # Включаем .github/workflows/ в коммит, чтобы исправленная ссылка PR preview попала в деплой
    # (pages-base-url без схемы — иначе в комментарии будет https://https://...)

    # Вдруг после add коммитить нечего
    if git diff --cached --quiet 2>/dev/null; then
      info "Нет изменений для автокоммита."
      return 0
    fi

    local commit_msg
    commit_msg="chore: auto-commit before PR ($(date '+%Y-%m-%d %H:%M:%S'))"

    git commit -m "$commit_msg"
    info "Незакоммиченные изменения автоматически закоммичены в ветку $(git rev-parse --abbrev-ref HEAD) (коммит $(git rev-parse --short HEAD))."
  else
    info "Незакоммиченных изменений нет."
  fi
}

build_unique_pr_branch() {
  local src_branch safe_branch ts short_sha rnd
  src_branch="$(git rev-parse --abbrev-ref HEAD)"
  safe_branch="$(sanitize_branch_part "$src_branch")"
  ts="$(date '+%Y%m%d-%H%M%S')"
  short_sha="$(git rev-parse --short HEAD)"
  rnd="${RANDOM:-12345}"

  # Пример: pr-auto/feat-my-change/20260304-220757-39cee17-31291
  printf 'pr-auto/%s/%s-%s-%s-%s\n' "$safe_branch" "$ts" "$short_sha" "$$" "$rnd"
}

build_pr_title() {
  git log -1 --pretty=%s HEAD 2>/dev/null || echo "chore: auto PR"
}

build_pr_body() {
  local body=""
  if git rev-parse --verify "origin/$BASE_BRANCH" >/dev/null 2>&1; then
    body="$(git log --reverse --pretty=format:'- %h %s' "origin/$BASE_BRANCH..HEAD" 2>/dev/null || true)"
  fi

  if [[ -z "$body" ]]; then
    body="Автоматически созданный PR из локального HEAD."
  fi

  printf '%s' "$body"
}

create_pr_via_gh() {
  local owner="$1"
  local remote_branch="$2"
  local title body output

  title="$(build_pr_title)"
  body="$(build_pr_body)"

  info "Создаю НОВЫЙ PR: ${owner}:${remote_branch} -> ${BASE_BRANCH}"

  # Сначала пытаемся с явными title/body (без --fill, чтобы не было проблем с range)
  if output="$(
    gh pr create \
      --base "$BASE_BRANCH" \
      --head "${owner}:${remote_branch}" \
      --title "$title" \
      --body "$body" 2>&1
  )"; then
    printf '%s\n' "$output"
    return 0
  fi

  info "Предупреждение: не удалось создать PR с автоматически собранным title/body. Пробую fallback через --fill..."
  info "$output"

  output=""
  if output="$(gh pr create \
    --base "$BASE_BRANCH" \
    --head "${owner}:${remote_branch}" \
    --fill 2>&1)"; then
    printf '%s\n' "$output"
    return 0
  fi
  printf '%s\n' "$output" >&2
  return 1
}

# Открывает в браузере указанный URL PR (иначе gh pr view откроет PR текущей ветки, а не только что созданный).
open_pr_in_browser_if_possible() {
  local pr_url="$1"
  if [[ -n "$pr_url" ]]; then
    if command -v open >/dev/null 2>&1; then
      open "$pr_url" 2>/dev/null || true
    elif command -v xdg-open >/dev/null 2>&1; then
      xdg-open "$pr_url" 2>/dev/null || true
    else
      gh pr view "$pr_url" --web 2>/dev/null || true
    fi
    return
  fi
  gh pr view --web >/dev/null 2>&1 || true
}

# Из вывода gh pr create извлекает URL созданного PR.
extract_pr_url_from_output() {
  printf '%s' "$1" | grep -oE 'https://github\.com/[^/]+/[^/]+/pull/[0-9]+' | head -1
}

# Из URL PR извлекает номер (для сборки ссылки на preview).
extract_pr_number_from_url() {
  printf '%s' "$1" | grep -oE '/pull/[0-9]+' | grep -oE '[0-9]+' | head -1
}

# Создаёт короткую ссылку через clc.is (бесплатно, без регистрации).
# Возвращает short URL или пусто при ошибке. Slug должен быть уникальным (409 = уже занят).
# max_retries: число попыток при сетевой ошибке.
create_short_link_clcis() {
  local long_url="$1"
  local slug="$2"
  local max_retries="${3:-3}"
  local resp status i
  for i in $(seq 1 "$max_retries"); do
    resp="$(curl -sS -w '\n%{http_code}' -X POST 'https://clc.is/api/links' \
      -H 'Content-Type: application/json' \
      -d "{\"domain\":\"clc.is\",\"target_url\":\"${long_url}\",\"slug\":\"${slug}\"}" 2>/dev/null)" || true
    status="$(printf '%s' "$resp" | tail -1)"
    if [[ "$status" == "200" ]]; then
      printf '%s' "$resp" | grep -oE 'https://clc\.is/[^"]+' | head -1
      return 0
    elif [[ "$status" == "409" ]]; then
      # Slug уже занят (например, скрипт уже создал — workflow повторяет)
      printf 'https://clc.is/%s\n' "$slug"
      return 0
    fi
    [[ "$i" -lt "$max_retries" ]] && sleep 2
  done
  # Диагностика при сбое
  err "clc.is: последний HTTP status=$status, ответ: $(printf '%s' "$resp" | head -c 200)"
  return 1
}

# Проверяет, что короткая ссылка отдаёт редирект (301/302), а не 404.
verify_short_link_redirect() {
  local short_url="$1"
  local status
  status="$(curl -sS -o /dev/null -w '%{http_code}' -I "$short_url" 2>/dev/null)" || true
  [[ "$status" == "301" || "$status" == "302" || "$status" == "307" || "$status" == "308" ]]
}

# Проверяет, что PR существует и открыт.
verify_pr_open() {
  local pr_num="$1"
  local state
  state="$(gh pr view "$pr_num" --json state -q '.state' 2>/dev/null)" || true
  [[ "$state" == "OPEN" ]]
}

# ===== Основная логика =====

require_cmd git
require_cmd gh
require_cmd curl

is_git_repo || { err "текущая папка не является git-репозиторием"; exit 1; }

if ! gh auth status >/dev/null 2>&1; then
  err "gh не авторизован. Выполните: gh auth login"
  exit 1
fi

BRANCH="$(git rev-parse --abbrev-ref HEAD)"

if [[ "$BRANCH" == "HEAD" ]]; then
  err "detached HEAD. Переключитесь на обычную ветку."
  exit 1
fi

if [[ "$BRANCH" == "main" || "$BRANCH" == "master" ]]; then
  err "вы на ветке $BRANCH. Создайте feature/fix ветку и работайте в ней."
  exit 1
fi

git remote get-url origin >/dev/null 2>&1 || {
  err "не найден remote 'origin'"
  exit 1
}

# Проверим, что base-ветка существует на origin (мягко)
if ! git ls-remote --exit-code --heads origin "$BASE_BRANCH" >/dev/null 2>&1; then
  err "ветка '$BASE_BRANCH' не найдена на origin"
  exit 1
fi

# Автокоммит локальных изменений (если есть)
auto_commit_if_needed

# Подтягиваем base-ветку для формирования тела PR
ensure_base_remote_ref

# Проверяем, что есть хотя бы один коммит вперёд base (иначе GitHub отклонит PR)
if git rev-parse --verify "origin/${BASE_BRANCH}" >/dev/null 2>&1; then
  ahead="$(git rev-list --count "origin/${BASE_BRANCH}..HEAD" 2>/dev/null || echo 0)"
  if [[ "${ahead:-0}" -eq 0 ]]; then
    err "нет коммитов относительно origin/${BASE_BRANCH}. Сделайте коммиты в текущей ветке и запустите скрипт снова."
    exit 1
  fi
fi

# Получаем owner/repo
REPO_OWNER="$(get_repo_owner)"
REPO_NAME="$(get_repo_name)"

if [[ -z "$REPO_OWNER" || -z "$REPO_NAME" ]]; then
  mapfile_tmp="$(parse_owner_repo_from_origin)"
  REPO_OWNER="$(printf '%s' "$mapfile_tmp" | sed -n '1p')"
  REPO_NAME="$(printf '%s' "$mapfile_tmp" | sed -n '2p')"
fi

if [[ -z "$REPO_OWNER" || -z "$REPO_NAME" ]]; then
  err "не удалось определить owner/repo"
  exit 1
fi

# Создаём УНИКАЛЬНУЮ remote-ветку под новый PR
REMOTE_PR_BRANCH="$(build_unique_pr_branch)"

info "Пушу HEAD в новую ветку origin: $REMOTE_PR_BRANCH"
git push origin "HEAD:refs/heads/$REMOTE_PR_BRANCH"

info "В origin запушена ветка: $REMOTE_PR_BRANCH"

# Создаём новый PR
if PR_CREATE_OUTPUT="$(create_pr_via_gh "$REPO_OWNER" "$REMOTE_PR_BRANCH")"; then
  printf '%s\n' "$PR_CREATE_OUTPUT"
  info "Готово. Новый PR создан."
  NEW_PR_URL="$(extract_pr_url_from_output "$PR_CREATE_OUTPUT")"
  PR_NUM="$(extract_pr_number_from_url "$NEW_PR_URL")"
  if [[ -n "$PR_NUM" ]]; then
    # Проверка корректности PR
    if verify_pr_open "$PR_NUM"; then
      info "PR #$PR_NUM проверен: существует и открыт."
    else
      info "Предупреждение: PR #$PR_NUM не найден или закрыт."
    fi

    PREVIEW_URL="https://${REPO_OWNER}.github.io/${REPO_NAME}/pr-preview/pr-${PR_NUM}/"
    SHORT_SLUG="copilot-1co-2.0-pr-${PR_NUM}"
    DISPLAY_URL="$PREVIEW_URL"
    SHORT_URL="$(create_short_link_clcis "$PREVIEW_URL" "$SHORT_SLUG")" || true
    if [[ -n "$SHORT_URL" ]] && verify_short_link_redirect "$SHORT_URL"; then
      DISPLAY_URL="$SHORT_URL"
      info "Короткая ссылка проверена: редирект работает."
    else
      if [[ -n "$SHORT_URL" ]]; then
        info "Предупреждение: короткая ссылка не отдаёт редирект (404?), используется длинная."
      else
        info "Предупреждение: не удалось создать короткую ссылку, используется длинная."
      fi
      DISPLAY_URL="$PREVIEW_URL"
    fi
    info "Приложение (preview): copilot-1co-2.0 → $DISPLAY_URL"
    if gh pr comment "$PR_NUM" --body "## Ссылка на приложение (preview)

[copilot-1co-2.0](${DISPLAY_URL})

*(Развёрнуто из этого PR; обновляется при новых коммитах.)*" 2>/dev/null; then
      info "В PR добавлен комментарий со ссылкой."
    fi
    if gh workflow run "PR Preview" -f pr_number="$PR_NUM" 2>/dev/null; then
      info "Workflow PR Preview запущен (деплой на Pages)."
    else
      info "Запустить превью вручную: Actions → PR Preview → Run workflow → номер PR $PR_NUM."
    fi
  fi
  info "Готово."
  open_pr_in_browser_if_possible "$NEW_PR_URL"
else
  err "Не удалось создать PR через gh. Проверьте: gh auth status, права на push в origin, что ветка не защищена."
  info "Откройте вручную:"
  info "https://github.com/${REPO_OWNER}/${REPO_NAME}/pull/new/${REMOTE_PR_BRANCH}"
  exit 1
fi