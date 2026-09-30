# AGENTS.md

## Project Overview

This repository contains the source code for fichil.com. Markdown and Hugo
configuration are the canonical content sources; the production site runs as a
vinext application on ChatGPT Sites.

## Stack

- Hugo
- Markdown
- vinext / React
- ChatGPT Sites
- GitHub

## Main Commands

Run locally:

```bash
hugo server
```

Build production files:

```
hugo --minify
```

Validate the Sites migration:

```bash
cd sites
npm test
```

Run the complete Sites checks:

```bash
cd sites
npm run lint
npm test
```

## Rules

- Do not commit secrets.
- Do not commit generated `public/` files.
- Do not change theme submodules unless explicitly required.
- Keep commits small and focused.
- Prefer Markdown content changes over theme-level changes.
- Before changing navigation or multilingual paths, check `hugo.yaml`.
- Chinese content should usually go under `content/zh-cn/`.
- English content should usually go under `content/en/`.
- Keep `content/en/` and `content/zh-cn/` as the only article sources; do not duplicate posts under `sites/`.
- Keep the Sites project ID only in `sites/.openai/hosting.json` and never commit source write credentials.
- Treat `main` as the only production source. Do not publish an unmerged branch to Sites.
- A Sites version must be built from, pushed from, and saved against the same full Git commit SHA.
- Never persist a Sites source token in a remote URL, Git configuration, file, automation prompt output, or log.
- Keep GitHub Actions credential-free: it validates builds but does not deploy to Sites.
- Keep ChatGPT Sites as the default production runtime. The BandwagonHost Hugo
  mirror is a regional availability path, not an independent content source.
- The BandwagonHost mirror may activate only a commit reported by the live
  Sites `/version.json`, contained in `origin/main`, and covered by a successful
  `Site Build Check` push run for that exact SHA.
- Keep BandwagonHost, Route 53, Certbot, and SSH credentials out of the
  repository, GitHub Actions, Git configuration, remote URLs, and logs.
- Protect `main`: all changes must arrive through a pull request that is current
  with `main` and passes the GitHub Actions `build` and `sites` checks. Do not
  bypass these requirements, including with administrator privileges.
- Review public content with the installed `fichil-content-qa` skill before
  publication. Keep a content pull request in Draft until its QA report is
  `review_ready` and the user explicitly approves the exact current head SHA.
  The PR body may contain the machine-readable approval marker only after that
  approval; any later head change invalidates the marker and requires a full QA
  rerun and new approval.
- Reserve the long-lived `chatgpt` branch for the Friday bilingual blog task.
  Merge only a marked PR whose complete diff contains paired English and Chinese
  blog `index.md` files and no other paths, after fresh QA and explicit user
  approval of the exact current head SHA. Use the normal protected merge API
  with `merge_method=merge` and `expected_head_sha`; never enable native
  auto-merge. Re-read current-main ancestry and successful GitHub Actions app
  15368 `build` and `sites` checks before merging. On rejection or an uncertain
  response, reconcile remote state; restore an unmerged PR to Draft and fully
  revalidate before retry. Head changes require new QA and user approval.
- The cloud runner does not read administration-only protection configuration.
  It preserves existing protection settings and relies on GitHub's normal
  server-enforced merge decision; it must never bypass a rejection. Observable
  check validation does not claim to prove protection configuration equality.
- The scheduled publisher may deploy only after `Site Build Check` succeeds for the exact `main` SHA.
- After deployment, verify `/version.json` and the canonical English and Chinese routes. Roll back to the previously known-good Sites version if production smoke checks fail.
- Do not change Sites access, custom-domain DNS, or theme submodules unless explicitly requested.
- Before changing authoritative DNS or geolocation records, preserve the full
  current zone, verify the mirror over HTTPS, and keep a default Sites record.
