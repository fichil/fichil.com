# Deployment Guide / 部署说明

## Production model / 生产模型

- Production URL / 生产地址: `https://fichil.com/`
- Source repository / 源码仓库: `https://github.com/fichil/fichil.com`
- Production source / 生产源码: GitHub `main`
- Production runtime / 正式运行环境: ChatGPT Sites (`sites/`)
- Content preview and compatibility validation / 内容预览与兼容性验证: Hugo

GitHub remains the source of truth. Sites versions must be built from, pushed
from, and saved against the same full Git commit SHA. GitHub Actions contains
no Sites deployment credential.

GitHub 始终是唯一可信源码。Sites 的构建、源仓库推送和版本保存必须对应同一个
完整 Git SHA；GitHub Actions 不保存任何 Sites 部署凭据。

## Change and review workflow / 修改与审核流程

1. Create a bilingual Issue with scope and acceptance criteria.
2. Use the long-lived `chatgpt` branch only for the weekday bilingual blog;
   use a dedicated branch for every other change.
3. Validate Hugo and Sites locally.
4. Open a Draft PR from the selected branch to `main`.
5. For the weekday bilingual blog task, validate the complete PR scope, mark it
   ready, and enable GitHub native auto-merge. Other changes require owner review.
6. GitHub merges only after the protected `build` and `sites` checks pass on a
   PR that is current with `main`.
7. `Site Build Check` validates the exact merged `main` commit.

对应中文流程：先创建双语 Issue。工作日双语博客使用长期 `chatgpt` 分支，其他
变更使用各自的专用分支；修改并验证后创建到 `main` 的 Draft PR。博客任务核对
完整 PR 范围后启用 GitHub 原生自动合并，其他变更仍由 owner 人工审核。PR 必须
基于最新 `main`，并通过受保护的 `build` 与 `sites` 检查；合并后再由
`Site Build Check` 验证准确的生产提交。

The `chatgpt` branch is reserved for the weekday bilingual blog task. Its PR
body must contain `<!-- codex-workday-bilingual-blog -->`, and its complete diff
may contain only paired `content/en/blog/<slug>/index.md` and
`content/zh-cn/blog/<slug>/index.md` files. The automation must never use an
administrator bypass, force-push, rebase, or delete the long-lived branch.

`chatgpt` 分支专用于工作日双语博客任务。PR 正文必须包含
`<!-- codex-workday-bilingual-blog -->`，完整 diff 只能包含 slug 一致、成对出现的
中英文博客 `index.md`。自动化不得使用管理员绕过、强推、rebase，也不得删除该
长期分支。

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

## Release checklist / 发布检查清单

- The change is linked to an Issue and validated through a protected PR; changes
  outside the narrowly scoped blog automation remain human-reviewed.
- `main` is the exact source being released.
- Hugo build, Sites lint, and Sites tests pass.
- No generated `public/`, `sites/generated/`, cache, key, password, or token is committed.
- No Sites credential appears in a remote URL, Git configuration, file, or log.
- `/version.json` reports the released full SHA after deployment.
- Canonical English and Chinese routes return successful responses.

中文检查重点：Issue 与 PR 完整、发布源必须是准确的 `main`、Hugo 与 Sites 检查
全部通过、没有提交生成文件或凭据、线上版本接口返回发布 SHA、中英文核心路径正常。
