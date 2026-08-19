---
title: "修复 Windows PowerShell 中 rg 命令失效"
date: 2026-08-19
lastmod: 2026-08-19
draft: false
tags: ["windows", "powershell", "rg", "命令行", "故障排查"]
categories: ["DevOps"]
description: "记录一次 Windows 下 `rg` 突然失效的恢复过程：路径修复、双会话验证与可回滚操作。"
---

在 Windows 下，`rg`（ripgrep）是非常常用的文本搜索工具，但在客户端升级、环境改动后，它可能突然从 PowerShell 的可执行搜索路径中消失。

这次是一次比较典型的“只报 command not found”问题：PowerShell 返回 `rg : The term 'rg' is not recognized...`，却难以快速判断是软件没装、PATH 失效，还是会话缓存导致。

## 问题点

从现场行为看有三类风险点：

1. 当前会话无法发现 `rg.exe`；
2. 之前处理方案依赖了固定路径，缺少迁移弹性；
3. 后续执行链条未加入足够的命令可用性兜底。

因此修复策略是将重点放在“命令恢复 + 结果验证 + 可回退”。

## 处理步骤

### 1）重新安装官方包并校验

通过 WinGet 安装官方包：

```powershell
winget install --id BurntSushi.ripgrep.MSVC --source winget
```

安装后核验版本和安装来源，确认不是本地残留路径错误或损坏状态。

### 2）验证当前会话与新会话

在当前窗口执行：

```powershell
rg --version
```

然后再打开一个新的 PowerShell 会话重复执行，确认路径刷新与命令可见性一致。

### 3）用真实任务验证行为

基于原失败链路执行了实际命令检查，包括：

- `rg -n "配音与字幕稿.md"`；
- 递归目录枚举与文本搜索；
- 关注真实退出码（成功路径为 0）。

### 4）保留回滚路径

可恢复操作为：

```powershell
winget uninstall --id BurntSushi.ripgrep.MSVC --exact
```

未触及仓库文件、启动项、代理配置和其他持久化流程。

## 为什么这是低风险修复

这次只做命令可用性修复，不引入服务重启、不改写启动行为，回归风险较低：

- 不新增服务重启动作；
- 不改动启动脚本；
- 不改仓库受控文件；
- 不影响现有业务任务，便于回退。

## 总结

遇到 Windows CLI 工具“突然不可用”，建议按顺序执行：

1）可信源重新安装（或修复）；
2）当前 + 新开会话双向验证；
3）用真实命令与真实退出码做端到端验证；
4）提前记录可回退命令。这样更快回到稳定状态，也更容易解释给团队。
