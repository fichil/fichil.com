#!/usr/bin/env bash
set -Eeuo pipefail

DOMAIN="${MIRROR_DOMAIN:-fichil.com}"
CERTBOT_EMAIL="${MIRROR_CERTBOT_EMAIL:-fichilzhang@gmail.com}"

[[ "${EUID:-$(id -u)}" -eq 0 ]] || {
  printf 'configure-route53-certificate.sh must run as root.\n' >&2
  exit 1
}

command -v aws >/dev/null 2>&1 || {
  printf 'AWS CLI is required so the Route 53 identity can be verified.\n' >&2
  exit 1
}

aws sts get-caller-identity >/dev/null

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends certbot python3-certbot-dns-route53

certbot certonly \
  --dns-route53 \
  --cert-name "$DOMAIN" \
  --expand \
  --non-interactive \
  --agree-tos \
  --email "$CERTBOT_EMAIL" \
  -d "$DOMAIN" \
  -d "www.${DOMAIN}" \
  -d "cn.${DOMAIN}"

openssl x509 -in "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" -noout -ext subjectAltName \
  | grep -Fq "DNS:cn.${DOMAIN}" || {
    printf 'The renewed certificate does not include cn.%s.\n' "$DOMAIN" >&2
    exit 1
  }

nginx -t
systemctl reload nginx
