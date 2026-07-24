#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../.." && pwd)"
DEPLOY_DIR="$ROOT_DIR/deploy/bandwagon"

for script in bootstrap.sh configure-route53-certificate.sh mirror-update.sh mirrorctl.sh route53-geolocation.sh; do
  bash -n "$DEPLOY_DIR/$script"
done

grep -Fq 'MIRROR_SKIP_HTTP_SMOKE=1' "$DEPLOY_DIR/bootstrap.sh"
grep -Fq 'Site Build Check' "$DEPLOY_DIR/mirror-update.sh"
grep -Fq 'merge-base --is-ancestor' "$DEPLOY_DIR/mirror-update.sh"
grep -Fq 'version.json' "$DEPLOY_DIR/mirror-update.sh"
grep -Fq 'GeoLocation: {CountryCode: "CN"}' "$DEPLOY_DIR/route53-geolocation.sh"
grep -Fq 'GeoLocation: {CountryCode: "*"}' "$DEPLOY_DIR/route53-geolocation.sh"
grep -Fq 'Action: "DELETE"' "$DEPLOY_DIR/route53-geolocation.sh"
grep -Fq 'MIRROR_CHINA_PROBE_APPROVED=YES' "$DEPLOY_DIR/route53-geolocation.sh"
grep -Fq -- '--stage-cn' "$DEPLOY_DIR/route53-geolocation.sh"
grep -Fq 'root /srv/www/fichil/current;' "$DEPLOY_DIR/nginx.conf"
grep -Fq 'REPLACE_HOSTED_ZONE_ID' "$DEPLOY_DIR/route53-certbot-policy.template.json"

if grep -RniE --exclude='run.sh' '(BEGIN (RSA|OPENSSH|EC) PRIVATE KEY|aws_secret_access_key|sk-[A-Za-z0-9_-]{20,})' "$DEPLOY_DIR"; then
  printf 'Deployment assets contain credential-like material.\n' >&2
  exit 1
fi

printf 'Bandwagon mirror deployment checks passed.\n'
