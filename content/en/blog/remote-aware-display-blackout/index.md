---
title: "Making an Unattended Windows Display Blackout Remote-Aware"
date: 2026-08-11
draft: false
tags: ["windows", "automation", "remote-access", "state-machine", "reliability"]
categories: ["DevOps"]
description: "A remote-aware display guardian uses connection events, local input, cancellable deadlines, and fail-closed evidence to keep an unattended Windows workstation dark without interrupting active remote work."
---

An unattended Windows workstation may need to keep builds, scheduled jobs, and remote-access services running around the clock while leaving its physical display dark. A generic idle timer seems sufficient until the machine is controlled remotely. Remote keyboard and pointer events can wake the display, and an idle rule can darken it again while the operator is still working.

A sanitized workstation exposed both failures. Manual blackout worked, yet activity from the remote-control client could immediately restore the visible desktop. A global idle timer also lacked the context needed to distinguish an abandoned desk from a live remote session.

The durable fix was a remote-aware state machine. It treated local input, remote connection events, startup grace, disconnect grace, and manual requests as separate signals with explicit precedence. The resulting soft blackout reduced brightness, placed a black full-screen surface over every display, hid the pointer, and waited for new input while the Windows session and background processes remained active.

## The symptom was a missing state model

The first implementation reacted to elapsed idle time. That single number could not answer the operational questions that mattered:

- Is a remote operator connected now?
- Did the last remote session just close?
- Has someone used the physical keyboard since the disconnect?
- Is this the one-time unattended-startup window?
- Did a person explicitly request immediate blackout?

The same idle duration could therefore represent several incompatible states. Triggering on time alone risked interrupting remote work. Disabling the timer avoided that interruption but left the physical display lit after a session ended.

The root cause was incomplete control input. Display policy needed connection lifecycle and local-input evidence, not only an inactivity counter.

## Use observable events with clear precedence

The guardian followed the remote-control client's append-only connection log. It parsed connection and disconnection markers, kept an active-session count, and stored only the cursor and runtime state needed to continue safely.

| Signal | State transition |
| --- | --- |
| Remote connection opens | cancel pending blackout deadlines and suppress the one-time startup action |
| Last remote connection closes | arm a short post-remote deadline and record the current local-input tick |
| Local input changes before the deadline | cancel that pending blackout |
| Remote connection returns before the deadline | cancel the deadline and resume remote-active state |
| Deadline expires with no connection or local input | enter soft blackout with reason `PostRemoteDisconnect` |
| Manual request arrives | enter soft blackout immediately |

Precedence kept the transition deterministic. An active remote connection always cancelled an automatic deadline. New local input also cancelled the post-remote deadline. Only the absence of both signals allowed the timer to fire.

The one-time startup rule used the same pattern. A new boot armed one deadline. Local input cancelled it for the rest of that boot, while a remote connection superseded it. This prevented an ordinary idle timer from repeatedly darkening a workstation that a person had already started using.

## Pause automation when its evidence disappears

Connection logs can rotate, appear late, or become temporarily unreadable. Treating an unreadable log as “no remote session” would turn missing evidence into permission to black out the display.

The guardian therefore paused automatic deadlines whenever the log was unavailable. It emitted a bounded warning, followed a rotated file by identity, and resumed only after the event source was readable again. Manual blackout remained available because it did not depend on an inferred remote state.

This is a small fail-closed rule with a wide use: when an automated side effect depends on external state, missing observations should suspend that side effect rather than be interpreted as the safest-looking state.

## Keep blackout reversible and observable

Entering blackout saved the current brightness before changing it. The guardian then set brightness to its minimum, opened borderless black topmost windows across all displays, hid the pointer, and recorded that blackout was active. It watched the system's last-input tick instead of consuming keyboard or mouse events itself.

When input changed, a `finally` path closed every overlay, restored the pointer and saved brightness, cleared the active flag, and logged the transition. On startup, the guardian also checked for stale blackout state so an interrupted process would not leave brightness permanently reduced.

The runtime state file was evidence, not the only source of truth. Status checks paired it with the recent transition log and the guardian process. That avoided declaring success from a stale `BlackoutActive` value after a crash.

## Verification covered the parser and a real disconnect

Deterministic self-tests exercised connection-marker parsing, appended log data, log rotation, a log that appeared after startup, scheduled-task arguments, the current-boot state, and the display/power prerequisites. Syntax and single-instance checks also passed.

The decisive verification came from a live, sanitized disconnect:

1. the final remote connection closed;
2. the guardian armed a 30-second deadline;
3. no local input or reconnect cancelled it;
4. the deadline triggered `PostRemoteDisconnect`;
5. soft blackout entered at the recorded time;
6. a later status read still showed blackout active while background work continued.

That sequence proved the full event-to-side-effect boundary. Unit tests showed that the parser and state transitions could work; the live run showed that the real client log, deadline, display action, and persisted status agreed.

## Limits

This pattern relies on stable, interpretable connection events from the selected remote-control client. A client update that changes its log format must fail closed and trigger a parser update. Concurrent sessions also require a count or unique connection identities; a single Boolean can black out after one of several sessions disconnects.

Soft blackout is a privacy and disturbance control, not a security boundary. The Windows session remains unlocked so foreground automation can continue, and a local input event restores the display. Workstations in untrusted physical locations still need an appropriate lock policy, disk encryption, and a separate decision about whether unattended UI automation is acceptable.

The reusable conclusion is to model display blackout as a cancellable state transition. Bind it to observable remote lifecycle events and local input, pause it when evidence disappears, make restoration unconditional, and verify one real disconnect from event through visible state.
