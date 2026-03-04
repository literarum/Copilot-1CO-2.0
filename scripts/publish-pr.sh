#!/usr/bin/env bash
set -euo pipefail

# -----------------------------------------------------------------------------
# publish-pr.sh
# Автоматически:
#  - коммитит локальные изменения (если есть),
#  - пушит HEAD в уникальную remote-ветку,
#  - создает НОВЫЙ PR в указанный base branch.
#
# Использование:
#   ./scripts/publish-pr.sh [base-branch]
#
# Примеры:
#   ./scripts/publish-pr.sh
#   ./scripts/publish-pr.sh main
#   AUTO_COMMIT_MESSAGE="feat: apply local changes" ./scripts/publish-pr.sh main
# -----------------------------------------------------------------------------

BASE_BRANCH="${1:-main}"

# Необязательные переменные окружения
AUTO_COMMIT_MESSAGE="${AUTO_COMMIT_MESSAGE:-}"   # Если пусто — сгенерируем автоматически
PR_BRANCH_PREFIX="${PR_BRANCH_PREFIX:-pr-auto}"  # Префикс для временной remote-ветки
OPEN_BROWSER="${OPEN_BROWSER:-1}"                # 1 = открыть PR в браузере, 0 = не открывать

# ------------------------------- Утилиты -------------------------------------

msg() { echo "[$(basename "$0")] $*"; }
err() { echo "[$(basename "$0")] Ошибка: $*" >&2; exit 1; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || err "не найдено '$1'. Установите и повторите."
}

current_branch() {
  git symbolic-ref --quiet --short HEAD 2>/dev/null || true
}

sanitize_branch_part() {
  # Разрешим безопасные символы в имени remote-ветки
  # Все остальное заменяем на '-'
  printf '%s' "$1" | sed -E 's/[^A-Za-z0-9._-]+/-/g; s/^-+//; s/-+$//; s/-{2,}/-/g'
}

worktree_dirty() {
  # Есть unstaged?
  if ! git diff --quiet; then
    return 0
  fi
  # Есть staged?
  if ! git diff --cached --quiet; then
    return 0
  fi
  # Есть untracked?
  if [[ -n "$(git ls-files --others --exclude-standard)" ]]; then
    return 0
  fi
  return 1
}

ensure_no_merge_conflicts() {
  if [[ -n "$(git diff --name-only --diff-filter=U)" ]]; then
    err "обнаружены merge-конфликты. Сначала вручную разрешите их, затем повторите запуск."
  fi
}

auto_commit_if_needed() {
  ensure_no_merge_conflicts

  if worktree_dirty; then
    local branch ts msg_text
    branch="$(current_branch)"
    ts="$(date '+%Y-%m-%d %H:%M:%S %z')"

    if [[ -n "$AUTO_COMMIT_MESSAGE" ]]; then
      msg_text="$AUTO_COMMIT_MESSAGE"
    else
      msg_text="chore: auto-commit before PR (${branch}) ${ts}"
    fi

    msg "Обнаружены незакоммиченные изменения. Выполняю автоматический commit..."
    git add -A

    # На случай, если изменения были только ignored-файлами / ничего не попало в index
    if git diff --cached --quiet; then
      msg "После git add -A нет изменений для коммита (возможно, были только ignored-файлы). Продолжаю."
      return 0
    fi

    git commit -m "$msg_text"
    msg "Автокоммит выполнен."
  else
    msg "Незакоммиченных изменений нет. Продолжаю."
  fi
}

ensure_inside_git_repo() {
  git rev-parse --is-inside-work-tree >/dev/null 2>&1 || err "это не git-репозиторий."
}

ensure_gh_auth() {
  # gh auth status печатает в stderr, поэтому просто проверяем код возврата
  gh auth status >/dev/null 2>&1 || err "gh не авторизован. Выполните: gh auth login"
}

ensure_origin_remote() {
  git remote get-url origin >/dev/null 2>&1 || err "не найден remote 'origin'."
}

ensure_valid_branch() {
  local branch="$1"

  [[ -n "$branch" ]] || err "detached HEAD. Переключитесь на обычную ветку."

  case "$branch" in
    main|master)
      err "вы на ветке '$branch'. Работайте из feature/fix ветки."
      ;;
  esac
}

