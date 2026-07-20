# Deployment Guide / 部署说明

## Production model / 生产模型

- Production URL / 生产地址: `https://fichil.com/`
- Source repository / 源码仓库: `https://github.com/fichil/fichil.com`
- Production source / 生产源码: GitHub `main`
- Production runtime / 正式运行环境: ChatGPT Sites (`sites/`)
- Content compatibility and rollback build / 内容兼容与回退构建: Hugo

GitHub remains the source of truth. Sites versions must be built from, pushed
from, and saved against the same full Git commit SHA. GitHub Actions contains
no Sites deployment credential.

GitHub 始终是唯一可信源码。Sites 的构建、源仓库推送和版本保存必须对应同一个
完整 Git SHA；GitHub Actions 不保存任何 Sites 部署凭据。

## Change and review workflow / 修改与审核流程

1. Create a bilingual Issue with scope and acceptance criteria.
2. Update the `chatgpt` branch without rewriting remote history.
3. Validate Hugo and Sites locally.
4. Open a Draft PR from `chatgpt` to `main`.
5. The owner reviews and merges the PR manually.
6. `Site Build Check` validates the exact `main` commit.

对应中文流程：先创建双语 Issue，在 `chatgpt` 分支修改并验证，创建到 `main` 的
Draft PR，由 owner 人工审核合并，再由 `Site Build Check` 验证准确的生产提交。

Do not publish an unmerged branch. English and Chinese articles must keep the
same slug and must stay under `content/en/blog/` and `content/zh-cn/blog/`.

禁止发布未合并分支。中英文文章必须使用相同 slug，并且只放在
`content/en/blog/` 与 `content/zh-cn/blog/`。

## Automated Sites publishing / Sites 自动发布

The project-scoped Codex task `fichil.com Sites 自动发布` runs every weekday at
10:00 Asia/Shanghai in an isolated worktree. A commit merged after that time is
normally published on the next weekday.

项目级 Codex 定时任务 `fichil.com Sites 自动发布` 每个工作日北京时间 10:00
在隔离 worktree 中运行。10:00 之后合并的提交通常在下一个工作日发布。

For each run, the publisher:

1. Fetches `origin/main` and finds its full commit SHA.
2. Requires a successful `Site Build Check` for that exact SHA.
3. Reads `https://fichil.com/version.json`; an identical SHA is a no-op.
4. Runs `hugo --minify`, `npm run lint`, and `npm test` from a clean source state.
5. Obtains a short-lived Sites source credential without persisting it.
6. Pushes the exact source SHA, packages the matching build, saves or reuses the
   matching Sites version, deploys it, and waits for completion.
7. Checks the homepage, bilingual blog indexes, RSS, sitemaps, and
   `/version.json`.

每次运行会获取并核对 `origin/main`，要求对应 GitHub 检查成功；线上 SHA 未变化时
直接结束。发现新提交后执行完整构建，临时获取 Sites 凭据，发布与该 SHA 完全一致
的版本，并检查首页、中英文博客、RSS、站点地图和版本接口。

If GitHub, authentication, build, or packaging fails before deployment, the
current production version remains unchanged. If post-deploy smoke checks fail,
the task redeploys the previously known-good Sites version and reports both the
release failure and rollback result.

如果 GitHub、认证、构建或打包在发布前失败，保持当前线上版本不变。若发布后的
冒烟检查失败，任务会重新部署发布前记录的正常版本，并报告发布与回退结果。

## Manual Sites release / 人工 Sites 发布

Use a manual release only when the scheduled task cannot run and the exact
`main` SHA has passed `Site Build Check`. Follow the same build, short-lived
credential, source push, package, save, deploy, poll, and smoke-check sequence.
Never deploy a dirty worktree or a commit that differs from the packaged build.

只有在定时任务无法运行、并且准确的 `main` SHA 已通过检查时才进行人工发布。
人工发布必须遵守相同的构建、临时凭据、源码推送、打包、保存、上线、轮询和冒烟
检查顺序；禁止发布脏工作区或与构建产物不一致的提交。

## Emergency VPS rollback / VPS 紧急回退

`.github/workflows/deploy.yml` is manual-only. It requires typing
`DEPLOY-VPS` and must be used only after an explicitly confirmed emergency
rollback decision. Normal incidents should first redeploy a known-good Sites
version. Do not change DNS or Sites access policy as part of a normal release.

`.github/workflows/deploy.yml` 只能手动运行，并要求输入 `DEPLOY-VPS`。它仅用于
明确确认后的紧急 VPS 回退；普通故障应优先重新部署已知正常的 Sites 版本。正常
发布不得修改 DNS 或 Sites 访问权限。

## Release checklist / 发布检查清单

- The change is linked to an Issue and reviewed through a PR.
- `main` is the exact source being released.
- Hugo build, Sites lint, and Sites tests pass.
- No generated `public/`, `sites/generated/`, cache, key, password, or token is committed.
- No Sites credential appears in a remote URL, Git configuration, file, or log.
- `/version.json` reports the released full SHA after deployment.
- Canonical English and Chinese routes return successful responses.

中文检查重点：Issue 与 PR 完整、发布源必须是准确的 `main`、Hugo 与 Sites 检查
全部通过、没有提交生成文件或凭据、线上版本接口返回发布 SHA、中英文核心路径正常。
