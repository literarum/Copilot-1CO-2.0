#!/usr/bin/env bash
set -euo pipefail

# =========================
# Конфиг
# =========================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

MANIFEST_FILE="${MANIFEST_FILE:-${SOURCE_REPO_DIR}/.deploy-legacy-manifest}"

LEGACY_REPO_URL="${LEGACY_REPO_URL:-https://github.com/literarum/1cohelp.git}"
LEGACY_REPO_DIR="${LEGACY_REPO_DIR:-${HOME}/.copilot-1co/1cohelp}"
LEGACY_BRANCH="${LEGACY_BRANCH:-main}"

PUBLIC_URL="${PUBLIC_URL:-https://literarum.github.io/1cohelp/}"
SITE_URL_PREFIX="${SITE_URL_PREFIX:-/1cohelp}"

VERIFY_MODE="${VERIFY_MODE:-full}"      # full | quick | skip
OPEN_AFTER_PUSH="${OPEN_AFTER_PUSH:-1}" # 1 | 0
WAIT_PUBLIC="${WAIT_PUBLIC:-1}"         # 1 | 0
PUBLIC_WAIT_SECONDS="${PUBLIC_WAIT_SECONDS:-180}"
PUBLIC_POLL_INTERVAL="${PUBLIC_POLL_INTERVAL:-10}"

# =========================
# Логирование
# =========================

info() { printf '%s\n' "$*"; }
warn() { printf 'Предупреждение: %s\n' "$*" >&2; }
err()  { printf 'Ошибка: %s\n' "$*" >&2; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    err "не найдено: $1"
    exit 1
  }
}

# =========================
# Cleanup
# =========================

SERVER_PID=""
STAGE_ROOT=""
STAGE_SITE=""
DEPLOY_VERSION=""
LEGACY_TAG=""

cleanup() {
  if [[ -n "${SERVER_PID}" ]] && kill -0 "${SERVER_PID}" >/dev/null 2>&1; then
    kill "${SERVER_PID}" >/dev/null 2>&1 || true
    wait "${SERVER_PID}" 2>/dev/null || true
  fi

  if [[ -n "${STAGE_ROOT}" && -d "${STAGE_ROOT}" ]]; then
    rm -rf "${STAGE_ROOT}" || true
  fi
}
trap cleanup EXIT INT TERM

# =========================
# Аргументы
# =========================

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --quick)
        VERIFY_MODE="quick"
        shift
        ;;
      --skip-verify)
        VERIFY_MODE="skip"
        shift
        ;;
      --no-open)
        OPEN_AFTER_PUSH="0"
        shift
        ;;
      --no-wait-public)
        WAIT_PUBLIC="0"
        shift
        ;;
      *)
        err "неизвестный аргумент: $1"
        exit 1
        ;;
    esac
  done
}

# =========================
# Git helpers
# =========================

git_in_source() {
  git -C "${SOURCE_REPO_DIR}" "$@"
}

git_in_legacy() {
  git -C "${LEGACY_REPO_DIR}" "$@"
}

source_branch() {
  git_in_source rev-parse --abbrev-ref HEAD
}

source_sha() {
  git_in_source rev-parse HEAD
}

source_short_sha() {
  git_in_source rev-parse --short HEAD
}

source_dirty() {
  [[ -n "$(git_in_source status --porcelain)" ]]
}

legacy_dirty() {
  [[ -n "$(git_in_legacy status --porcelain)" ]]
}

ensure_source_repo() {
  git_in_source rev-parse --is-inside-work-tree >/dev/null 2>&1 || {
    err "SOURCE_REPO_DIR не является git-репозиторием: ${SOURCE_REPO_DIR}"
    exit 1
  }

  [[ -f "${MANIFEST_FILE}" ]] || {
    err "не найден deploy-манифест: ${MANIFEST_FILE}"
    exit 1
  }
}

ensure_source_branch_syncable() {
  local branch
  branch="$(source_branch)"

  if [[ "${branch}" == "HEAD" ]]; then
    err "detached HEAD в основном репозитории"
    exit 1
  fi

  git_in_source fetch origin "${branch}" >/dev/null 2>&1 || true

  if git_in_source rev-parse --verify "origin/${branch}" >/dev/null 2>&1; then
    if ! git_in_source merge-base --is-ancestor "origin/${branch}" HEAD; then
      err "локальная ветка ${branch} не содержит origin/${branch}. Сначала синхронизируй ветку."
      exit 1
    fi
  fi
}

