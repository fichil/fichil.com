---
title: "使用 AI 维护 Hugo 个人网站：从开源到自动部署"
date: 2026-05-07
draft: false
description: "记录 fichil.com 从个人 Hugo 网站整理为开源仓库，并逐步接入 AI 维护和 GitHub Actions 自动部署的过程。"
tags:
  - AI
  - Hugo
  - GitHub Actions
  - Open Source
  - DevOps
categories:
  - Engineering
---

## 背景

我最初搭建 fichil.com 的目的很简单：有一个属于自己的技术博客，用来记录开发、部署、排障和开源项目过程。

但随着内容越来越多，仅仅把网站放在服务器上已经不够了。真正长期可维护的网站，不能只依赖一次性手工操作，而应该具备清晰的仓库结构、明确的协作规则、自动化构建检查，以及可重复执行的部署流程。

所以我开始把 fichil.com 整理成一个可以被 AI 辅助维护的 Hugo 开源仓库。

## 为什么开源 fichil.com

开源这个网站源码，不是为了让别人复制一个完全相同的个人网站，而是为了让整个维护流程更加透明、可追踪、可协作。

开源后有几个直接收益：

- 所有变更都通过 Git 记录，方便回滚和复盘。
- Hugo 配置、主题、内容结构都能被明确管理。
- GitHub Issues 可以作为需求入口。
- GitHub Actions 可以自动验证构建是否成功。
- AI 工具可以基于仓库上下文生成修改建议。

对个人网站来说，这已经接近一个小型生产项目的治理方式。

## 如何整理 Hugo 仓库

第一步是把本地 Hugo 项目上传到 GitHub，并把仓库基础文件补齐。

核心文件包括：

```text
README.md
AGENTS.md
LICENSE
.gitignore
hugo.yaml
.github/workflows/hugo-check.yml
.github/workflows/deploy.yml
```

其中 `README.md` 面向人，说明项目如何运行；`AGENTS.md` 面向 AI，告诉 AI 修改代码时应该遵守哪些规则；`LICENSE` 明确开源协议；`.gitignore` 避免提交 Hugo 构建产物和敏感文件。

主题使用 Git submodule 管理，避免把第三方主题代码直接混入自己的仓库。当前仓库的 Hugo 配置和主题 submodule 必须保持一致，否则别人 clone 后无法正常构建。

## 如何通过 Issue 驱动 AI 修改代码

理想流程是：

```text
GitHub Issue
↓
AI Agent 读取需求
↓
AI 修改仓库并创建 Pull Request
↓
GitHub Actions 自动构建检查
↓
人工 Review 后合并
↓
自动部署到 VPS
```

目前如果 GitHub Copilot coding agent 或 Codex agent 没有开通，也可以先采用半自动模式：

```text
GitHub Issue 写需求
↓
把 Issue 内容交给 ChatGPT 分析
↓
AI 给出代码或内容修改
↓
人工提交到 main
↓
GitHub Actions 自动部署
```

这个阶段的重点不是一步到位追求完全自动化，而是先把任务入口、构建验证和部署链路打通。

## 自动部署链路

网站现在通过 GitHub Actions 自动部署。每次 main 分支更新后，Actions 会执行 Hugo 构建，并把生成的 `public/` 内容同步到 VPS 的 Nginx 目录。

部署链路大致是：

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
https://fichil.com 更新
```

这个流程的价值在于：只要仓库中的内容和配置是正确的，部署就可以重复执行，不再依赖手工上传文件。

## 风险控制

让 AI 参与网站维护，并不等于让 AI 直接操作生产服务器。

更稳妥的边界是：

- AI 可以修改 Markdown 内容。
- AI 可以修改 README、文档和小范围配置。
- AI 不应该随意修改主题源码。
- AI 不应该直接登录 VPS。
- 所有上线动作都应该通过 GitHub Actions 执行。
- 对主题、部署、Nginx、License 等高风险变更，仍然需要人工 Review。

换句话说，AI 应该作为开发助手，而不是不受控制的生产管理员。

## 后续计划

下一步计划会分成几个阶段推进：

1. 完善部署文档，记录 VPS、Nginx、Hugo、HTTPS 的完整流程。
2. 增加更多真实排障文章，把日常问题沉淀成博客内容。
3. 优化 Issue 模板，让 AI 更容易理解需求边界。
4. 尝试接入可用的 AI coding agent，让 Issue 自动生成 Pull Request。
5. 对低风险内容变更逐步提高自动化程度。

最终目标不是炫技，而是建立一套可持续的个人技术资产维护流程：内容可沉淀，代码可追踪，部署可复现，AI 可参与，但风险可控。
