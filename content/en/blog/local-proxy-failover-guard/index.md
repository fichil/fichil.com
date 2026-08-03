---
title: "Recovering a Failed Automatic Proxy Group with a Local Failover Guard"
date: 2026-08-01
draft: false
tags: ["proxy", "failover", "sing-box", "windows", "reliability"]
categories: ["DevOps"]
description: "How request-based health checks, bounded local control, and explicit ownership turned a stale automatic proxy group into a recoverable connection path."
---

An automatic proxy group appeared to have plenty of usable nodes, yet the selected group sometimes reported failure and stopped carrying traffic. Choosing the row with the smallest displayed latency did not solve the problem consistently. Some positive latency values were old, while the proxy core maintained a separate view of current URL-test health.

The repair added a small local failover guard around the existing client. It did not rewrite subscriptions, replace the proxy core, or change the system proxy. The guard stayed passive while real requests worked, took temporary control after repeated failures, and returned control after the automatic group recovered.

## Separate display history from runtime health

The first useful finding was that one screen exposed two different kinds of evidence:

- per-node latency rows recorded by the desktop client;
- live health and selection state maintained by the proxy core.

A positive number in the first set did not prove that the same node could currently serve a proxied request. Several rows retained earlier measurements even when their latest checks had timed out or returned an unexpected response. The automatic group could therefore fail while the interface still showed apparently healthy alternatives.

The generated runtime configuration also omitted explicit URL-test settings. The sing-box [URLTest documentation](https://sing-box.sagernet.org/configuration/outbound/urltest/) defines the resulting defaults: a Google connectivity-check URL, a three-minute interval, 50 milliseconds of tolerance, and a 30-minute idle timeout. Those defaults are sensible for general automatic selection, but they do not promise the smallest displayed latency or fast recovery from every short-lived outage.

This changed the objective. The useful signal was successful traffic through the local proxy, not the most attractive cached number in the interface.

## Add a guard without replacing the automatic group

The guard used a small state machine:

```text
automatic -> suspected -> temporary -> recovering -> automatic
```

While in `automatic`, it sent two lightweight connectivity checks through the actual local proxy. Either expected success response kept the connection healthy. One failed round moved the state to `suspected`; a successful next round cleared the suspicion. Only consecutive failed rounds allowed a recovery attempt.

Recovery then followed a bounded sequence:

1. discover the running client and its generated runtime configuration;
2. require the control endpoint to use a loopback address;
3. ask the runtime for fresh candidate delays;
4. try successful candidates in measured order;
5. verify real proxied requests immediately after each switch;
6. keep the current selection and back off if no candidate passes.

sing-box documents that a [Selector](https://sing-box.sagernet.org/configuration/outbound/selector/) is controlled through the Clash API. Its [Clash API configuration](https://sing-box.sagernet.org/configuration/experimental/clash-api/) also defines the REST controller and optional authentication. The guard used that existing local control surface and refused non-loopback controllers. It never edited the generated configuration that the desktop client could overwrite during a restart or subscription refresh.

## Track who owns the current selection

Automatic recovery can easily become another source of instability if it fights a deliberate manual choice. The guard therefore recorded whether the temporary selection belonged to the guard.

- If the guard selected a fallback, it could later test and restore the automatic group.
- If the user selected a node manually, the guard stopped changing the selector.
- Returning to the automatic group explicitly returned ownership to normal monitoring.

The recovery path also required a stable period before switching back. A single successful check could not immediately undo a fallback and create oscillation. Repeated success from the automatic group was required before the guard released its temporary selection.

## Keep the failure handler less privileged than the proxy

The implementation discovered runtime values instead of hard-coding installation directories or local ports. It validated that every control address was local, used a named mutex to prevent multiple monitor instances, and kept only bounded status and rotated diagnostic logs.

A per-user logon task started the monitor with limited privileges. Microsoft’s [scheduled-task principal documentation](https://learn.microsoft.com/en-us/powershell/module/scheduledtasks/new-scheduledtaskprincipal) distinguishes the `Limited` run level from `Highest`; the monitor needed only the current user's local process and file access, so elevation would have widened the failure boundary without helping recovery.

The guard also treated an absent or restarting proxy client as a wait condition. It did not modify operating-system proxy settings, subscription storage, or the client's database when discovery temporarily failed.

## Verify state transitions, then verify the real path

The final verification used several independent layers:

- sixteen deterministic tests covered discovery, URL encoding, candidate ordering, consecutive-failure thresholds, empty scans, manual-choice protection, and automatic-group recovery;
- a dry run discovered a substantial set of currently reachable candidates without changing the selector;
- a controlled exercise switched to a measured candidate, confirmed both connectivity-check responses through the proxy, and restored the automatic group;
- restarting the desktop client proved that the monitor rediscovered the new client and core processes;
- the system proxy value, subscriptions, runtime database, and generated configuration remained unchanged.

These checks established more than process uptime. They verified the state machine, the control boundary, and the traffic path that users actually depend on.

## Limits and reusable lessons

This guard improves recovery when a healthy candidate still exists and the local control API remains available. It cannot repair an expired subscription, a provider-wide outage, a broken network below the proxy, or a disabled control interface. The timeout and failure thresholds also need to reflect how much switching delay and connection churn a workload can tolerate.

The reusable pattern applies beyond desktop proxies:

1. distinguish cached presentation data from current runtime health;
2. require repeated failures before taking control;
3. verify the real request path after every recovery action;
4. record whether automation or a person owns the current state;
5. release temporary control only after sustained recovery;
6. keep the control channel local, bounded, and least-privileged.

A mature automatic group remains useful for routine selection. A small external guard supplies the missing failure semantics without taking permanent ownership of the system.
