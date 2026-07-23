#!/usr/bin/env bash
set -Eeuo pipefail

WEB_ROOT="${MIRROR_WEB_ROOT:-/srv/www/fichil}"
RELEASES_DIR="${MIRROR_RELEASES_DIR:-${WEB_ROOT}/releases}"
CURRENT_LINK="${MIRROR_CURRENT_LINK:-${WEB_ROOT}/current}"
STATE_DIR="${MIRROR_STATE_DIR:-/var/lib/fichil-mirror}"
HOLD_FILE="${MIRROR_HOLD_FILE:-${STATE_DIR}/hold}"
PRIMARY_HOST="${MIRROR_PRIMARY_HOST:-fichil.com}"

usage() {
  printf 'Usage: %s {status|list|hold|resume|rollback <sha>|update}\n' "$0" >&2
  exit 2
}

require_root() {
  [[ "${EUID:-$(id -u)}" -eq 0 ]] || {
    printf 'This command requires root.\n' >&2
    exit 1
  }
}

smoke() {
  curl -fsS --connect-timeout 3 --max-time 10 \
    --resolve "${PRIMARY_HOST}:443:127.0.0.1" \
    "https://${PRIMARY_HOST}/version.json" >/dev/null
}

atomic_link() {
  local release next_link
  release="$1"
  next_link="${WEB_ROOT}/.current.$$.new"
  rm -f -- "$next_link"
  ln -s "$release" "$next_link"
  mv -Tf "$next_link" "$CURRENT_LINK"
}

command_name="${1:-}"
case "$command_name" in
  status)
    printf 'timer='; systemctl is-active fichil-mirror-update.timer 2>/dev/null || true
    printf 'service='; systemctl is-active fichil-mirror-update.service 2>/dev/null || true
    if [[ -e "$HOLD_FILE" ]]; then
      printf 'hold=yes\n'
      sed -n '1,2p' "$HOLD_FILE"
    else
      printf 'hold=no\n'
    fi
    if [[ -s "$CURRENT_LINK/version.json" ]]; then
      printf 'current='; cat "$CURRENT_LINK/version.json"
    else
      printf 'current=missing\n'
    fi
    ;;
  list)
    find "$RELEASES_DIR" -mindepth 1 -maxdepth 1 -type d \
      -regextype posix-extended -regex '.*/[0-9a-f]{40}' \
      -printf '%TY-%Tm-%TdT%TH:%TM:%TSZ %f\n' | sort -r
    ;;
  hold)
    require_root
    mkdir -p "$STATE_DIR"
    printf 'held_at=%s\nreason=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${2:-manual hold}" > "$HOLD_FILE"
    printf 'Mirror updates are held.\n'
    ;;
  resume)
    require_root
    rm -f -- "$HOLD_FILE"
    systemctl start fichil-mirror-update.service
    printf 'Mirror updates resumed.\n'
    ;;
  rollback)
    require_root
    sha="${2:-}"
    [[ "$sha" =~ ^[0-9a-f]{40}$ ]] || usage
    release="${RELEASES_DIR}/${sha}"
    [[ -f "$release/.release-complete" && -s "$release/version.json" ]] || {
      printf 'Release is incomplete or missing: %s\n' "$sha" >&2
      exit 1
    }
    previous="$(readlink -f "$CURRENT_LINK" || true)"
    atomic_link "$release"
    if ! smoke; then
      [[ -n "$previous" && -d "$previous" ]] && atomic_link "$previous"
      printf 'Rollback smoke check failed; previous release was restored.\n' >&2
      exit 1
    fi
    mkdir -p "$STATE_DIR"
    printf 'held_at=%s\nreason=rollback to %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$sha" > "$HOLD_FILE"
    printf 'Rolled back to %s and held automatic updates.\n' "$sha"
    ;;
  update)
    require_root
    systemctl start fichil-mirror-update.service
    systemctl --no-pager --full status fichil-mirror-update.service || true
    ;;
  *) usage ;;
esac