auto_commit_source_if_needed() {
  if ! source_dirty; then
    info "Основной репозиторий: незакоммиченных изменений нет."
    return 0
  fi

  local branch commit_msg
  branch="$(source_branch)"

  if [[ "${branch}" == "HEAD" ]]; then
    err "detached HEAD в основном репозитории"
    exit 1
  fi

  info "Основной репозиторий: найдены незакоммиченные изменения. Делаю автокоммит..."
  git_in_source add -A

  if git_in_source diff --cached --quiet 2>/dev/null; then
    info "После git add коммитить нечего."
    return 0
  fi

  commit_msg="chore: auto-commit before legacy deploy ($(date '+%Y-%m-%d %H:%M:%S'))"
  git_in_source commit -m "${commit_msg}"
  info "Автокоммит создан: $(source_short_sha)"
}

push_source_branch() {
  local branch
  branch="$(source_branch)"

  info "Пушу основной репозиторий: branch=${branch}"
  if git_in_source rev-parse --abbrev-ref --symbolic-full-name '@{u}' >/dev/null 2>&1; then
    git_in_source push
  else
    git_in_source push -u origin "${branch}"
  fi
}

run_verify() {
  local verify_script
  verify_script="${SOURCE_REPO_DIR}/scripts/verify.sh"

  case "${VERIFY_MODE}" in
    skip)
      info "Проверки пропущены (--skip-verify)."
      ;;
    quick)
      [[ -f "${verify_script}" ]] || {
        err "не найден ${verify_script}"
        exit 1
      }
      info "Запускаю quick verification..."
      bash "${verify_script}" --quick
      ;;
    full)
      [[ -f "${verify_script}" ]] || {
        err "не найден ${verify_script}"
        exit 1
      }
      info "Запускаю full verification..."
      bash "${verify_script}"
      ;;
    *)
      err "неподдерживаемый VERIFY_MODE=${VERIFY_MODE}"
      exit 1
      ;;
  esac
}

# =========================
# Legacy repo
# =========================

ensure_legacy_repo() {
  mkdir -p "$(dirname "${LEGACY_REPO_DIR}")"

  if [[ ! -d "${LEGACY_REPO_DIR}/.git" ]]; then
    info "Клонирую legacy-репозиторий в ${LEGACY_REPO_DIR}"
    git clone "${LEGACY_REPO_URL}" "${LEGACY_REPO_DIR}"
  fi

  info "Синхронизирую legacy-репозиторий..."
  git_in_legacy fetch origin "${LEGACY_BRANCH}"

  if git_in_legacy show-ref --verify --quiet "refs/heads/${LEGACY_BRANCH}"; then
    git_in_legacy checkout "${LEGACY_BRANCH}"
  else
    git_in_legacy checkout -b "${LEGACY_BRANCH}" "origin/${LEGACY_BRANCH}"
  fi

  git_in_legacy reset --hard "origin/${LEGACY_BRANCH}"
  git_in_legacy clean -fd
}

create_legacy_backup_tag() {
  LEGACY_TAG="before-legacy-deploy-$(date '+%Y%m%d-%H%M%S')"
  info "Создаю backup-tag в legacy-репозитории: ${LEGACY_TAG}"
  git_in_legacy tag "${LEGACY_TAG}"
  git_in_legacy push origin "refs/tags/${LEGACY_TAG}"
}

# =========================
# Deploy manifest
# =========================

DEPLOY_ITEMS=()

read_manifest() {
  DEPLOY_ITEMS=()

  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%%#*}"
    line="$(printf '%s' "${line}" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')"
    [[ -z "${line}" ]] && continue
    DEPLOY_ITEMS+=("${line}")
  done < "${MANIFEST_FILE}"

  [[ "${#DEPLOY_ITEMS[@]}" -gt 0 ]] || {
    err "deploy-манифест пуст: ${MANIFEST_FILE}"
    exit 1
  }
}

# =========================
# Stage
# =========================

copy_item_to_stage() {
  local item raw src dest
  raw="$1"
  item="${raw%/}"
  src="${SOURCE_REPO_DIR}/${item}"
  dest="${STAGE_SITE}/${item}"

  if [[ "${item}" == ".nojekyll" && ! -e "${src}" ]]; then
    : > "${dest}"
    return 0
  fi

  [[ -e "${src}" ]] || {
    err "в deploy-манифесте указан отсутствующий путь: ${item}"
    exit 1
  }

  if [[ -d "${src}" ]]; then
    mkdir -p "${dest}"
    rsync -a "${src}/" "${dest}/"
  else
    mkdir -p "$(dirname "${dest}")"
    rsync -a "${src}" "${dest}"
  fi
}

stage_payload() {
  STAGE_ROOT="$(mktemp -d /tmp/legacy-1cohelp-stage.XXXXXX)"
  STAGE_SITE="${STAGE_ROOT}/1cohelp"
  mkdir -p "${STAGE_SITE}"

  info "Собираю stage-папку: ${STAGE_SITE}"
  for item in "${DEPLOY_ITEMS[@]}"; do
    copy_item_to_stage "${item}"
  done
}

