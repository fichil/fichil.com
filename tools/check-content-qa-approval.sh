#!/usr/bin/env bash

set -euo pipefail

changed_paths=()
if [[ -n "${CONTENT_QA_CHANGED_PATHS:-}" ]]; then
  mapfile -t changed_paths <<< "$CONTENT_QA_CHANGED_PATHS"
elif [[ -n "${CONTENT_QA_CHANGED_PATHS_FILE:-}" ]]; then
  if [[ ! -f "$CONTENT_QA_CHANGED_PATHS_FILE" ]]; then
    echo "Content QA changed-paths fixture does not exist: $CONTENT_QA_CHANGED_PATHS_FILE" >&2
    exit 1
  fi
  mapfile -t changed_paths < <(sed '/^[[:space:]]*$/d' "$CONTENT_QA_CHANGED_PATHS_FILE")
else
  base_sha="${CONTENT_QA_BASE_SHA:-}"
  if [[ -z "$base_sha" ]]; then
    echo "CONTENT_QA_BASE_SHA is required when changed paths are not supplied." >&2
    exit 1
  fi
  if ! git cat-file -e "${base_sha}^{commit}" 2>/dev/null; then
    echo "Pull request base commit is unavailable: $base_sha" >&2
    exit 1
  fi
  mapfile -t changed_paths < <(git diff --name-only --diff-filter=ACMRD "${base_sha}...HEAD")
fi

requires_review=false
for raw_path in "${changed_paths[@]}"; do
  path="${raw_path%$'\r'}"
  if [[ "$path" == content/* || "$path" == "hugo.yaml" ]]; then
    requires_review=true
    break
  fi
done

if [[ "$requires_review" != "true" ]]; then
  echo "No public content paths changed; content QA approval is not required."
  exit 0
fi

draft="${CONTENT_QA_PR_DRAFT:-false}"
if [[ "${draft,,}" == "true" ]]; then
  echo "Public content changed, but the pull request is still Draft; QA approval will be enforced when it becomes Ready."
  exit 0
fi

head_sha="${CONTENT_QA_HEAD_SHA:-}"
if [[ ! "$head_sha" =~ ^[0-9a-f]{40}$ ]]; then
  echo "CONTENT_QA_HEAD_SHA must be the current 40-character lowercase pull request head SHA." >&2
  exit 1
fi

body="${CONTENT_QA_PR_BODY:-}"
marker_prefix='<!-- fichil-content-qa-approval:v1 '
marker_count="$(grep -oF "$marker_prefix" <<< "$body" | wc -l | tr -d '[:space:]')"
if [[ "$marker_count" != "1" ]]; then
  echo "Ready public-content PRs require exactly one fichil-content-qa approval marker; found $marker_count." >&2
  exit 1
fi

marker_re='<!-- fichil-content-qa-approval:v1 status=approved head_sha=([0-9a-f]{40}) content_sha256=([0-9a-f]{64}) qa_report_sha256=([0-9a-f]{64}) -->'
if [[ ! "$body" =~ $marker_re ]]; then
  echo "The fichil-content-qa approval marker is malformed or incomplete." >&2
  exit 1
fi

approved_head_sha="${BASH_REMATCH[1]}"
if [[ "$approved_head_sha" != "$head_sha" ]]; then
  echo "Content QA approval is stale: approved $approved_head_sha, current head is $head_sha." >&2
  exit 1
fi

echo "Validated content QA approval for current PR head $head_sha."
