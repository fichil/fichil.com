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
- The scheduled publisher may deploy only after `Site Build Check` succeeds for the exact `main` SHA.
- After deployment, verify `/version.json` and the canonical English and Chinese routes. Roll back to the previously known-good Sites version if production smoke checks fail.
- Do not change Sites access, custom-domain DNS, or theme submodules unless explicitly requested.