fetch_base_branch() {
  msg "Обновляю origin/$BASE_BRANCH..."
  git fetch --quiet origin "$BASE_BRANCH" || err "не удалось получить origin/$BASE_BRANCH"
}

ensure_has_commits_ahead_of_base() {
  # Проверяем, что есть хотя бы 1 коммит в HEAD, которого нет в origin/$BASE_BRANCH
  local ahead_count
  ahead_count="$(git rev-list --count "origin/$BASE_BRANCH..HEAD" 2>/dev/null || echo 0)"

  if [[ "$ahead_count" -eq 0 ]]; then
    err "в текущем HEAD нет коммитов сверх origin/$BASE_BRANCH. PR создавать нечего."
  fi
}

generate_unique_remote_branch() {
  local local_branch="$1"
  local sanitized ts shortsha pid rand suffix remote_branch

  sanitized="$(sanitize_branch_part "$local_branch")"
  [[ -n "$sanitized" ]] || sanitized="change"

  ts="$(date '+%Y%m%d-%H%M%S')"
  shortsha="$(git rev-parse --short HEAD)"
  pid="$$"
  rand="$(LC_ALL=C tr -dc 'a-z0-9' </dev/urandom | head -c 4 || true)"
  [[ -n "$rand" ]] || rand="rnd"

  # Пример:
  # pr-auto/feat-my-change/20260304-154455-abc1234-12345-x9k2
  remote_branch="${PR_BRANCH_PREFIX}/${sanitized}/${ts}-${shortsha}-${pid}-${rand}"

  printf '%s\n' "$remote_branch"
}

ensure_remote_branch_is_new() {
  local remote_branch="$1"
  if git ls-remote --exit-code --heads origin "$remote_branch" >/dev/null 2>&1; then
    err "remote-ветка уже существует: $remote_branch (неожиданно). Повторите запуск."
  fi
}

push_head_to_unique_remote_branch() {
  local remote_branch="$1"
  msg "Пушу текущий HEAD в новую remote-ветку: $remote_branch"
  git push origin "HEAD:refs/heads/$remote_branch"
}

repo_owner() {
  gh repo view --json owner --jq '.owner.login' 2>/dev/null
}

create_new_pr() {
  local remote_branch="$1"
  local owner="$2"
  local pr_url

  msg "Создаю НОВЫЙ PR: ${owner}:${remote_branch} -> ${BASE_BRANCH}"

  # --fill берёт title/body из commit history
  # Явно указываем owner:branch, чтобы не было неоднозначности
  pr_url="$(
    gh pr create \
      --base "$BASE_BRANCH" \
      --head "${owner}:${remote_branch}" \
      --fill
  )"

  echo "$pr_url"
}

open_pr_if_needed() {
  local pr_url="$1"
  if [[ "$OPEN_BROWSER" == "1" ]]; then
    gh pr view "$pr_url" --web >/dev/null 2>&1 || true
  fi
}

# --------------------------------- main --------------------------------------

main() {
  require_cmd git
  require_cmd gh

  ensure_inside_git_repo
  ensure_gh_auth
  ensure_origin_remote

  local local_branch
  local_branch="$(current_branch)"
  ensure_valid_branch "$local_branch"

  msg "Локальная ветка: $local_branch"
  msg "Base branch: $BASE_BRANCH"

  auto_commit_if_needed

  fetch_base_branch
  ensure_has_commits_ahead_of_base

  local remote_branch
  remote_branch="$(generate_unique_remote_branch "$local_branch")"
  ensure_remote_branch_is_new "$remote_branch"

  push_head_to_unique_remote_branch "$remote_branch"

  local owner
  owner="$(repo_owner)"
  [[ -n "$owner" ]] || err "не удалось определить owner репозитория через gh."

  local pr_url
  pr_url="$(create_new_pr "$remote_branch" "$owner")"

  msg "Готово. PR создан:"
  echo "$pr_url"

  open_pr_if_needed "$pr_url"

  cat <<EOF

Сводка:
  Локальная ветка: $local_branch
  Новая remote-ветка: $remote_branch
  Base branch: $BASE_BRANCH
  PR: $pr_url

EOF
}

main "$@"