validate_stage_minimum() {
  local must_have=(
    "index.html"
    "script.js"
    "js/entry.js"
    "css/styles.css"
  )

  for path in "${must_have[@]}"; do
    [[ -e "${STAGE_SITE}/${path}" ]] || {
      err "в stage отсутствует обязательный файл: ${path}"
      exit 1
    }
  done
}

apply_cache_bust() {
  DEPLOY_VERSION="legacy-$(date '+%Y%m%d-%H%M%S')-$(source_short_sha)"
  export STAGE_SITE DEPLOY_VERSION

  info "Применяю cache-bust version: ${DEPLOY_VERSION}"

  python3 - <<'PY'
import os
import re
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

site = Path(os.environ["STAGE_SITE"])
version = os.environ["DEPLOY_VERSION"]

attr_re = re.compile(r'(?P<prefix>\b(?:src|href)=["\'])(?P<url>[^"\']+)(?P<suffix>["\'])', re.IGNORECASE)

def is_local_asset(url: str) -> bool:
    low = url.lower()
    if low.startswith(("#", "mailto:", "tel:", "data:", "javascript:")):
        return False
    if low.startswith("//"):
        return False

    parts = urlsplit(url)
    if parts.scheme not in ("",):
        return False

    return parts.path.lower().endswith((".js", ".css"))

def with_version(url: str) -> str:
    parts = urlsplit(url)
    query = [(k, v) for k, v in parse_qsl(parts.query, keep_blank_values=True) if k != "v"]
    query.append(("v", version))
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))

changed = []

for html_file in site.rglob("*.html"):
    text = html_file.read_text(encoding="utf-8")
    original = text

    def repl(match: re.Match) -> str:
        url = match.group("url")
        if not is_local_asset(url):
            return match.group(0)
        return f'{match.group("prefix")}{with_version(url)}{match.group("suffix")}'

    text = attr_re.sub(repl, text)

    if text != original:
        html_file.write_text(text, encoding="utf-8")
        changed.append(str(html_file.relative_to(site)))

print("Cache-bust updated in HTML files:")
for item in changed:
    print(item)
PY
}

validate_html_local_refs() {
  export STAGE_SITE SITE_URL_PREFIX

  info "Проверяю локальные ссылки в HTML..."

  python3 - <<'PY'
import os
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit

site = Path(os.environ["STAGE_SITE"]).resolve()
prefix = os.environ["SITE_URL_PREFIX"].rstrip("/")

errors = []

class RefCollector(HTMLParser):
    def __init__(self):
        super().__init__()
        self.refs = []

    def handle_starttag(self, tag, attrs):
        for key, value in attrs:
            if key in ("src", "href") and value:
                self.refs.append(value)

def is_external(url: str) -> bool:
    low = url.lower()
    return (
        low.startswith(("http://", "https://", "//", "mailto:", "tel:", "data:", "javascript:", "#"))
    )

def resolve_ref(html_file: Path, ref: str):
    parts = urlsplit(ref)
    path = parts.path
    if not path:
        return None

    if path.startswith(prefix + "/"):
        rel = path[len(prefix) + 1:]
        target = site / rel
    elif path == prefix or path == prefix + "/":
        target = site / "index.html"
    elif path.startswith("/"):
        target = site / path.lstrip("/")
    else:
        target = (html_file.parent / path).resolve()

    if target.is_dir():
        target = target / "index.html"

    return target

for html_file in site.rglob("*.html"):
    parser = RefCollector()
    parser.feed(html_file.read_text(encoding="utf-8"))

    for ref in parser.refs:
      if is_external(ref):
        continue

      target = resolve_ref(html_file, ref)
      if target is None:
        continue

      try:
        target.resolve().relative_to(site)
      except Exception:
        errors.append(f"{html_file.relative_to(site)} -> {ref} (выход за пределы site root)")
        continue

      if not target.exists():
        errors.append(f"{html_file.relative_to(site)} -> {ref} (не найдено: {target.relative_to(site) if target.exists() else target})")

if errors:
    print("BROKEN REFS:")
    for item in errors:
        print(item)
    raise SystemExit(1)

print("HTML refs OK")
PY
}

