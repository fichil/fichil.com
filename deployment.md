# Deployment Guide

This document explains how the `fichil.com` website is maintained and deployed.

## Project Overview

- Website: `https://fichil.com/`
- Repository: `https://github.com/fichil/fichil.com.git`
- Site generator: Hugo
- Theme: `hugo-profile`
- Source control: GitHub
- Deployment: GitHub Actions

The website is built from the repository source files. After approved changes are merged into `main`, GitHub Actions handles the production deployment.

## Branch Rules

### `main`

`main` is the production branch.

Rules:

- Do not commit directly to `main`.
- Only merge reviewed pull requests into `main`.
- A merge into `main` triggers the deployment workflow.
- The live website should reflect the latest successfully deployed `main` branch.

### `chatgpt`

`chatgpt` is the working branch for AI-assisted changes.

Rules:

- All AI-generated code, configuration, and content changes must be committed to `chatgpt`.
- Changes from `chatgpt` must be opened as a pull request into `main`.
- The repository owner reviews and merges the pull request manually.
- Do not use `chatgpt` to bypass review.

## Change Workflow

For each change request, use this process:

1. Create a GitHub Issue first.
2. Describe the problem, scope, and acceptance criteria in the Issue.
3. Make the change on the `chatgpt` branch.
4. Keep the change set small and limited to the requested scope.
5. Open a pull request from `chatgpt` to `main`.
6. Write the PR description in both English and Chinese.
7. Wait for manual review and merge by the repository owner.
8. After the PR is merged into `main`, GitHub Actions deploys the site.

## Content Directory Rules

Use the current multilingual content structure:

- English content: `content/en/`
- Chinese content: `content/zh-cn/`
- English blog path: `/blog/`
- Chinese blog path: `/zh-cn/blog/`

Do not use the old blog directory:

- `content/blog/`

When updating blog posts or page content, keep English and Chinese versions aligned unless the request clearly says to update only one language.

## Navigation Rules

Homepage menu links must work from both the homepage and blog pages.

English navigation links:

- `/#about`
- `/#projects`
- `/#contact`
- `/blog/`

Chinese navigation links:

- `/zh-cn/#about`
- `/zh-cn/#projects`
- `/zh-cn/#contact`
- `/zh-cn/blog/`

Before opening a PR, check that the links do not point to the wrong language version.

## Files That Should Not Be Changed

Do not modify these unless explicitly requested:

- `themes/`
- `public/`
- GitHub Actions workflow files under `.github/workflows/`
- deployment secrets or server credentials

Do not commit generated files, local cache files, private keys, tokens, passwords, or temporary build output.

## Hugo Configuration

Prefer updating `hugo.yaml` when the site configuration needs to change.

Static assets should be placed under:

- `static/`

Examples:

- images
- icons
- downloadable files
- files that should be copied directly into the generated site

## Deployment Behavior

Deployment is expected to work as follows:

1. A pull request is merged into `main`.
2. GitHub Actions starts automatically.
3. Hugo builds the static website.
4. The generated site is deployed to production.
5. The updated website becomes available at `https://fichil.com/`.

Do not manually upload files to the server for normal content or configuration changes. The repository should remain the source of truth.

## Pull Request Description Requirements

Each PR should include:

- What changed
- Why it changed
- Impact scope
- How to verify it
- Confirmation that `themes/` was not modified
- Confirmation that `public/` was not modified

The PR description must be bilingual:

1. English first
2. Chinese second

## Pre-merge Checklist

Before asking for review, check the following:

- The change is linked to a GitHub Issue.
- Only necessary files were changed.
- No `themes/` files were changed.
- No `public/` files were changed.
- No secrets or credentials were committed.
- English and Chinese content are aligned when both versions are affected.
- Blog links use the correct language paths.
- Homepage anchor links work from blog pages.
- No obvious 404, 403, broken image, or language mismatch was introduced.

## Rollback Strategy

If a deployment causes a problem:

1. Identify the merged PR or commit that introduced the issue.
2. Revert the commit or open a new fix PR.
3. Merge the rollback or fix into `main` after review.
4. Let GitHub Actions deploy the corrected version.

Avoid making direct server-side fixes unless the website is unavailable and an urgent temporary fix is needed. Any temporary server-side change should later be reflected in the repository.

---

# 部署说明

本文档说明 `fichil.com` 网站的维护和部署方式。

## 项目概况

