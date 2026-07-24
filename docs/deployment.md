# Deprecated Deployment Notes

This document is kept only as a historical reference.

The active deployment guide is now maintained at:

```text
/deployment.md
```

Do not use the old manual deployment steps that were previously documented here.

Current project rule:

1. Use `chatgpt` only for the weekday bilingual blog; use a dedicated branch for other changes.
2. Open a pull request into `main`.
3. Wait for manual review and merge.
4. Let GitHub Actions validate the updated `main` commit.
5. Let the weekday 10:00 Asia/Shanghai Codex task publish the validated commit to ChatGPT Sites.

Manual `scp`, manual `rsync`, and direct replacement of production files remain
deprecated. The current BandwagonHost regional mirror is managed only through
the exact-SHA, atomic-release process documented in `/deployment.md`.

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

1. `chatgpt` 分支只用于工作日双语博客，其他修改使用专用分支。
2. 创建 Pull Request 到 `main`。
3. 等待手动审核并合并。
4. `main` 更新后由 GitHub Actions 验证对应提交。
5. 每个工作日北京时间 10:00 由 Codex 定时任务把通过验证的提交发布到 ChatGPT Sites。

手动 `scp`、手动 `rsync` 和直接覆盖生产文件仍属于已废弃流程。当前 BandwagonHost
地域镜像只能使用根目录 `deployment.md` 中的精确 SHA 与原子版本切换流程。

以根目录 `deployment.md` 作为唯一可信部署说明。
