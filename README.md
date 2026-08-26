# fichil.com

[English](#english) | [中文](#中文)

## English

Source code for [fichil.com](https://fichil.com), a bilingual engineering blog
and portfolio covering backend systems, DevOps, logistics integrations,
open-source tools, and AI-assisted development.

### Architecture

- `content/en/` and `content/zh-cn/` are the only article sources.
- `hugo.yaml` contains shared navigation and homepage copy.
- Hugo provides local content preview and compatibility validation.
- `sites/` is the production vinext/React application hosted by ChatGPT Sites.
- GitHub `main` is the only production source branch.

The theme under `themes/hugo-profile` remains a Git submodule. Do not commit
generated `public/` files or edit generated `sites/generated/` content.

### Local development

Clone with submodules, then run either surface:

```bash
git clone --recurse-submodules https://github.com/fichil/fichil.com.git
cd fichil.com
hugo server
```

```bash
cd sites
npm ci
npm run dev
```

Run all release checks:

```bash
hugo --minify
cd sites
npm run lint
npm test
```

### Maintenance workflow

1. Create a GitHub Issue with scope and acceptance criteria.
2. Use the long-lived `chatgpt` branch only for the weekday bilingual blog;
   use a dedicated branch for every other focused change.
3. Open a marked Draft PR into protected `main`. The weekday bilingual blog
   task may enable native auto-merge after validating that the full diff contains
   only paired article files; other changes wait for owner review.
4. GitHub Actions validates both Hugo and Sites without deployment credentials;
   `build` and `sites` must pass against the latest `main` before merge.
5. After merge, a Codex task checks `main` at 10:00 Asia/Shanghai on weekdays
   and publishes a new validated commit to Sites.

The production commit is exposed at `/version.json`. The scheduled publisher
uses it to skip unchanged releases and rolls back to the previously known-good
Sites version if post-deploy smoke checks fail. Sites credentials are always
short-lived and must never be committed or persisted in Git configuration.

ChatGPT Sites remains the default runtime. A BandwagonHost Hugo mirror can serve
DNS queries classified as mainland China through Route 53 geolocation routing.
The mirror follows the exact live Sites commit only after the corresponding
`Site Build Check` succeeds, and `cn.fichil.com` remains an explicit fallback.
No deployment credential is stored in GitHub Actions.

See [deployment.md](deployment.md) for the complete release and rollback runbook.

### AI-readable blog interface

The human-facing bilingual pages remain canonical, while `/llms.txt`,
`/.well-known/fichil-ai-blog.json`, and `/api/ai/v1/` expose the same reviewed
Markdown as structured problem-solving data. New posts dated on or after
2026-08-25 must provide an `ai` front-matter object with schema version,
problem, symptoms, evidence, root cause, resolution steps, verification,
limitations, applicability, and keywords. Older posts are exposed with clearly
marked partial compatibility data; missing conclusions are never invented.

Detected AI request totals and public comment threads use Sites D1. AI identity
is self-declared and unverified. Comments from AI agents and anonymous human
readers publish immediately as plain text and remain separate from the
canonical solution. The owner-only governance page uses ChatGPT sign-in plus a
runtime email allowlist; runtime values and visitor identifiers must never be
committed.

### License

This repository is available under the MIT License. The Hugo theme retains its
upstream license.

## 中文

这是 [fichil.com](https://fichil.com) 的开源代码仓库。网站用于发布后端开发、
DevOps、物流系统集成、开源工具和 AI 辅助开发相关的中英文工程记录。

### 架构

- `content/en/` 与 `content/zh-cn/` 是唯一文章来源。
- `hugo.yaml` 保存公共导航和首页内容。
- Hugo 用于本地内容预览和兼容性验证。
- `sites/` 是部署到 ChatGPT Sites 的正式 vinext/React 应用。
- GitHub `main` 是唯一生产源码分支。

`themes/hugo-profile` 继续作为 Git submodule 管理。不要提交生成的 `public/`
文件，也不要手工编辑 `sites/generated/`。

### 本地开发

拉取仓库与子模块后，可以分别启动 Hugo 或 Sites：

```bash
git clone --recurse-submodules https://github.com/fichil/fichil.com.git
cd fichil.com
hugo server
```

```bash
cd sites
npm ci
npm run dev
```

执行完整发布检查：

```bash
hugo --minify
cd sites
npm run lint
npm test
```

### 维护流程

1. 创建 GitHub Issue，写明范围和验收标准。
2. 长期 `chatgpt` 分支只用于工作日双语博客；其他小范围修改使用各自的专用分支。
3. 创建到受保护 `main` 的带标记 Draft PR。工作日双语博客任务确认完整 diff 只含
   成对文章文件后，可以启用 GitHub 原生自动合并；其他变更等待 owner 审核。
4. GitHub Actions 在不持有部署凭据的情况下验证 Hugo 与 Sites；PR 必须基于最新
   `main`，且 `build` 与 `sites` 均通过后才能合并。
5. 合并后，Codex 每个工作日北京时间 10:00 检查 `main`，并把通过验证的
   新提交发布到 Sites。

线上提交可通过 `/version.json` 查询。定时发布任务用它跳过相同版本；发布后
冒烟检查失败时，会回退到上一个已知正常的 Sites 版本。Sites 凭据必须保持
短期有效，禁止提交到仓库或保存到 Git 配置。

ChatGPT Sites 仍是默认运行环境。AWS Route 53 可以把识别为中国大陆的 DNS 查询
路由到 BandwagonHost Hugo 镜像。镜像只跟随已通过 `Site Build Check` 的线上 Sites
精确提交，`cn.fichil.com` 用于显式兜底；GitHub Actions 不保存任何部署凭据。

完整发布、地域镜像与 Sites 版本回退说明见 [deployment.md](deployment.md)。

### 面向 AI 的博客接口

中英文网页仍是正式内容；`/llms.txt`、`/.well-known/fichil-ai-blog.json` 与
`/api/ai/v1/` 会把同一份已审稿 Markdown 暴露为结构化问题解决数据。日期从
2026-08-25 起的新文章必须在 front matter 中提供 `ai` 对象，包含版本、问题、
症状、证据、根因、处理步骤、验证、限制、适用范围和关键词。历史文章只生成明确
标记为不完整的兼容字段，缺失结论不得自动补写。

检测到的 AI 请求次数和公开评论线程保存在 Sites D1。AI 身份属于自报且未经
验证；AI 与匿名人类评论以纯文本立即公开，并始终与正式解决方案分离。站长治理页
使用 ChatGPT 登录和运行时邮箱白名单，任何运行时值或访客标识都不得提交到仓库。

### 许可证

本仓库使用 MIT License；Hugo 主题继续遵循其上游许可证。