smoke_test_stage() {
  local port
  port="$(python3 - <<'PY'
import socket
s = socket.socket()
s.bind(("127.0.0.1", 0))
print(s.getsockname()[1])
s.close()
PY
)"

  info "Локальный smoke-test: http://127.0.0.1:${port}/1cohelp/"
  python3 -m http.server "${port}" --bind 127.0.0.1 --directory "${STAGE_ROOT}" >/dev/null 2>&1 &
  SERVER_PID="$!"

  sleep 1

  curl -fsS "http://127.0.0.1:${port}/1cohelp/?t=${DEPLOY_VERSION}" >/dev/null
  curl -fsS "http://127.0.0.1:${port}/1cohelp/script.js?v=${DEPLOY_VERSION}" >/dev/null
  curl -fsS "http://127.0.0.1:${port}/1cohelp/js/entry.js?v=${DEPLOY_VERSION}" >/dev/null
  curl -fsS "http://127.0.0.1:${port}/1cohelp/css/styles.css?v=${DEPLOY_VERSION}" >/dev/null

  if [[ -f "${STAGE_SITE}/client-notes-standalone.html" ]]; then
    curl -fsS "http://127.0.0.1:${port}/1cohelp/client-notes-standalone.html?t=${DEPLOY_VERSION}" >/dev/null
  fi

  kill "${SERVER_PID}" >/dev/null 2>&1 || true
  wait "${SERVER_PID}" 2>/dev/null || true
  SERVER_PID=""

  info "Smoke-test пройден."
}

# =========================
# Legacy sync
# =========================

sync_stage_to_legacy() {
  info "Синхронизирую stage -> legacy-repo"
  rsync -a --delete \
    --exclude '.git' \
    --exclude '.github' \
    "${STAGE_SITE}/" "${LEGACY_REPO_DIR}/"
}

commit_and_push_legacy() {
  local branch msg

  if ! legacy_dirty; then
    info "В legacy-репозитории нет изменений. Деплой не требуется."
    return 0
  fi

  create_legacy_backup_tag

  git_in_legacy add -A
  branch="$(source_branch)"
  msg="Deploy from Copilot-1CO-2.0 ${branch}@$(source_short_sha) (${DEPLOY_VERSION})"

  git_in_legacy commit -m "${msg}"
  git_in_legacy push origin "${LEGACY_BRANCH}"

  info "Legacy-репозиторий обновлён и запушен."
}

wait_for_public_site() {
  local deadline content

  [[ "${WAIT_PUBLIC}" == "1" ]] || {
    info "Ожидание публичного Pages пропущено (--no-wait-public)."
    return 0
  }

  info "Жду обновление публичного GitHub Pages..."

  deadline=$((SECONDS + PUBLIC_WAIT_SECONDS))
  while (( SECONDS < deadline )); do
    if content="$(curl -fsS "${PUBLIC_URL}?t=${DEPLOY_VERSION}" 2>/dev/null || true)"; then
      if printf '%s' "${content}" | grep -Fq "${DEPLOY_VERSION}"; then
        info "Публичный сайт обновился: ${PUBLIC_URL}"
        return 0
      fi
    fi
    sleep "${PUBLIC_POLL_INTERVAL}"
  done

  warn "Не удалось подтвердить обновление публичного сайта за ${PUBLIC_WAIT_SECONDS} секунд."
  return 1
}

open_public_site_if_needed() {
  [[ "${OPEN_AFTER_PUSH}" == "1" ]] || return 0

  if command -v open >/dev/null 2>&1; then
    open "${PUBLIC_URL}?t=${DEPLOY_VERSION}" >/dev/null 2>&1 || true
  fi
}

print_summary() {
  info ""
  info "========== DEPLOY SUMMARY =========="
  info "Source repo   : ${SOURCE_REPO_DIR}"
  info "Source branch : $(source_branch)"
  info "Source commit : $(source_sha)"
  info "Legacy repo   : ${LEGACY_REPO_DIR}"
  info "Legacy branch : ${LEGACY_BRANCH}"
  info "Deploy ver    : ${DEPLOY_VERSION}"
  if [[ -n "${LEGACY_TAG}" ]]; then
    info "Backup tag    : ${LEGACY_TAG}"
  fi
  info "Public URL    : ${PUBLIC_URL}"
  info "===================================="
  info ""
}

main() {
  parse_args "$@"

  require_cmd git
  require_cmd rsync
  require_cmd python3
  require_cmd curl

  ensure_source_repo
  read_manifest

  info "=== Шаг 1. Основной репозиторий ==="
  ensure_source_branch_syncable
  auto_commit_source_if_needed
  run_verify
  push_source_branch

  info ""
  info "=== Шаг 2. Stage-сборка ==="
  stage_payload
  validate_stage_minimum
  apply_cache_bust
  validate_html_local_refs
  smoke_test_stage

  info ""
  info "=== Шаг 3. Legacy-репозиторий ==="
  ensure_legacy_repo
  sync_stage_to_legacy
  commit_and_push_legacy

  info ""
  info "=== Шаг 4. Проверка публикации ==="
  wait_for_public_site || true
  open_public_site_if_needed

  print_summary
  info "Готово."
}

main "$@"