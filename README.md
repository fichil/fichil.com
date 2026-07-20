# fichil.com

[English](#english) | [中文](#中文)

## English

Source code for [fichil.com](https://fichil.com), a bilingual engineering blog
and portfolio covering backend systems, DevOps, logistics integrations,
open-source tools, and AI-assisted development.

### Architecture

- `content/en/` and `content/zh-cn/` are the only article sources.
- `hugo.yaml` contains shared navigation and homepage copy.
- Hugo provides local content preview, compatibility validation, and the
  emergency VPS rollback build.
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
2. Make focused changes on the `chatgpt` branch.
3. Open a pull request into `main` and wait for owner review.
4. GitHub Actions validates both Hugo and Sites without deployment credentials.
5. After merge, a Codex task checks `main` at 10:00 Asia/Shanghai on weekdays
   and publishes a new validated commit to Sites.

The production commit is exposed at `/version.json`. The scheduled publisher
uses it to skip unchanged releases and rolls back to the previously known-good
Sites version if post-deploy smoke checks fail. Sites credentials are always
short-lived and must never be committed or persisted in Git configuration.

The VPS workflow is manual-only and reserved for explicitly confirmed emergency
rollback. See [deployment.md](deployment.md) for the complete runbook.

### License

This repository is available under the MIT License. The Hugo theme retains its
upstream license.

## 中文

这是 [fichil.com](https://fichil.com) 的开源代码仓库。网站用于发布后端开发、
DevOps、物流系统集成、开源工具和 AI 辅助开发相关的中英文工程记录。

### 架构

- `content/en/` 与 `content/zh-cn/` 是唯一文章来源。
- `hugo.yaml` 保存公共导航和首页内容。
- Hugo 用于本地内容预览、兼容性验证和紧急 VPS 回退构建。
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
2. 在 `chatgpt` 分支完成小范围修改。
3. 创建到 `main` 的 Pull Request，等待 owner 审核。
4. GitHub Actions 在不持有部署凭据的情况下验证 Hugo 与 Sites。
5. 合并后，Codex 每个工作日北京时间 10:00 检查 `main`，并把通过验证的
   新提交发布到 Sites。

线上提交可通过 `/version.json` 查询。定时发布任务用它跳过相同版本；发布后
冒烟检查失败时，会回退到上一个已知正常的 Sites 版本。Sites 凭据必须保持
短期有效，禁止提交到仓库或保存到 Git 配置。

VPS workflow 只能手动触发，仅用于明确确认后的紧急回退。完整操作说明见
[deployment.md](deployment.md)。

### 许可证

本仓库使用 MIT License；Hugo 主题继续遵循其上游许可证。
