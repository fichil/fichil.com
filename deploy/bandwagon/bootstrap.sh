#!/usr/bin/env bash
set -Eeuo pipefail

HUGO_VERSION="0.160.1"
HUGO_ARCHIVE="hugo_extended_${HUGO_VERSION}_linux-amd64.tar.gz"
HUGO_SHA256="133adf4932c1b626b6fe6aa28d56791555abe3ceff167e03be534e8324c9ed39"
HUGO_URL="https://github.com/gohugoio/hugo/releases/download/v${HUGO_VERSION}/${HUGO_ARCHIVE}"
MIRROR_USER="fichil-mirror"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

[[ "${EUID:-$(id -u)}" -eq 0 ]] || {
  printf 'bootstrap.sh must run as root.\n' >&2
  exit 1
}

for file in mirror-update.sh mirrorctl.sh nginx.conf fichil-mirror-update.service fichil-mirror-update.timer; do
  [[ -f "$SCRIPT_DIR/$file" ]] || {
    printf 'Missing deployment asset: %s\n' "$file" >&2
    exit 1
  }
done

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends ca-certificates curl git jq nginx openssl xz-utils

if ! command -v hugo >/dev/null 2>&1 || ! hugo version | grep -Fq "v${HUGO_VERSION}"; then
  temp_dir="$(mktemp -d)"
  trap 'rm -rf -- "$temp_dir"' EXIT
  curl -fsSL "$HUGO_URL" -o "$temp_dir/$HUGO_ARCHIVE"
  printf '%s  %s\n' "$HUGO_SHA256" "$temp_dir/$HUGO_ARCHIVE" | sha256sum -c -
  tar -xzf "$temp_dir/$HUGO_ARCHIVE" -C "$temp_dir" hugo
  install -m 0755 "$temp_dir/hugo" /usr/local/bin/hugo
fi

if ! id "$MIRROR_USER" >/dev/null 2>&1; then
  useradd --system --home-dir /var/lib/fichil-mirror --create-home --gid www-data --shell /usr/sbin/nologin "$MIRROR_USER"
fi

install -d -o "$MIRROR_USER" -g www-data -m 0755 /opt/fichil-mirror /srv/www/fichil /srv/www/fichil/releases /var/lib/fichil-mirror
install -m 0755 "$SCRIPT_DIR/mirror-update.sh" /usr/local/sbin/fichil-mirror-update
install -m 0755 "$SCRIPT_DIR/mirrorctl.sh" /usr/local/sbin/fichil-mirrorctl
install -m 0644 "$SCRIPT_DIR/fichil-mirror-update.service" /etc/systemd/system/fichil-mirror-update.service
install -m 0644 "$SCRIPT_DIR/fichil-mirror-update.timer" /etc/systemd/system/fichil-mirror-update.timer

if [[ ! -f /etc/default/fichil-mirror ]]; then
  install -m 0644 /dev/null /etc/default/fichil-mirror
  printf '%s\n' \
    'MIRROR_PRIMARY_HOST=fichil.com' \
    'MIRROR_SITES_ORIGIN_IPS=162.159.143.30 172.66.3.26' \
    'MIRROR_KEEP_RELEASES=3' \
    > /etc/default/fichil-mirror
fi

systemctl daemon-reload
runuser -u "$MIRROR_USER" -- bash -c 'cd /var/lib/fichil-mirror && MIRROR_SKIP_HTTP_SMOKE=1 /usr/local/sbin/fichil-mirror-update'

[[ -s /etc/letsencrypt/live/fichil.com/fullchain.pem && -s /etc/letsencrypt/live/fichil.com/privkey.pem ]] || {
  printf 'Existing fichil.com certificate was not found; refusing to replace Nginx configuration.\n' >&2
  exit 1
}

backup_dir="/var/backups/fichil-mirror/$(date -u +%Y%m%dT%H%M%SZ)"
install -d -m 0700 "$backup_dir"
for path in /etc/nginx/sites-available/fichil.com /etc/nginx/sites-available/fichil-mirror; do
  [[ -f "$path" ]] && cp -a "$path" "$backup_dir/"
done

install -m 0644 "$SCRIPT_DIR/nginx.conf" /etc/nginx/sites-available/fichil-mirror
ln -sfn /etc/nginx/sites-available/fichil-mirror /etc/nginx/sites-enabled/fichil-mirror
rm -f /etc/nginx/sites-enabled/fichil.com
nginx -t
systemctl reload nginx

for path in / /zh-cn/ /blog/ /zh-cn/blog/ /version.json; do
  curl -fsS --connect-timeout 3 --max-time 10 \
    --resolve "fichil.com:443:127.0.0.1" \
    "https://fichil.com${path}" >/dev/null
done

if ufw status | grep -Fq 'Status: active'; then
  ufw allow 80/tcp
  ufw allow 443/tcp
fi

systemctl enable --now fichil-mirror-update.timer
/usr/local/sbin/fichil-mirrorctl status
