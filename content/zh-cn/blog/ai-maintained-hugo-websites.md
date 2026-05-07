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

我最初搭建 fichil.com 的目的很简单：有一个自己的技术博客，用来记录开发、部署、排障和开源项目过程。

随着内容变多，只把网站文件放在服务器上不够了。我需要让源码、内容、部署步骤和修改记录都能被检查、复用和回滚。

所以我开始把 fichil.com 整理成一个可以由 AI 辅助维护的 Hugo 开源仓库。

## 为什么开源 fichil.com

开源这个网站源码，不是为了让别人复制同一个个人网站。更实际的原因是让维护过程更清楚：改了什么、为什么改、出了问题怎么回退。

开源后有几个直接收益：

- 所有变更都通过 Git 记录，方便回滚和复盘。
- Hugo 配置、主题、内容结构都能被明确管理。
- GitHub Issues 可以作为需求入口。
- GitHub Actions 可以自动验证构建是否成功。
- AI 工具可以基于仓库上下文给出修改建议。

对我来说，这能减少手工维护时的遗漏。

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

其中 `README.md` 面向人，说明项目如何运行；`AGENTS.md` 面向 AI，告诉 AI 修改代码时应该遵守哪些规则；`LICENSE` 明确开源协议；`.gitignore` 避免提交 Hugo 构建产物和本地临时文件。

主题使用 Git submodule 管理，避免把第三方主题代码直接混进自己的仓库。

## 如何通过 Issue 驱动 AI 修改代码

我想要的流程是：

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

如果 GitHub Copilot coding agent 或 Codex agent 暂时不可用，也可以先采用半自动模式：

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

这个阶段先不追求完全自动化，先把需求入口、构建检查和部署链路跑通。

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

这样每次改文章或配置后，不需要再手工上传文件。

## 风险控制

让 AI 参与网站维护，不等于让 AI 直接操作生产服务器。

更稳妥的边界是：

- AI 可以修改 Markdown 内容。
- AI 可以修改 README、文档和小范围配置。
- AI 不应该随意修改主题源码。
- AI 不应该直接登录 VPS。
- 所有上线动作都应该通过 GitHub Actions 执行。
- 主题、部署、Nginx、License 等高风险变更仍然需要人工 Review。

简单说，AI 可以帮我减少重复劳动，但上线控制权不能丢。

## 后续计划

下一步计划：

1. 完善部署文档，记录 VPS、Nginx、Hugo、HTTPS 的完整流程。
2. 增加更多真实排障文章，把日常问题沉淀成博客内容。
3. 优化 Issue 模板，让 AI 更容易理解需求边界。
4. 尝试接入可用的 AI coding agent，让 Issue 自动生成 Pull Request。
5. 先自动化低风险内容变更。

方向很明确：留下有用的技术记录，让修改可追踪，让部署可重复，让 AI 参与能提高效率但不扩大线上风险。
