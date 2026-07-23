#!/usr/bin/env bash

set -euo pipefail

marker="${BLOG_AUTOMATION_MARKER:-false}"
if [[ "${marker,,}" != "true" ]]; then
  echo "Automated chatgpt PRs must include <!-- codex-workday-bilingual-blog --> in the PR body." >&2
  exit 1
fi

changed_paths=()
if [[ -n "${BLOG_CHANGED_PATHS:-}" ]]; then
  mapfile -t changed_paths <<< "$BLOG_CHANGED_PATHS"
elif [[ -n "${BLOG_CHANGED_PATHS_FILE:-}" ]]; then
  if [[ ! -f "$BLOG_CHANGED_PATHS_FILE" ]]; then
    echo "Changed-paths fixture does not exist: $BLOG_CHANGED_PATHS_FILE" >&2
    exit 1
  fi
  mapfile -t changed_paths < <(sed '/^[[:space:]]*$/d' "$BLOG_CHANGED_PATHS_FILE")
else
  base_sha="${BLOG_PR_BASE_SHA:-}"
  if [[ -z "$base_sha" ]]; then
    echo "BLOG_PR_BASE_SHA is required when BLOG_CHANGED_PATHS_FILE is not set." >&2
    exit 1
  fi
  if ! git cat-file -e "${base_sha}^{commit}" 2>/dev/null; then
    echo "Pull request base commit is unavailable: $base_sha" >&2
    exit 1
  fi
  mapfile -t changed_paths < <(git diff --name-only --diff-filter=ACMRD "${base_sha}...HEAD")
fi

if [[ ${#changed_paths[@]} -eq 0 ]]; then
  echo "Automated blog pull requests must contain at least one changed article pair." >&2
  exit 1
fi

declare -A english_slugs=()
declare -A chinese_slugs=()

for raw_path in "${changed_paths[@]}"; do
  path="${raw_path%$'\r'}"
  if [[ ! "$path" =~ ^content/(en|zh-cn)/blog/([a-z0-9]+(-[a-z0-9]+)*)/index\.md$ ]]; then
    echo "Out-of-scope path in automated blog pull request: $path" >&2
    exit 1
  fi

  locale="${BASH_REMATCH[1]}"
  slug="${BASH_REMATCH[2]}"
  if [[ "$locale" == "en" ]]; then
    english_slugs["$slug"]=1
  else
    chinese_slugs["$slug"]=1
  fi
done

for slug in "${!english_slugs[@]}"; do
  if [[ -z "${chinese_slugs[$slug]:-}" ]]; then
    echo "Missing Chinese counterpart for slug: $slug" >&2
    exit 1
  fi
done

for slug in "${!chinese_slugs[@]}"; do
  if [[ -z "${english_slugs[$slug]:-}" ]]; then
    echo "Missing English counterpart for slug: $slug" >&2
    exit 1
  fi
done

echo "Validated ${#changed_paths[@]} article path(s) across ${#english_slugs[@]} bilingual slug(s)."
