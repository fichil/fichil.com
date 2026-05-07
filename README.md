# fichil.com

[English](#english) | [中文](#中文)

---

## English

Source code for my personal technical blog: https://fichil.com

This site is built with Hugo and used to publish technical notes, troubleshooting records, open-source project updates, and AI-assisted development experiments.

### Tech Stack

- Hugo
- Markdown
- Nginx
- GitHub
- GitHub Actions
- hugo-profile theme

### Repository Structure

```text
content/en/       English pages and posts
content/zh-cn/    Chinese pages and posts
static/           Static files such as images and favicon
assets/           Theme assets and custom frontend assets
themes/           Hugo themes managed by Git submodules
hugo.yaml         Hugo site configuration
AGENTS.md         AI maintenance rules
.github/          GitHub Actions workflows
```

### Local Development

Clone this repository with submodules:

```bash
git clone --recurse-submodules https://github.com/fichil/fichil.com.git
cd fichil.com
```

If the repository was cloned without submodules:

```bash
git submodule update --init --recursive
```

Start the local Hugo server:

```bash
hugo server
```

Build the site:

```bash
hugo --minify
```

The build output is generated into:

```text
public/
```

Do not commit the `public/` directory.

### Theme

This site currently uses:

```yaml
theme: "hugo-profile"
```

The theme is managed as a Git submodule:

```text
themes/hugo-profile
```

When changing the theme, make sure both `hugo.yaml` and `.gitmodules` stay consistent.

### Content Rules

English content should be placed under:

```text
content/en/
```

Chinese content should be placed under:

```text
content/zh-cn/
```

The old `content/blog/` directory is no longer used.

English blog URL:

```text
/blog/
```

Chinese blog URL:

```text
/zh-cn/blog/
```

Use Markdown for posts and pages.

Recommended article types:

- Technical troubleshooting notes
- Backend development records
- DevOps and deployment cases
- Open-source project updates
- AI-assisted development experiments

### Deployment

Merging into `main` triggers GitHub Actions deployment automatically.

Production site:

```text
https://fichil.com
```

Do not commit generated files from `public/`.

### GitHub Actions

This repository includes a Hugo build and deployment workflow.

The workflow runs on changes to `main` and checks whether the site can be built successfully with:

```bash
hugo --minify
```

This helps prevent broken configuration, missing themes, or invalid content from being deployed.

### AI Maintenance Workflow

This repository is intended to be maintained with AI-assisted development tools such as ChatGPT Codex.

AI-assisted changes should follow this workflow:

1. Create a GitHub Issue first.
2. Modify files on the `chatgpt` branch.
3. Create a Pull Request to `main`.
4. Wait for manual review.
5. After merge, GitHub Actions deploys the site automatically.

Before changing this repository:

- Do not commit secrets
- Do not commit generated `public/` files
- Do not modify theme submodules unless required
- Keep commits small and focused
- Prefer content and configuration changes over deep theme changes
- Check `hugo.yaml` before changing navigation, multilingual paths, or homepage sections
- Run `hugo server` for local preview when possible
- Run `hugo --minify` before deployment when possible

For detailed AI maintenance rules, see:

```text
AGENTS.md
```

### Basic Git Workflow

Check current changes:

```bash
git status
```

Stage files:

```bash
git add README.md
```

Commit changes:

```bash
git commit -m "Update bilingual README"
```

Push to GitHub:

```bash
git push origin chatgpt
```

### License

This repository is open source under the MIT License.

Source code, configuration files, and site structure are licensed under the MIT License.

The Hugo theme is included as a Git submodule and is licensed by its original author. Please refer to the theme repository for its license.

Unless otherwise stated, blog posts and original content in this repository are also released under the MIT License.

---

## 中文

这是我的个人技术博客源码仓库：https://fichil.com

网站使用 Hugo 构建，主要用于记录技术排查、项目修改、开源项目更新，以及 AI 辅助开发过程。

### 技术栈

- Hugo
- Markdown
- Nginx
- GitHub
- GitHub Actions
- hugo-profile 主题

### 仓库结构

```text
content/en/       英文页面和文章
content/zh-cn/    中文页面和文章
static/           图片、favicon 等静态资源
assets/           主题资源和自定义前端资源
themes/           Hugo 主题，使用 Git submodule 管理
hugo.yaml         Hugo 网站配置
AGENTS.md         AI 维护规则
.github/          GitHub Actions 工作流
```

### 本地开发

拉取仓库和子模块：

```bash
git clone --recurse-submodules https://github.com/fichil/fichil.com.git
cd fichil.com
```

如果拉取时没有包含子模块，执行：

```bash
git submodule update --init --recursive
```

启动本地 Hugo 服务：

```bash
hugo server
```

构建网站：

```bash
hugo --minify
```

构建结果会生成到：

```text
public/
```

不要提交 `public/` 目录。

### 主题

当前网站使用：

```yaml
theme: "hugo-profile"
```

主题通过 Git submodule 管理：

```text
themes/hugo-profile
```

如果后续更换主题，需要同时检查 `hugo.yaml` 和 `.gitmodules` 是否一致。

### 内容规则

英文内容放在：

```text
content/en/
```

中文内容放在：

```text
content/zh-cn/
```

旧目录 `content/blog/` 不再使用。

英文博客路径：

```text
/blog/
```

中文博客路径：

```text
/zh-cn/blog/
```

文章和页面使用 Markdown 编写。

推荐记录的内容：

- 技术问题排查
- 后端开发记录
- DevOps 和部署问题
- 开源项目更新
- AI 辅助开发实验

### 部署方式

合并到 `main` 后会由 GitHub Actions 自动部署。

线上网站：

```text
https://fichil.com
```

不要提交 `public/` 目录里的构建产物。

### GitHub Actions

本仓库包含 Hugo 构建和部署工作流。

工作流会在 `main` 变更后运行，并检查网站是否可以正常构建：

```bash
hugo --minify
```

这样可以减少配置错误、主题缺失、内容格式错误导致的线上问题。

### AI 维护流程

本仓库计划使用 ChatGPT Codex 等 AI 开发工具辅助维护。

AI 修改本仓库时，需要按下面流程执行：

1. 先创建 GitHub Issue。
2. 在 `chatgpt` 分支修改文件。
3. 创建 Pull Request 到 `main`。
4. 等待人工审核。
5. 合并到 `main` 后，由 GitHub Actions 自动部署网站。

修改前需要遵守：

- 不提交敏感信息
- 不提交生成的 `public/` 文件
- 非必要不修改主题 submodule
- 每次提交保持小范围修改
- 优先修改内容和配置，不直接改主题源码
- 修改导航、多语言路径、首页区块前先检查 `hugo.yaml`
- 条件允许时先运行 `hugo server` 本地预览
- 条件允许时先运行 `hugo --minify` 检查构建

详细 AI 维护规则见：

```text
AGENTS.md
```

### 基础 Git 流程

查看当前修改：

```bash
git status
```

暂存文件：

```bash
git add README.md
```

提交修改：

```bash
git commit -m "Update bilingual README"
```

推送到 GitHub：

```bash
git push origin chatgpt
```

### 许可证

本仓库使用 MIT License 开源。

源码、配置文件和网站结构使用 MIT License。

Hugo 主题通过 Git submodule 引入，主题本身遵循原作者的许可证。

除非特别说明，本仓库中的博客文章和原创内容也按 MIT License 发布。
