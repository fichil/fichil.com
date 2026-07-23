#!/usr/bin/env bash
set -Eeuo pipefail

DOMAIN="${MIRROR_DOMAIN:-fichil.com}"
BANDWAGON_IPV4="${MIRROR_BANDWAGON_IPV4:-104.244.94.201}"
SITES_IPV4_1="${MIRROR_SITES_IPV4_1:-162.159.143.30}"
SITES_IPV4_2="${MIRROR_SITES_IPV4_2:-172.66.3.26}"
SITES_CNAME="${MIRROR_SITES_CNAME:-custom-domains.chatgpt.site.}"
HOSTED_ZONE_ID="${MIRROR_HOSTED_ZONE_ID:-}"
MODE="plan"

if [[ "${1:-}" == "--apply" ]]; then
  MODE="apply"
elif [[ "${1:-}" == "--stage-cn" ]]; then
  MODE="stage-cn"
elif [[ -n "${1:-}" ]]; then
  printf 'Usage: MIRROR_HOSTED_ZONE_ID=... %s [--stage-cn|--apply]\n' "$0" >&2
  exit 2
fi

command -v aws >/dev/null 2>&1 || {
  printf 'AWS CLI is required.\n' >&2
  exit 1
}
command -v jq >/dev/null 2>&1 || {
  printf 'jq is required.\n' >&2
  exit 1
}
[[ -n "$HOSTED_ZONE_ID" ]] || {
  printf 'MIRROR_HOSTED_ZONE_ID is required.\n' >&2
  exit 1
}

if [[ "$MODE" == "stage-cn" ]]; then
  stage_batch="$(jq -cn \
    --arg cn "cn.${DOMAIN}." \
    --arg bw "$BANDWAGON_IPV4" \
    '{
      Comment: "Stage the explicit Bandwagon mirror hostname before certificate issuance",
      Changes: [{
        Action: "UPSERT",
        ResourceRecordSet: {
          Name: $cn,
          Type: "A",
          TTL: 60,
          ResourceRecords: [{Value: $bw}]
        }
      }]
    }'
  )"
  aws route53 change-resource-record-sets \
    --hosted-zone-id "$HOSTED_ZONE_ID" \
    --change-batch "$stage_batch"
  exit 0
fi

if [[ "$MODE" == "apply" && "${MIRROR_CHINA_PROBE_APPROVED:-}" != "YES" ]]; then
  printf 'Set MIRROR_CHINA_PROBE_APPROVED=YES only after direct HTTPS probes from mainland China succeed.\n' >&2
  exit 1
fi

health_check_id="$(
  aws route53 list-health-checks --output json \
    | jq -r '.HealthChecks[] | select(.CallerReference == "fichil-cn-bandwagon-v1") | .Id' \
    | head -n 1
)"

if [[ -z "$health_check_id" ]]; then
  health_config="$(jq -cn \
    --arg ip "$BANDWAGON_IPV4" \
    --arg host "cn.${DOMAIN}" \
    '{
      IPAddress: $ip,
      Port: 443,
      Type: "HTTPS_STR_MATCH",
      ResourcePath: "/version.json",
      FullyQualifiedDomainName: $host,
      SearchString: "commit",
      RequestInterval: 30,
      FailureThreshold: 3,
      EnableSNI: true
    }'
  )"
  if [[ "$MODE" == "plan" ]]; then
    printf 'PLAN create health check for cn.%s (%s)\n' "$DOMAIN" "$BANDWAGON_IPV4"
    health_check_id="HEALTH_CHECK_ID"
  else
    health_check_id="$(aws route53 create-health-check \
      --caller-reference 'fichil-cn-bandwagon-v1' \
      --health-check-config "$health_config" \
      --query 'HealthCheck.Id' --output text)"
  fi
fi

if [[ "$MODE" == "apply" ]]; then
  healthy=0
  for _attempt in 1 2 3 4 5 6; do
    health_status="$(aws route53 get-health-check-status --health-check-id "$health_check_id" --output json)"
    success_count="$(printf '%s' "$health_status" | jq '[.HealthCheckObservations[] | select(.StatusReport.Status | startswith("Success"))] | length')"
    if (( success_count >= 3 )); then
      healthy=1
      break
    fi
    sleep 10
  done
  (( healthy == 1 )) || {
    printf 'Route 53 health check %s is not healthy; geolocation records were not changed.\n' "$health_check_id" >&2
    exit 1
  }
fi

current_records="$(aws route53 list-resource-record-sets --hosted-zone-id "$HOSTED_ZONE_ID" --output json)"
delete_changes="$(printf '%s' "$current_records" | jq -c \
  --arg domain "${DOMAIN}." \
  --arg www "www.${DOMAIN}." '
    [
      .ResourceRecordSets[]
      | select(
          ((.Name == $domain and .Type == "A") or (.Name == $www and .Type == "CNAME"))
          and (has("SetIdentifier") | not)
        )
      | {Action: "DELETE", ResourceRecordSet: .}
    ]
  '
)"

change_batch="$(jq -cn \
  --arg domain "${DOMAIN}." \
  --arg cn "cn.${DOMAIN}." \
  --arg sites_cname "$SITES_CNAME" \
  --arg bw "$BANDWAGON_IPV4" \
  --arg sites1 "$SITES_IPV4_1" \
  --arg sites2 "$SITES_IPV4_2" \
  --arg health "$health_check_id" \
  --argjson deletes "$delete_changes" \
  '{
    Comment: "Route mainland China to the Bandwagon Hugo mirror; keep Sites as default",
    Changes: ($deletes + [
      {
        Action: "UPSERT",
        ResourceRecordSet: {
          Name: $cn,
          Type: "A",
          TTL: 60,
          ResourceRecords: [{Value: $bw}]
        }
      },
      {
        Action: "UPSERT",
        ResourceRecordSet: {
          Name: $domain,
          Type: "A",
          SetIdentifier: "china-bandwagon",
          GeoLocation: {CountryCode: "CN"},
          TTL: 60,
          ResourceRecords: [{Value: $bw}],
          HealthCheckId: $health
        }
      },
      {
        Action: "UPSERT",
        ResourceRecordSet: {
          Name: $domain,
          Type: "A",
          SetIdentifier: "default-sites",
          GeoLocation: {CountryCode: "*"},
          TTL: 60,
          ResourceRecords: [{Value: $sites1}, {Value: $sites2}]
        }
      },
      {
        Action: "UPSERT",
        ResourceRecordSet: {
          Name: ("www." + $domain),
          Type: "CNAME",
          SetIdentifier: "china-bandwagon",
          GeoLocation: {CountryCode: "CN"},
          TTL: 60,
          ResourceRecords: [{Value: $cn}],
          HealthCheckId: $health
        }
      },
      {
        Action: "UPSERT",
        ResourceRecordSet: {
          Name: ("www." + $domain),
          Type: "CNAME",
          SetIdentifier: "default-sites",
          GeoLocation: {CountryCode: "*"},
          TTL: 60,
          ResourceRecords: [{Value: $sites_cname}]
        }
      }
    ])
  }'
)"

if [[ "$MODE" == "plan" ]]; then
  printf '%s\n' "$change_batch" | jq .
  printf 'DRY RUN ONLY. Re-run with --apply after the Route 53 zone, TLS certificate, and rollback snapshot are verified.\n'
  exit 0
fi

aws route53 change-resource-record-sets \
  --hosted-zone-id "$HOSTED_ZONE_ID" \
  --change-batch "$change_batch"
