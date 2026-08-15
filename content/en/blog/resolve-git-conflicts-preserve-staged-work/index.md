---
title: "Resolving Git Conflicts Without Overwriting Staged Work"
date: 2026-08-15
draft: false
tags: ["git", "merge-conflicts", "staging", "version-control", "verification"]
categories: ["DevOps"]
description: "Treat the Git index as protected state: inspect unmerged stages, resolve only the conflicted path, and prove that unrelated staged work remains unchanged."
---

A repository appeared to have one ordinary conflict, but its state carried two different kinds of unfinished work. One configuration path had multiple unmerged entries in the Git index. A separate source file already contained an intentional staged change. There was no active merge, rebase, or cherry-pick to explain the conflict or provide a safe blanket abort operation.

The risky response would have been a broad reset, restore, or checkout. Any of those could have made the status output look simpler while also removing the unrelated staged work. The completed repair treated the index as protected state, resolved only the unmerged path, and verified both the conflict result and the pre-existing staged change. No commit or push was needed.

## The status line described two independent states

The first inspection separated three views of the repository:

- `HEAD`: the last committed snapshot;
- index: content prepared for a future commit;
- working tree: files currently on disk.

Git defines the index, also called the staging area, as a stored version of the working tree. During conflict resolution, one path in the index can hold multiple entries instead of one. That makes the index durable pending work, not disposable command output ([Git glossary](https://git-scm.com/docs/gitglossary.html)).

The sanitized repository had one unmerged runtime-configuration path, one independently staged application path, and no unstaged changes.

The absence of an active operation mattered. A conflict can remain in the index after the surrounding command or tool state has disappeared. An interface label such as “merge changes” does not prove that `MERGE_HEAD`, rebase metadata, or a cherry-pick sequence still exists. The index itself was the authoritative evidence.

## Read the unmerged stages before choosing content

`git ls-files --unmerged` reports only unmerged paths and includes their stage numbers. Git documents up to three entries for one unmerged path: stage 1 is the common ancestor, stage 2 is one side, and stage 3 is the other side ([git-ls-files](https://git-scm.com/docs/git-ls-files)).

```sh
git ls-files --unmerged
git show :1:file
git show :2:file
git show :3:file
```

The familiar labels “ours” and “theirs” are convenient only when the operation context is clear. Rebase and other workflows can make those names easy to misread. Inspecting the actual stage contents avoids selecting a whole side from a label alone.

In the completed case, one side repeated settings that were already present on the other side. The selected result kept the complete configuration block, retained its useful annotations, and removed conflict markers and duplicate keys. Sensitive values were compared locally and never copied into review notes or public evidence.

## Protect the index before editing one path

Before the edit, the staged file list and the unrelated staged diff were recorded read-only. This created a comparison point without changing repository state:

```sh
git diff --cached --name-status
git diff --cached -- file
```

The Git documentation states that `git diff --cached` compares the index with `HEAD`; it therefore shows what the next commit would contain, independent of additional working-tree edits ([git-diff](https://git-scm.com/docs/git-diff.html)).

The repair then changed only the conflicted file. After its intended content was clear, one path-scoped command replaced that path's multi-stage index entries with the resolved working-tree version:

```sh
git add -- conflicted-file
```

`git add` updates the index with the named path's current content. The path scope is the safety boundary: it marks that conflict resolved without staging every modified file in the repository ([git-add](https://git-scm.com/docs/git-add)).

Commands such as `git add -A`, a repository-wide restore, or a reset were unnecessary. They would have expanded the change surface beyond the one path whose desired content had been established.

## Verification must prove preservation as well as resolution

An empty conflict list proves only that Git no longer has unmerged entries. It does not prove that the intended content survived or that unrelated staged work remained intact. The final checks covered all three claims:

1. `git ls-files --unmerged` returned no paths.
2. A literal conflict-marker scan found no marker lines in the resolved file.
3. Each effective configuration key appeared once.
4. `git diff --cached --name-status` still listed exactly the resolved path and the previously staged path.
5. The unrelated staged diff matched the read-only snapshot taken before editing.
6. `git diff --cached --check` succeeded.

The last command warns about newly introduced conflict markers and whitespace errors, and exits unsuccessfully when it finds them ([git-diff](https://git-scm.com/docs/git-diff.html)). It is a useful final guard, but it cannot decide whether the chosen business configuration is correct. That decision still requires reading the competing stages and the surrounding file.

The scope explicitly stopped before commit and push. A clean index shape was the requested deliverable; publishing the staged snapshot would have been a separate authorization.

## Why broad recovery commands are dangerous here

Many Git recovery recipes assume the index contains only the failed operation. That assumption was false in this case. The independent staged source change was valid work that had to survive.

A safer sequence is to inventory `HEAD`, the index, and the working tree; identify unmerged paths and operation metadata; read the stages for one conflicted path; edit and stage only that path; and compare the complete index with the saved inventory.

This sequence scales beyond a two-file example. The more developers use partial staging, IDE Git integrations, or long-lived local work, the less safe it becomes to treat the entire index as temporary conflict debris.

## Limits

Text comparison is insufficient for binary conflicts, rename/delete cases, submodule entries, and generated files. Those cases need type-specific validation before staging a resolution. Line-ending conversion and clean/smudge filters can also make working-tree bytes differ from indexed bytes; the final comparison should use Git's indexed view when exact preservation matters.

If the conflict contains credentials or private endpoints, do not paste stage contents into an Issue, chat, or CI log. Compare them locally and publish only a neutral conclusion. If the intended version cannot be established from the available evidence, leave the path unmerged and ask the owner instead of guessing.

The reusable rule is to treat the index as a pending snapshot with its own ownership boundary. Inventory it first, resolve the smallest proven path, and finish only after the conflict is gone **and** every unrelated staged change is still exactly where it began.