- 网站地址：`https://fichil.com/`
- GitHub 仓库：`https://github.com/fichil/fichil.com.git`
- 静态网站生成器：Hugo
- 主题：`hugo-profile`
- 源码管理：GitHub
- 部署方式：GitHub Actions

网站由仓库中的源码构建生成。修改经过审核并合并到 `main` 后，由 GitHub Actions 自动完成线上部署。

## 分支规则

### `main`

`main` 是生产分支。

规则：

- 不直接提交到 `main`。
- 只允许把审核后的 Pull Request 合并到 `main`。
- 合并到 `main` 后会触发部署 workflow。
- 线上网站应对应最近一次成功部署的 `main` 分支内容。

### `chatgpt`

`chatgpt` 是 AI 辅助修改分支。

规则：

- 所有 AI 生成的代码、配置、文章和文档修改都提交到 `chatgpt`。
- `chatgpt` 的修改必须通过 Pull Request 合并到 `main`。
- Pull Request 由仓库 owner 手动审核并合并。
- 不允许绕过审核流程。

## 修改流程

每次需求按下面流程处理：

1. 先创建 GitHub Issue。
2. 在 Issue 中写清楚问题、修改范围和验收标准。
3. 在 `chatgpt` 分支上修改。
4. 修改范围要小，只处理本次需求相关内容。
5. 从 `chatgpt` 创建 Pull Request 到 `main`。
6. PR 描述使用中英文双语，英文在前，中文在后。
7. 等仓库 owner 手动审核并合并。
8. PR 合并到 `main` 后，由 GitHub Actions 自动部署网站。

## 内容目录规则

使用当前的多语言目录结构：

- 英文内容：`content/en/`
- 中文内容：`content/zh-cn/`
- 英文博客路径：`/blog/`
- 中文博客路径：`/zh-cn/blog/`

不再使用旧博客目录：

- `content/blog/`

修改博客或页面内容时，中英文版本要尽量保持同步。除非需求明确说明只改某一个语言版本，否则不要只更新单边内容。

## 导航规则

首页菜单链接必须能从首页和博客页正常跳转。

英文导航链接：

- `/#about`
- `/#projects`
- `/#contact`
- `/blog/`

中文导航链接：

- `/zh-cn/#about`
- `/zh-cn/#projects`
- `/zh-cn/#contact`
- `/zh-cn/blog/`

创建 PR 前，需要检查菜单链接没有跳到错误语言版本。

## 不应修改的文件

除非明确要求，否则不要修改：

- `themes/`
- `public/`
- `.github/workflows/` 下的 GitHub Actions workflow 文件
- 部署密钥或服务器凭据

不要提交构建产物、本地缓存文件、私钥、token、密码或临时文件。

## Hugo 配置规则

网站配置优先修改：

- `hugo.yaml`

静态资源放在：

- `static/`

例如：

- 图片
- 图标
- 可下载文件
- 需要原样复制到生成网站中的文件

## 部署行为

正常部署流程如下：

1. Pull Request 合并到 `main`。
2. GitHub Actions 自动启动。
3. Hugo 构建静态网站。
4. 生成后的网站部署到生产环境。
5. 新内容在 `https://fichil.com/` 生效。

普通内容和配置修改不需要手动上传服务器。仓库应该作为唯一可信来源。

## Pull Request 描述要求

每个 PR 需要包含：

- 修改内容
- 修改原因
- 影响范围
- 验收方式
- 确认没有修改 `themes/`
- 确认没有修改 `public/`

PR 描述必须中英文双语：

1. 英文在前
2. 中文在后

## 合并前检查清单

请求审核前检查：

- 修改已关联 GitHub Issue。
- 只修改了必要文件。
- 没有修改 `themes/`。
- 没有修改 `public/`。
- 没有提交密钥、token、密码等敏感信息。
- 涉及中英文内容时，两边内容保持对应。
- 博客链接使用正确的语言路径。
- 首页锚点链接能从博客页正常跳转。
- 没有引入明显的 404、403、图片缺失或语言错乱问题。

## 回滚策略

如果部署后出现问题：

1. 找到引入问题的 PR 或 commit。
2. revert 对应 commit，或者新建修复 PR。
3. 审核后合并回滚或修复到 `main`。
4. 由 GitHub Actions 自动部署修正后的版本。

除非网站不可用且需要紧急临时处理，否则不要直接在服务器上修复。任何临时服务器改动，后续都应该补回仓库。