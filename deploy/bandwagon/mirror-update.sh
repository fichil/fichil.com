#!/usr/bin/env bash
set -Eeuo pipefail

umask 022

REPOSITORY_URL="${MIRROR_REPOSITORY_URL:-https://github.com/fichil/fichil.com.git}"
GITHUB_REPOSITORY="${MIRROR_GITHUB_REPOSITORY:-fichil/fichil.com}"
WORKFLOW_FILE="${MIRROR_WORKFLOW_FILE:-hugo-check.yml}"
PRIMARY_HOST="${MIRROR_PRIMARY_HOST:-fichil.com}"
SITES_ORIGIN_IPS="${MIRROR_SITES_ORIGIN_IPS:-162.159.143.30 172.66.3.26}"
SOURCE_DIR="${MIRROR_SOURCE_DIR:-/opt/fichil-mirror/source}"
WEB_ROOT="${MIRROR_WEB_ROOT:-/srv/www/fichil}"
RELEASES_DIR="${MIRROR_RELEASES_DIR:-${WEB_ROOT}/releases}"
CURRENT_LINK="${MIRROR_CURRENT_LINK:-${WEB_ROOT}/current}"
STATE_DIR="${MIRROR_STATE_DIR:-/var/lib/fichil-mirror}"
HOLD_FILE="${MIRROR_HOLD_FILE:-${STATE_DIR}/hold}"
LOCK_FILE="${MIRROR_LOCK_FILE:-${STATE_DIR}/update.lock}"
KEEP_RELEASES="${MIRROR_KEEP_RELEASES:-3}"
SKIP_HTTP_SMOKE="${MIRROR_SKIP_HTTP_SMOKE:-0}"
BUILD_ROOT=""
STAGING=""

log() {
  printf '[fichil-mirror] %s\n' "$*"
}

die() {
  log "ERROR: $*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "required command is missing: $1"
}

is_sha() {
  [[ "$1" =~ ^[0-9a-f]{40}$ ]]
}

safe_remove_dir() {
  local target resolved_root resolved_target
  target="$1"
  resolved_root="$(realpath -m "$RELEASES_DIR")"
  resolved_target="$(realpath -m "$target")"
  case "$resolved_target" in
    "$resolved_root"/*) rm -rf -- "$resolved_target" ;;
    *) die "refusing to remove path outside release root: $resolved_target" ;;
  esac
}

fetch_primary_version() {
  local response ip probe_url
  probe_url="https://${PRIMARY_HOST}/version.json?mirror_probe=$(date +%s)"

  for ip in $SITES_ORIGIN_IPS; do
    if response="$(curl -fsS --connect-timeout 5 --max-time 15 \
      --resolve "${PRIMARY_HOST}:443:${ip}" \
      -H 'cache-control: no-cache' "$probe_url" 2>/dev/null)"; then
      if printf '%s' "$response" | jq -e '.commit | strings | test("^[0-9a-f]{40}$")' >/dev/null; then
        printf '%s' "$response"
        return 0
      fi
    fi
  done

  response="$(curl -fsS --connect-timeout 5 --max-time 15 \
    -H 'cache-control: no-cache' "$probe_url")"
  printf '%s' "$response" | jq -e '.commit | strings | test("^[0-9a-f]{40}$")' >/dev/null \
    || die "primary /version.json did not contain a full commit SHA"
  printf '%s' "$response"
}

require_successful_gate() {
  local sha api_url response
  sha="$1"
  api_url="https://api.github.com/repos/${GITHUB_REPOSITORY}/actions/workflows/${WORKFLOW_FILE}/runs?branch=main&event=push&head_sha=${sha}&per_page=10"
  response="$(curl -fsS --connect-timeout 5 --max-time 20 \
    -H 'Accept: application/vnd.github+json' \
    -H 'X-GitHub-Api-Version: 2022-11-28' \
    -H 'User-Agent: fichil-bandwagon-mirror' \
    "$api_url")"

  printf '%s' "$response" | jq -e --arg sha "$sha" '
    .workflow_runs
    | any(
        .head_sha == $sha
        and .name == "Site Build Check"
        and .event == "push"
        and .status == "completed"
        and .conclusion == "success"
      )
  ' >/dev/null || die "Site Build Check is not successful for $sha"
}

file_smoke() {
  local root relative
  root="$1"
  for relative in \
    index.html \
    zh-cn/index.html \
    blog/index.html \
    zh-cn/blog/index.html \
    blog/index.xml \
    zh-cn/blog/index.xml \
    sitemap.xml \
    zh-cn/sitemap.xml \
    version.json; do
    [[ -s "$root/$relative" ]] || die "release is missing $relative"
  done
}

http_smoke() {
  local path
  for path in \
    / \
    /zh-cn/ \
    /blog/ \
    /zh-cn/blog/ \
    /blog/index.xml \
    /zh-cn/blog/index.xml \
    /sitemap.xml \
    /zh-cn/sitemap.xml \
    /version.json; do
    curl -fsS --connect-timeout 3 --max-time 10 \
      --resolve "${PRIMARY_HOST}:443:127.0.0.1" \
      "https://${PRIMARY_HOST}${path}" >/dev/null \
      || return 1
  done
}

activate_release() {
  local release previous next_link
  release="$1"
  previous=""
  if [[ -L "$CURRENT_LINK" ]]; then
    previous="$(readlink -f "$CURRENT_LINK" || true)"
  fi

  next_link="${WEB_ROOT}/.current.$$.new"
  rm -f -- "$next_link"
  ln -s "$release" "$next_link"
  mv -Tf "$next_link" "$CURRENT_LINK"

  if [[ "$SKIP_HTTP_SMOKE" != "1" ]] && ! http_smoke; then
    log "HTTP smoke check failed after activation"
    if [[ -n "$previous" && -d "$previous" ]]; then
      ln -s "$previous" "$next_link"
      mv -Tf "$next_link" "$CURRENT_LINK"
      log "restored previous release $(basename "$previous")"
    fi
    return 1
  fi
}

prune_releases() {
  local current_real keep_other path
  local -a releases
  current_real="$(readlink -f "$CURRENT_LINK")"
  keep_other=$(( KEEP_RELEASES > 0 ? KEEP_RELEASES - 1 : 0 ))

  mapfile -t releases < <(
    find "$RELEASES_DIR" -mindepth 1 -maxdepth 1 -type d \
      -regextype posix-extended -regex '.*/[0-9a-f]{40}' \
      -printf '%T@ %p\n' | sort -nr | cut -d' ' -f2-
  )

  for path in "${releases[@]}"; do
    if [[ "$(realpath -m "$path")" == "$current_real" ]]; then
      continue
    fi
    if (( keep_other > 0 )); then
      keep_other=$((keep_other - 1))
      continue
    fi
    safe_remove_dir "$path"
  done
}

