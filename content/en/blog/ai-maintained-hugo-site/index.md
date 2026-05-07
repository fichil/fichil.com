---
title: "Using AI to Maintain a Hugo Personal Site: From Open Source to Auto Deployment"
date: 2026-05-07
draft: false
tags: ["hugo", "github", "github-actions", "ai"]
categories: ["AI Workflow"]
---

I am moving `fichil.com` into a workflow where the website source code is open, changes are reviewed through Pull Requests, and deployment is handled by GitHub Actions after merge.

This post records the workflow I am using now. It is not a complex platform design. It is a practical setup for maintaining a personal Hugo site with AI assistance while keeping final control in my own hands.

## Current setup

The site uses a simple stack:

- Hugo builds the static site.
- `hugo-profile` is used as the theme.
- GitHub stores the source code.
- GitHub Issues record each change request.
- ChatGPT works on the `chatgpt` branch.
- Pull Requests are reviewed before merge.
- GitHub Actions deploys the site after `main` is updated.

The repository is:

```text
https://github.com/fichil/fichil.com.git
```

The production site is:

```text
https://fichil.com/
```

## Why I changed the workflow

At the beginning, the site was just a local Hugo project. That was enough for writing a few pages, but it was not enough once I wanted AI to help maintain it.

The problems were clear:

- I had to remember where the local project was stored.
- Changes were easy to make but hard to review.
- Chinese and English pages could become inconsistent.
- Broken links or missing images might not be noticed immediately.
- Direct changes to production were too risky.

So I moved the website source code into GitHub and made the maintenance process more explicit.

## Branch rules

The branch split is simple:

```text
main      production branch
chatgpt   AI change branch
```

The `main` branch is not changed directly by AI.

For every change, ChatGPT should work on the `chatgpt` branch and create a Pull Request into `main`. I review the PR before merging. After the merge, GitHub Actions handles deployment.

This gives me a clear review point before any content or configuration reaches the live site.

## Issue-first maintenance

Every change starts with a GitHub Issue.

The Issue should explain:

- what needs to be changed;
- which files or pages may be affected;
- how the result should be checked.

This is useful because many website tasks sound small but touch multiple places. For example, changing one blog link may require checking English navigation, Chinese navigation, homepage cards, and blog list pages.

The Issue is the task record. The PR is the actual change.

## Bilingual content rule

The site uses separate content directories:

```text
content/en/
content/zh-cn/
```

English blog pages use:

```text
/blog/
```

Chinese blog pages use:

```text
/zh-cn/blog/
```

If a blog post exists in both languages, I want the meaning to stay aligned. The wording does not need to be a sentence-by-sentence translation, but the title, key points, workflow, and conclusion should match.

This rule is important because the site is not just a Chinese blog with some copied English pages. Both versions should describe the same work.

## What AI can change

AI can help with content and routine maintenance:

- update blog posts;
- fix broken internal links;
- keep English and Chinese pages aligned;
- adjust Hugo configuration when needed;
- prepare PR descriptions;
- check whether changed paths are reasonable.

But there are hard boundaries:

- do not commit `public/` build output;
- do not modify `themes/` unless I explicitly ask;
- do not commit secrets, SSH keys, tokens, or passwords;
- do not push directly to `main`;
- do not change GitHub Actions deployment logic unless the task is about deployment.

These rules keep the site easy to repair when something goes wrong.

## Current working process

The workflow I expect is:

1. I describe the change I want.
2. ChatGPT creates a GitHub Issue.
3. ChatGPT modifies files on `chatgpt`.
4. ChatGPT opens a Pull Request to `main`.
5. I review the diff.
6. I merge the PR manually.
7. GitHub Actions deploys the site.
8. I check the live page.

This is enough for my current site. It gives me automation without removing review.

## Why this fits a personal website

A personal website does not need a heavy release process. But it still needs basic discipline.

For me, the key point is traceability. When something breaks, I need to know which request caused it, what files changed, and whether the change came from me or AI.

With Issue plus PR, the answer is visible in GitHub.

## What I will improve next

The next improvements are practical:

- keep old `content/blog/` paths out of the project;
- check all menu links from both homepage and blog pages;
- make sure English Blog links do not open Chinese pages;
- keep post pairs consistent between English and Chinese;
- replace missing images with simple local SVG assets;
- keep article wording closer to real engineering notes.

The goal is not to make the site look complicated. The goal is to make it easier to maintain and harder to break.
