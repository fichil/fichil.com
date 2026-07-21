---
title: "Launching Codex Without TUN Using the Current Windows Proxy"
date: 2026-07-14
lastmod: 2026-07-21
draft: false
tags: ["codex", "powershell", "proxy", "windows", "automation"]
categories: ["DevOps"]
description: "Making a Codex desktop launcher resilient to local proxy port changes while keeping failure handling safe."
---

I use a desktop shortcut to launch Codex through a local proxy without enabling TUN mode for the whole machine. After an application and proxy-client upgrade, the shortcut stopped launching Codex and provided no useful error.

Codex itself was installed correctly. The launcher and a global configuration override both contained an old fixed proxy port, while the proxy client had moved to another local port. The launcher failed its preflight check and exited before starting the application.

## Stop guessing the port

The revised PowerShell script selects a proxy in this order:

1. an explicit Proxy argument supplied by the user;
2. the current Windows user proxy;
3. a clear error when neither provides a valid endpoint.

Windows may store one simple host-and-port value or protocol-specific HTTP and HTTPS values. The script normalizes both forms but accepts only loopback endpoints, preventing an unexpected remote proxy from being injected silently.

Before starting or restarting Codex, it verifies that the selected local port is listening. Parsing and connectivity failures therefore happen before any existing Codex process is stopped. A bad setting cannot take down a working session.

## Keep the change process-scoped

The detected endpoint is applied to HTTP_PROXY, HTTPS_PROXY, and ALL_PROXY for the new Codex process, with NO_PROXY retained. The launcher does not permanently modify registry proxy settings or user-level environment variables.

I also removed the global Codex configuration that forcibly set the old port while preserving normal environment inheritance. Without that change, a correct value from the launcher would still be overwritten later.

The small batch-file entry point now preserves its window when PowerShell returns a nonzero status, making the error visible. It closes normally after a successful launch.

## Verification and operating boundary

The safe verification sequence included:

- PowerShell syntax and configuration parsing;
- a dry run that resolved the current proxy without changing processes, registry values, or user environment variables;
- an unbound-port test that failed clearly and left Codex running;
- an OpenAI reachability request through the local proxy;
- a safe launch without restart that created live connections to the proxy;
- parsing of protocol-specific Windows proxy syntax.

I deliberately did not perform a full restart during the active task because that would have terminated the session used to make the fix.

The desktop shortcut did not need to change, and future local port changes no longer require editing the script. The real improvement was not replacing one hard-coded port with another. It was treating the port as runtime state, validating every prerequisite before side effects, and keeping a currently working process alive when validation fails.