cleanup() {
  if [[ -n "$BUILD_ROOT" ]]; then
    git -C "$SOURCE_DIR" worktree remove --force "$BUILD_ROOT/source" >/dev/null 2>&1 || true
    rm -rf -- "$BUILD_ROOT"
  fi
  if [[ -n "$STAGING" && -d "$STAGING" ]]; then
    safe_remove_dir "$STAGING"
  fi
}

main() {
  local primary_version target_sha current_sha target_release built_at

  for command_name in curl git hugo jq realpath flock; do
    require_command "$command_name"
  done

  mkdir -p "$SOURCE_DIR" "$RELEASES_DIR" "$STATE_DIR"
  exec 9>"$LOCK_FILE"
  flock -n 9 || die "another mirror update is already running"

  if [[ -e "$HOLD_FILE" ]]; then
    log "updates are held by $HOLD_FILE"
    exit 0
  fi

  primary_version="$(fetch_primary_version)"
  target_sha="$(printf '%s' "$primary_version" | jq -r '.commit')"
  is_sha "$target_sha" || die "invalid target SHA from primary: $target_sha"

  current_sha=""
  if [[ -s "$CURRENT_LINK/version.json" ]]; then
    current_sha="$(jq -r '.commit // empty' "$CURRENT_LINK/version.json" 2>/dev/null || true)"
  fi
  if [[ "$current_sha" == "$target_sha" ]]; then
    log "mirror already matches live Sites commit $target_sha"
    exit 0
  fi

  require_successful_gate "$target_sha"

  if [[ ! -d "$SOURCE_DIR/.git" ]]; then
    rmdir "$SOURCE_DIR" 2>/dev/null || true
    git clone --filter=blob:none --no-checkout "$REPOSITORY_URL" "$SOURCE_DIR"
  fi
  git -C "$SOURCE_DIR" remote set-url origin "$REPOSITORY_URL"
  git -C "$SOURCE_DIR" fetch --prune origin main
  git -C "$SOURCE_DIR" cat-file -e "${target_sha}^{commit}"
  git -C "$SOURCE_DIR" merge-base --is-ancestor "$target_sha" origin/main \
    || die "live Sites commit $target_sha is not contained in origin/main"

  target_release="${RELEASES_DIR}/${target_sha}"
  if [[ -f "$target_release/.release-complete" ]]; then
    file_smoke "$target_release"
    activate_release "$target_release"
    prune_releases
    log "reactivated verified release $target_sha"
    exit 0
  fi
  if [[ -e "$target_release" ]]; then
    safe_remove_dir "$target_release"
  fi

  BUILD_ROOT="$(mktemp -d "${STATE_DIR}/build.XXXXXX")"
  STAGING="${RELEASES_DIR}/.staging.${target_sha}.$$"
  trap cleanup EXIT

  git -C "$SOURCE_DIR" worktree add --detach "$BUILD_ROOT/source" "$target_sha"
  git -C "$BUILD_ROOT/source" submodule sync --recursive
  git -C "$BUILD_ROOT/source" submodule update --init --recursive --checkout
  git -C "$BUILD_ROOT/source" submodule status --recursive \
    | grep -Eq '^[+-U]' \
    && die "submodule state is incomplete or mismatched"
  [[ -f "$BUILD_ROOT/source/themes/hugo-profile/layouts/partials/head/extensions.html" ]] \
    || die "required Hugo theme partial is missing"

  mkdir -p "$STAGING" "${STATE_DIR}/hugo-cache"
  HUGO_CACHEDIR="${STATE_DIR}/hugo-cache" \
    hugo --source "$BUILD_ROOT/source" --minify --cleanDestinationDir --destination "$STAGING"
  built_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf '{"commit":"%s","builtAt":"%s"}\n' "$target_sha" "$built_at" > "$STAGING/version.json"
  printf '%s\n' "$target_sha" > "$STAGING/.release-complete"
  file_smoke "$STAGING"

  mv "$STAGING" "$target_release"
  STAGING=""
  activate_release "$target_release"
  prune_releases
  log "activated mirror release $target_sha"
}

main "$@"
