---
title: "When a Windows Excluded Port Range Blocks an IDE Debugger"
date: 2026-08-29
publication_date: 2026-08-29
slug: "windows-excluded-port-debugger-bind-failure"
draft: false
tags: ["windows", "intellij-idea", "debugging", "tcp", "tomcat", "troubleshooting"]
categories: ["Tooling"]
description: "Diagnose an IDE server that builds successfully but stops before deployment because its debugger cannot bind a Windows-excluded TCP port."
ai:
  schema_version: 1
  problem: "An IDE-managed application server completed its build but stopped before deployment because the debugger could not bind its configured TCP port."
  symptoms:
    - "Compilation and artifact preparation completed, yet the application server never reached deployment."
    - "The IDE reported an address-in-use error for the debugger listener."
    - "A later process query found no ordinary listener on the configured port."
  evidence:
    - "Time-aligned IDE logs placed the bind exception after the build and before server deployment."
    - "Windows reported that the configured debugger port fell inside an excluded TCP port range."
    - "After selecting a port outside the current dynamic and excluded ranges, the debugger connected and the application route returned a successful response."
  root_cause: "The debugger used a fixed TCP port that Windows had reserved in an excluded range, so the IDE could not create its listening socket even when no normal process appeared to own that port."
  resolution_steps:
    - "Use the IDE log timeline to separate build, debugger bind, server start, and artifact deployment stages."
    - "Check both live port ownership and the current Windows dynamic and excluded TCP ranges."
    - "Select a free development port outside those ranges and change only the debugger port in the run configuration."
    - "Restart the debug configuration and verify debugger connection, server listeners, deployment completion, and the application route."
  verification:
    - "The IDE log recorded the debugger listening and connecting on the replacement port."
    - "The application server reached deployment and its canonical local route returned HTTP 200."
    - "A separate server instance remained available throughout the repair."
    - "No business source, database setting, or service-discovery configuration changed."
  limitations:
    - "Dynamic and excluded port ranges are machine state and must be queried again instead of copied from this case."
    - "An address-in-use error can also come from a live process; both ownership and exclusions must be checked."
    - "A successful startup does not resolve unrelated exceptions that occur later in background application work."
  applies_to:
    - "Windows workstations running IDE-managed local application servers"
    - "JVM debugger and other fixed development-listener bind failures"
  keywords: ["Windows excluded port range", "debugger bind failure", "Address already in use", "IntelliJ Tomcat", "netsh excludedportrange"]
---

An IDE-managed application server finished compiling and preparing its artifact, but the server never reached deployment. The decisive message was not a compiler error. It was a debugger listener failure: the configured address could not be bound because it was already in use.

The usual explanation is that another process owns the port. This case was different. By the time the port was inspected, no ordinary listener existed. Windows nevertheless reported the configured value inside an excluded TCP port range. Changing only the debugger port restored the full startup path.

The reusable lesson is to treat port availability as more than a process-list question. On Windows, a fixed development listener must also avoid the machine's current dynamic and excluded ranges.

## Place the failure on the startup timeline

IDE application-server launches cross several distinct stages:

```text
compile sources
  -> build artifact
  -> bind debugger socket
  -> start application server
  -> deploy artifact
  -> serve application route
```

JetBrains documents that a local Tomcat run/debug configuration builds and deploys artifacts and exposes a **Port** field for the debugger under **Startup/Connection** ([Tomcat run/debug configuration](https://www.jetbrains.com/help/idea/run-debug-configuration-tomcat-server.html)). That makes the debugger port a separate prerequisite between a successful build and a running server.

In the failed run, the IDE log contained three useful facts:

- compilation and artifact preparation had completed;
- the debugger then raised `Address already in use: bind`;
- no later server-start or deployment-complete marker appeared.

This sequence ruled out application compilation as the immediate blocker. It also explained why changing business code, database settings, or the deployed artifact would not address the observed boundary.

## Check ownership, dynamic allocation, and exclusions separately

A port can be unsuitable for a fixed listener for more than one reason. The checks should answer three different questions.

First, does a live process currently own the port?

```powershell
Get-NetTCPConnection `
  -LocalPort <debug-port> `
  -ErrorAction SilentlyContinue
```

Second, what dynamic client range is active on this machine?

```powershell
netsh interface ipv4 `
  show dynamicport tcp
```

Microsoft documents this `netsh` query and notes that modern Windows uses a high default dynamic client range, while also allowing that range to be changed ([Windows dynamic TCP port range](https://learn.microsoft.com/en-us/troubleshoot/windows-server/networking/default-dynamic-port-range-tcpip-chang)). A value inside the dynamic range may still bind. It remains a poor fixed-listener choice because the operating system may allocate it for another connection.

Third, has Windows explicitly excluded the port?

```powershell
netsh interface ipv4 `
  show excludedportrange `
  protocol=tcp
```

The failed debugger port appeared in one of the returned excluded intervals. That observation resolved the apparent contradiction: a normal process query could be empty while a bind attempt still failed. The Windows `bind` API documents `WSAEADDRINUSE` as the error when the specified address and port cannot be bound ([Winsock `bind`](https://learn.microsoft.com/en-us/windows/win32/api/winsock2/nf-winsock2-bind)). The log and the current exclusion table together identified why this address was unavailable in this run.

## Make the smallest configuration change

The repair did not require stopping another healthy server or changing application configuration. It changed only the debugger's fixed port:

1. Query the current dynamic and excluded TCP ranges.
2. Choose an unowned development port outside both sets.
3. Update **Run/Debug Configurations → Startup/Connection → Debug → Port**.
4. Keep the server's HTTP, management, deployment, JVM, and application settings unchanged.
5. Start the configuration in Debug mode again.

Choosing a familiar low port without checking it is still an assumption. The safe choice is the result of the current machine queries, followed by an ownership check immediately before restart.

## Verify every downstream boundary

A connected debugger is necessary, but it is not the final acceptance condition. The repaired run was verified in order:

1. The IDE log recorded the debugger listening and connecting on the replacement port.
2. A new application-server process used the intended server instance and exposed its expected listeners.
3. The IDE marked the artifact deployment as complete.
4. The canonical local application route returned `HTTP 200`.
5. The separate server instance that had already been running remained healthy.
6. Repository status showed no new business-source changes.

This sequence proves more than “the red message disappeared.” It proves that the bind repair allowed the startup chain to cross deployment and reach the user-visible route without disturbing an adjacent runtime.

## Keep later runtime errors out of the root cause

After deployment, a background application task logged an unrelated exception. The server continued running and the verified route remained available. That later event was recorded as a separate runtime issue rather than folded into the original startup failure.

Time order matters here. An exception after a completed deployment cannot explain why an earlier run stopped before the debugger bound its socket. Combining them would enlarge the change scope and weaken the diagnosis.

## Limits

Excluded ranges can change after operating-system, networking, virtualization, or container configuration changes. A port that works today is not a permanent machine-wide guarantee. Re-query the current state whenever the same symptom returns.

Also, not every `Address already in use` error means an exclusion. A live listener, a second IDE instance, or a previous server process may own the port. The durable method is the combination: align the log timeline, inspect live ownership, inspect Windows port policy, change the smallest configuration surface, and verify the real application boundary.
