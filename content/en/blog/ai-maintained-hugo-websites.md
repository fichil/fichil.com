---
title: "Maintaining a Hugo Website with AI: From Open Source to Auto Deploy"
date: 2026-05-07
draft: false
description: "How I turned fichil.com into an open-source Hugo repository and prepared it for AI-assisted maintenance and GitHub Actions deployment."
tags:
  - AI
  - Hugo
  - GitHub Actions
  - Open Source
  - DevOps
categories:
  - Engineering
---

## Background

I built fichil.com for a simple reason: I wanted my own technical blog to record development work, deployment notes, troubleshooting steps, and open-source progress.

As the site grew, keeping it only as files on a server was not enough. I needed the source code, content, deployment steps, and change history to be easy to inspect and repeat.

That is why I started turning fichil.com into an open-source Hugo repository that can be maintained with AI assistance.

## Why open-source fichil.com

Open-sourcing this site is not about asking people to copy the same personal website. The practical reason is to make maintenance visible and traceable.

The direct benefits are:

- Git records every content and configuration change.
- Hugo config, theme usage, and content structure can be reviewed.
- GitHub Issues become the task entry point.
- GitHub Actions can check whether the site builds.
- AI tools can work from repository context instead of guessing.

For a personal site, that is already enough structure to avoid many manual mistakes.

## How I organized the Hugo repository

The first step was to upload the local Hugo project to GitHub and add the basic project files.

The core files are:

```text
README.md
AGENTS.md
LICENSE
.gitignore
hugo.yaml
.github/workflows/hugo-check.yml
.github/workflows/deploy.yml
```

`README.md` explains the project for people. `AGENTS.md` gives AI tools the operating rules. `LICENSE` defines the open-source terms. `.gitignore` keeps Hugo build output and local files out of the repository.

The theme is managed as a Git submodule, so third-party theme code does not get mixed into the site source.

## Issue-driven AI maintenance

The workflow I want is simple:

```text
GitHub Issue
↓
AI agent reads the task
↓
AI changes the repository and opens a Pull Request
↓
GitHub Actions checks the build
↓
Human review and merge
↓
Automatic deployment to the VPS
```

If Copilot coding agent or Codex agent is not available yet, the fallback workflow still works:

```text
Write the requirement in a GitHub Issue
↓
Ask ChatGPT to analyze the Issue
↓
Apply the suggested code or content changes
↓
Commit to main
↓
Let GitHub Actions deploy the site
```

The goal at this stage is not full automation. The goal is to make the task entry point, build check, and deployment path repeatable.

## Deployment path

The site deploys through GitHub Actions. After main is updated, Actions builds the Hugo site and syncs the generated `public/` directory to the VPS path served by Nginx.

The path is roughly:

```text
Push to main
↓
GitHub Actions
↓
hugo --minify
↓
rsync public/ to VPS
↓
Nginx serves /var/www/fichil
↓
https://fichil.com updates
```

This removes the need to upload files by hand after every content change.

## Risk control

Using AI to maintain a website does not mean letting AI operate the production server directly.

The safer boundary is:

- AI can edit Markdown content.
- AI can update README, docs, and small configuration files.
- AI should not casually edit theme source code.
- AI should not SSH into the VPS.
- Production deployment should go through GitHub Actions.
- Theme, deployment, Nginx, and license changes still need human review.

In short, AI is useful as a development assistant, but release control should stay with the owner.

## Next steps

My next steps are:

1. Improve deployment documentation for VPS, Nginx, Hugo, and HTTPS.
2. Add more real troubleshooting notes from daily engineering work.
3. Improve Issue templates so AI tools receive clearer tasks.
4. Test available AI coding agents for Issue-to-PR workflows.
5. Automate low-risk content changes first.

The direction is practical: keep useful notes, track changes, make deployment repeatable, and use AI where it reduces manual work without increasing production risk.
