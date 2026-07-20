# Deprecated Deployment Notes

This document is kept only as a historical reference.

The active deployment guide is now maintained at:

```text
/deployment.md
```

Do not use the old manual deployment steps that were previously documented here.

Current project rule:

1. Make changes on the `chatgpt` branch.
2. Open a pull request into `main`.
3. Wait for manual review and merge.
4. Let GitHub Actions validate the updated `main` commit.
5. Let the weekday 10:00 Asia/Shanghai Codex task publish the validated commit to ChatGPT Sites.

Manual `scp`, manual `rsync`, or direct server-side deployment should not be used for normal website updates. The VPS workflow is an explicitly confirmed emergency rollback path only.

Use the root-level `deployment.md` as the source of truth.

---

# 已废弃的部署说明

本文档仅作为历史参考保留。

当前有效的部署说明已维护在：

```text
/deployment.md
```

不要继续使用这里旧的手动部署步骤。

当前项目规则：

1. 在 `chatgpt` 分支修改。
2. 创建 Pull Request 到 `main`。
3. 等待手动审核并合并。
4. `main` 更新后由 GitHub Actions 验证对应提交。
5. 每个工作日北京时间 10:00 由 Codex 定时任务把通过验证的提交发布到 ChatGPT Sites。

普通网站更新不应再使用手动 `scp`、手动 `rsync` 或直接服务器部署。VPS workflow 仅作为明确确认后的紧急回退入口。

以根目录 `deployment.md` 作为唯一可信部署说明。
