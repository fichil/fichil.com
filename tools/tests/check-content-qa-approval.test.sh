#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
validator="$(cd "$script_dir/.." && pwd)/check-content-qa-approval.sh"
head_sha="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
stale_sha="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
content_hash="$(printf 'c%.0s' {1..64})"
report_hash="$(printf 'd%.0s' {1..64})"
valid_marker="<!-- fichil-content-qa-approval:v1 status=approved head_sha=$head_sha content_sha256=$content_hash qa_report_sha256=$report_hash -->"
stale_marker="<!-- fichil-content-qa-approval:v1 status=approved head_sha=$stale_sha content_sha256=$content_hash qa_report_sha256=$report_hash -->"

expect_success() {
  local label="$1"
  shift
  if ! output="$("$@" 2>&1)"; then
    echo "Expected success: $label" >&2
    echo "$output" >&2
    exit 1
  fi
}

expect_failure() {
  local label="$1"
  shift
  if output="$("$@" 2>&1)"; then
    echo "Expected failure: $label" >&2
    echo "$output" >&2
    exit 1
  fi
}

expect_success "non-content PR" env \
  CONTENT_QA_CHANGED_PATHS='sites/lib/content.ts' \
  CONTENT_QA_PR_DRAFT=false \
  CONTENT_QA_HEAD_SHA="$head_sha" \
  CONTENT_QA_PR_BODY='' \
  bash "$validator"

expect_success "Draft content PR before approval" env \
  CONTENT_QA_CHANGED_PATHS='content/en/blog/example/index.md' \
  CONTENT_QA_PR_DRAFT=true \
  CONTENT_QA_HEAD_SHA="$head_sha" \
  CONTENT_QA_PR_BODY='' \
  bash "$validator"

expect_success "Ready content PR with current approval" env \
  CONTENT_QA_CHANGED_PATHS='content/en/blog/example/index.md' \
  CONTENT_QA_PR_DRAFT=false \
  CONTENT_QA_HEAD_SHA="$head_sha" \
  CONTENT_QA_PR_BODY="$valid_marker" \
  bash "$validator"

expect_failure "Ready content PR without approval" env \
  CONTENT_QA_CHANGED_PATHS='content/en/blog/example/index.md' \
  CONTENT_QA_PR_DRAFT=false \
  CONTENT_QA_HEAD_SHA="$head_sha" \
  CONTENT_QA_PR_BODY='' \
  bash "$validator"

expect_failure "Ready content PR with stale approval" env \
  CONTENT_QA_CHANGED_PATHS='content/zh-cn/blog/example/index.md' \
  CONTENT_QA_PR_DRAFT=false \
  CONTENT_QA_HEAD_SHA="$head_sha" \
  CONTENT_QA_PR_BODY="$stale_marker" \
  bash "$validator"

expect_failure "Ready content PR with duplicate markers" env \
  CONTENT_QA_CHANGED_PATHS='hugo.yaml' \
  CONTENT_QA_PR_DRAFT=false \
  CONTENT_QA_HEAD_SHA="$head_sha" \
  CONTENT_QA_PR_BODY="$valid_marker $valid_marker" \
  bash "$validator"

echo "Content QA approval gate tests passed."
