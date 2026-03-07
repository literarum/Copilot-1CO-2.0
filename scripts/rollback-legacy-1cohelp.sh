#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

LEGACY_REPO_URL="${LEGACY_REPO_URL:-https://github.com/literarum/1cohelp.git}"
LEGACY_REPO_DIR="${LEGACY_REPO_DIR:-${HOME}/.copilot-1co/1cohelp}"
LEGACY_BRANCH="${LEGACY_BRANCH:-main}"

PUBLIC_URL="${PUBLIC_URL:-https://literarum.github.io/1cohelp/}"
OPEN_AFTER_PUSH="${OPEN_AFTER_PUSH:-1}"

info() { printf '%s\n' "$*"; }
warn() { printf 'Предупреждение: %s\n' "$*" >&2; }
err()  { printf 'Ошибка: %s\n' "$*" >&2; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    err "не найдено: $1"
    exit 1
  }
}

git_in_legacy() {
  git -C "${LEGACY_REPO_DIR}" "$@"
}

ensure_legacy_repo() {
  mkdir -p "$(dirname "${LEGACY_REPO_DIR}")"

  if [[ ! -d "${LEGACY_REPO_DIR}/.git" ]]; then
    info "Клонирую legacy-репозиторий в ${LEGACY_REPO_DIR}"
    git clone "${LEGACY_REPO_URL}" "${LEGACY_REPO_DIR}"
  fi

  git_in_legacy fetch origin "${LEGACY_BRANCH}" --tags

  if git_in_legacy show-ref --verify --quiet "refs/heads/${LEGACY_BRANCH}"; then
    git_in_legacy checkout "${LEGACY_BRANCH}"
  else
    git_in_legacy checkout -b "${LEGACY_BRANCH}" "origin/${LEGACY_BRANCH}"
  fi

  git_in_legacy reset --hard "origin/${LEGACY_BRANCH}"
  git_in_legacy clean -fd
}

latest_backup_tag() {
  git_in_legacy tag --list 'before-legacy-deploy-*' --sort=-creatordate | head -n 1
}

parse_args() {
  TARGET_TAG="${1:-}"
  if [[ "${TARGET_TAG}" == "--help" || "${TARGET_TAG}" == "-h" ]]; then
    cat <<'EOF'
Использование:
  ./scripts/rollback-legacy-1cohelp.sh            # откат к последнему backup-tag
  ./scripts/rollback-legacy-1cohelp.sh <tag>      # откат к указанному tag
EOF
    exit 0
  fi
}

main() {
  parse_args "${@:-}"

  require_cmd git

  ensure_legacy_repo

  if [[ -z "${TARGET_TAG}" ]]; then
    TARGET_TAG="$(latest_backup_tag)"
  fi

  [[ -n "${TARGET_TAG}" ]] || {
    err "не найден ни один backup-tag вида before-legacy-deploy-*"
    exit 1
  }

  git_in_legacy rev-parse -q --verify "refs/tags/${TARGET_TAG}" >/dev/null || {
    err "tag не найден: ${TARGET_TAG}"
    exit 1
  }

  local current_sha target_sha msg
  current_sha="$(git_in_legacy rev-parse HEAD)"
  target_sha="$(git_in_legacy rev-list -n 1 "${TARGET_TAG}")"

  if [[ "${current_sha}" == "${target_sha}" ]]; then
    info "Legacy-репозиторий уже находится на ${TARGET_TAG} (${target_sha}). Откат не нужен."
    exit 0
  fi

  info "Откат legacy-репозитория:"
  info "  current: ${current_sha}"
  info "  target : ${TARGET_TAG} -> ${target_sha}"

  git_in_legacy reset --hard "origin/${LEGACY_BRANCH}"

  msg="Rollback legacy site to ${TARGET_TAG}"
  git_in_legacy revert --no-edit "${target_sha}..HEAD" || {
    err "автоматический rollback через revert не удался. Потребуется ручное вмешательство."
    exit 1
  }

  if git_in_legacy diff --cached --quiet && git_in_legacy diff --quiet; then
    warn "После revert изменений не появилось. Возможно, откат уже был выполнен ранее."
    exit 0
  fi

  git_in_legacy commit --amend -m "${msg}"
  git_in_legacy push origin "${LEGACY_BRANCH}"

  info "Rollback завершён и запушен."

  if [[ "${OPEN_AFTER_PUSH}" == "1" ]] && command -v open >/dev/null 2>&1; then
    open "${PUBLIC_URL}?rollback=$(date +%s)" >/dev/null 2>&1 || true
  fi
}

main "$@"
