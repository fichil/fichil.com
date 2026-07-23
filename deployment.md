# Deployment Guide / 部署说明

## Production model / 生产模型

- Production URL / 生产地址: `https://fichil.com/`
- Source repository / 源码仓库: `https://github.com/fichil/fichil.com`
- Production source / 生产源码: GitHub `main`
- Production runtime / 正式运行环境: ChatGPT Sites (`sites/`)
- Mainland China availability mirror / 中国大陆可用性镜像: BandwagonHost Hugo mirror
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

## Mainland China mirror / 中国大陆镜像

ChatGPT Sites remains the default runtime. AWS Route 53 geolocation records may
return the BandwagonHost IPv4 address for DNS queries classified as mainland
China while returning the existing Sites records everywhere else.
`cn.fichil.com` is the explicit mirror address for clients whose recursive DNS
resolver is misclassified. DNS geolocation is best effort; BandwagonHost is
still an overseas host and is not a mainland availability guarantee.

ChatGPT Sites 仍是默认运行环境。AWS Route 53 可以对识别为中国大陆的 DNS
查询返回 BandwagonHost IPv4，其他地区保持现有 Sites 记录。当递归 DNS
解析器地域识别不准确时，用户可直接访问 `cn.fichil.com`。板瓦工仍是境外
主机，本方案是最佳努力的第二路径，不是大陆稳定性承诺。

The mirror polls every ten minutes but does not publish the latest repository
head directly. It reads the live Sites `/version.json`, requires that commit to
be contained in `origin/main`, requires a successful `Site Build Check` push run
for the exact SHA, initializes the pinned theme submodule, and builds Hugo from
a detached worktree. A new release is activated with an atomic symlink only
after the bilingual HTML, RSS, sitemap, and version files pass smoke checks.

镜像每 10 分钟检查一次，但不会直接发布仓库最新 HEAD。它只跟随线上 Sites
`/version.json` 报告的提交；该提交必须属于 `origin/main`，并且与成功的
`Site Build Check` push 运行 SHA 完全一致。Hugo 在脱离 worktree 中构建，中英文
HTML、RSS、sitemap 与版本文件通过冒烟检查后，才以原子软链接切换新版本。

Use `fichil-mirrorctl status` and `fichil-mirrorctl list` for inspection.
`fichil-mirrorctl rollback <sha>` atomically restores a retained release and
creates a hold so the timer cannot immediately overwrite the rollback. Run
`fichil-mirrorctl resume` only after the incident is resolved. Route 53 health
checks fall back to the default Sites record when the mirror is unhealthy.

使用 `fichil-mirrorctl status` 与 `fichil-mirrorctl list` 检查镜像状态。
`fichil-mirrorctl rollback <sha>` 会原子回退到保留版本并自动暂停定时更新；只在
故障处理完成后运行 `fichil-mirrorctl resume`。镜像健康检查失败时，Route 53
回退到默认 Sites 记录。

The deployment assets are maintained under `deploy/bandwagon/`. GitHub Actions
checks their syntax but holds no SSH, AWS, or certificate credential. The
server pulls the public repository and the certificate renewer uses a
least-privilege Route 53 identity stored only on the server.

Do not run the geolocation `--apply` step until `cn.fichil.com` has a valid
certificate, the Route 53 health check is healthy, and direct HTTPS probes from
mainland China succeed. The final script requires the explicit
`MIRROR_CHINA_PROBE_APPROVED=YES` gate. If regional probes fail, leave the
default Sites records unchanged.

## Release checklist / 发布检查清单

- The change is linked to an Issue and validated through a protected PR; changes
  outside the narrowly scoped blog automation remain human-reviewed.
- `main` is the exact source being released.
- Hugo build, Sites lint, and Sites tests pass.
- No generated `public/`, `sites/generated/`, cache, key, password, or token is committed.
- No Sites credential appears in a remote URL, Git configuration, file, or log.
- `/version.json` reports the released full SHA after deployment.
- Canonical English and Chinese routes return successful responses.
- The mirror `/version.json` matches Sites before geolocation records are enabled.
- The default Route 53 records still point to Sites and the complete previous DNS zone is recoverable.

中文检查重点：Issue 与 PR 完整、发布源必须是准确的 `main`、Hugo 与 Sites 检查
全部通过、没有提交生成文件或凭据、线上版本接口返回发布 SHA、中英文核心路径正常。
