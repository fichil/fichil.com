---
title: "Building and Operating fichil.com with AI: From Markdown to Auditable Sites Releases"
date: 2026-05-07
lastmod: 2026-07-29
draft: false
tags: ["AI", "Hugo", "GitHub Actions", "Open Source", "DevOps", "Sites"]
categories: ["AI Engineering"]
description: "How fichil.com keeps Hugo Markdown as its content source while using AI-assisted changes, human review, CI, exact-SHA releases, and Sites version rollback."
---

fichil.com is not only a place to publish articles. It is also a public engineering project where the content, application, release rules, and production version can be traced to the same Git commit.

“AI-assisted development and operations” does not mean giving a model uncontrolled production access. AI reads context, proposes and implements changes, and runs verification. A person remains responsible for the requirement, review, merge, and release decision.

## Separate the content source from the production application

The site keeps two boundaries explicit:

```text
content/en + content/zh-cn
        ↓
Hugo Markdown (the only article source)
        ↓
content generation and bilingual checks
        ↓
vinext / React Sites application
        ↓
ChatGPT Sites production version
```

Hugo still validates the content structure and compatibility build. The vinext application under `sites/` renders production. Articles are not copied into application components, so a Markdown edit cannot silently diverge from a second hard-coded version.

## Why the repository remains open and reviewable

The practical value of open source here is not that someone can clone the same personal site. It is that every change has a visible boundary:

- Git records content, component, and configuration differences.
- `AGENTS.md` defines what an AI agent may change and what remains protected.
- Pull Requests keep the requirement, implementation, and check results together.
- CI validates both the Hugo compatibility build and the Sites application.
- `/version.json` exposes the full commit SHA currently deployed.

That turns “deployed” into a fact that can be checked instead of an assumption based on one terminal message.

## Keep responsibility around AI-assisted work

A normal change follows this sequence:

```text
define the goal and public-data boundary
        ↓
create an isolated workspace from the latest main
        ↓
AI edits Markdown, configuration, or application code
        ↓
human review of content, privacy, and engineering claims
        ↓
Hugo build + lint + complete Sites tests
        ↓
Pull Request and CI
        ↓
human merge
```

AI can accelerate discovery, implementation, and repeated checks. It cannot decide which private facts may be published, and it must not present an unimplemented plan as completed work.

## Make every release correspond to one exact commit

Every production release must correspond to a commit already merged into `main` with the required checks passing. The build output, source pushed to Sites, and saved Sites version must all use the same full SHA; source and artifacts from different commits cannot be mixed.

After deployment, the release process verifies:

1. `/version.json` returns the target commit;
2. the English and Chinese home and blog routes work;
3. core articles, static assets, and language switching remain available;
4. a failed smoke check can restore the previous known-good version immediately.

Rollback does not depend on logging into a server. It redeploys a saved and previously verified Sites version, so release and recovery use the same unambiguous version reference.

## What this workflow demonstrates

An open repository cannot prove every engineering capability. It can show whether changes stay focused, checks are repeatable, production is traceable, and recovery has a defined path.

That is the working style I want fichil.com to make visible: establish evidence first, limit the change surface, and finish with a result another person can review.
