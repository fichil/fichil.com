# AGENTS.md

## Project Overview

This repository contains the source code for fichil.com, a Hugo-based personal technical blog.

## Stack

- Hugo
- Markdown
- Nginx
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

## Rules

- Do not commit secrets.
- Do not commit generated `public/` files.
- Do not change theme submodules unless explicitly required.
- Keep commits small and focused.
- Prefer Markdown content changes over theme-level changes.
- Before changing navigation or multilingual paths, check `hugo.yaml`.
- Chinese content should usually go under `content/zh-cn/`.
- English content should usually go under `content/`.