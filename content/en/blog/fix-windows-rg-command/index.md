---
title: "Repairing a Broken `rg` in Windows PowerShell"
date: 2026-08-19
lastmod: 2026-08-19
draft: false
tags: ["windows", "powershell", "rg", "command-line", "troubleshooting"]
categories: ["DevOps"]
description: "A practical fix for `rg` not found in PowerShell, from path diagnosis to verification with safe rollback guidance."
---

On Windows, `rg` is a great replacement for `findstr` and grep-like workflows, but the command can suddenly disappear after client upgrades or environment changes.

In one workstation pass-through case, PowerShell kept returning `rg : The term 'rg' is not recognized as the name of a cmdlet...`, even though ripgrep had been used previously. The key issue was that `rg.exe` was no longer discoverable by PATH for the current shell.

## What broke

The session showed three layers of risk:

1. A missing `rg.exe` binary in the active shell lookup path.
2. A previous workaround that assumed a fixed local path.
3. No robust pre-check before the command chain resumed automation workflows.

Because this was a user-shell capability issue, the fix had to avoid risky side effects on startup scripts and process state.

## Resolution steps

### 1) Reinstall and verify ripgrep package source

I reinstalled the official WinGet package:

```powershell
winget install --id BurntSushi.ripgrep.MSVC --source winget
```

Then I verified hash and version from the package install to avoid partial or tampered state.

### 2) Confirm command availability in both fresh and current sessions

After install, I checked:

```powershell
rg --version
```

Then I opened a fresh PowerShell session and reran the same command to ensure path refresh and executable visibility were complete.

### 3) Run operational validation with real commands

I executed safe checks using the terminal workflow that originally failed, including:

- `rg -n "配音与字幕稿.md"` for a real UTF-8 file name;
- recursive directory listing and text search commands;
- return-code checks to ensure exit code remained `0` for expected success paths.

### 4) Keep rollback explicit

The operation stays reversible with a clear one-line rollback:

```powershell
winget uninstall --id BurntSushi.ripgrep.MSVC --exact
```

No registry proxy settings or repository files were changed.

## Why this fix is safe

This was treated as a commandability recovery task, so the verification chain was scoped to command behavior rather than process-level restart or global network settings. That minimizes blast radius:

- no service restarts were introduced;
- no startup scripts were edited;
- no repository changes were made;
- the system can return to its previous state in one command if needed.

## Takeaway

For Windows CLI issues, the highest-confidence repair sequence is:

1) install / repair from trusted source,
2) verify in both existing and fresh shells,
3) validate real commands end-to-end,
4) keep a clearly documented rollback path.

That order is usually faster and safer than repeatedly changing environment-specific assumptions.
