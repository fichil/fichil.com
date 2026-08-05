---
title: "When an IDE Startup Probe Fails but the Application Is Healthy"
date: 2026-08-05
draft: false
tags: ["intellij-idea", "tomcat", "readiness", "proxy", "troubleshooting"]
categories: ["Production Reliability"]
description: "How a startup warning was separated from application availability by reconstructing the IDE probe, deployment timeline, proxy path, and real HTTP boundary."
---

An IDE displayed a warning that it could not open a configured application URL. A browser opened the same route successfully soon afterward, and the application was already answering real requests. The warning looked like an application failure, yet the user-visible route was healthy.

The useful question was not whether one request succeeded. The investigation had to identify what the IDE actually tested, when it tested it, and whether that control-plane check represented the application route that users depended on.

## The warning and the application described different moments

The run configuration used IntelliJ IDEA's **After launch** option with an external URL. JetBrains documents that this option starts a browser after the server and configured artifacts are launched, while the URL field selects the page to open ([Tomcat run configuration](https://www.jetbrains.com/help/idea/run-debug-configuration-tomcat-server.html)).

Four observations initially appeared inconsistent:

| Evidence | Observation |
| --- | --- |
| IDE warning | The configured external URL could not be opened during startup |
| Application log | Initialization completed, followed by normal requests within seconds |
| Independent loopback probe | The application route served only on the same machine returned `HTTP 200` |
| Independent external probe | Direct and proxied requests both returned `HTTP 200` after startup |

These results can all be true. A warning records the outcome of a bounded probe window. A browser request made later records the state of the application and network path at a later time.

## Reconstruct the probe before changing application code

The decisive evidence came from inspecting the installed IDE plugin's control flow in a sanitized diagnostic environment. The watcher checked two related targets:

1. the configured external URL intended for the browser;
2. the application server's host and HTTP listener.

Once the server listener produced a response, repeated failures of the configured browser URL were counted separately. Three consecutive failures exhausted the watcher's retry budget and produced the warning. A later successful request did not retract the already displayed message.

That detail changes the diagnosis. The warning does not prove that the application failed to build, deploy, or start. It proves that the configured browser URL did not satisfy the IDE's probe during a particular interval after the server became responsive.

## The external route added another readiness boundary

The configured URL crossed more components than the local application route:

```text
IDE startup watcher
  -> IDE proxy decision
  -> external tunnel or gateway
  -> local application route
```

The IDE was configured to auto-detect proxy settings. JetBrains documents that this mode uses the operating system's proxy settings or a proxy auto-configuration (PAC) file ([HTTP proxy settings](https://www.jetbrains.com/help/idea/settings-http-proxy.html)). The diagnostic run also confirmed that the operating system proxy was enabled.

After startup, both direct and proxied external requests succeeded. That ruled out a persistent outage, but it did not prove which earlier hop had failed. The application may still have been initializing, the external route may not yet have propagated, or the proxy path may have experienced a transient connection failure. The evidence supports a startup-probe false negative; it does not support naming one transient network cause with certainty.

## Keep separate failures separate

The same startup period contained an unrelated deployment warning about a generated artifact. Later application requests succeeded, so that warning did not explain the browser-URL message. Combining every nearby error into one cause would have produced an unsafe fix.

The investigation kept three states independent:

- **build and deployment state**: whether the artifact compiled and the application initialized;
- **application data plane**: whether the canonical route returned the expected response;
- **IDE convenience probe**: whether the configured After launch URL succeeded within the watcher's retry window.

Only evidence that crossed these boundaries could determine whether application code needed to change.

## The smallest safe handling

No application code was changed during the diagnosis. The stable options were configuration-level:

- point **After launch** at the canonical loopback application route, an address served only on the same machine and available with the local server;
- disable automatic browser opening and open the external route manually after startup;
- keep the external tunnel URL for remote clients, where its additional network boundary is intentional.

This preserves the production path and avoids hiding a real deployment failure. If the loopback route also fails after initialization, the incident is no longer a convenience-probe false negative and must return to application logs, artifact deployment, listener ownership, and route checks.

## Verify the real boundary

A reusable verification sequence is:

1. Read the run configuration and identify the exact URL, server host, listener, proxy mode, and deployed artifact.
2. Align the IDE warning with application initialization and the first successful business request.
3. Probe the canonical loopback route independently of the IDE.
4. Probe the external route through each relevant network path.
5. Inspect the probe implementation or debug logs when the warning semantics remain ambiguous.
6. Change application code only when the application boundary itself fails.

The final boundary in this case was clear: the application route returned the expected successful response, while the IDE warning remained a historical result from its startup window.

## Limits

A later `HTTP 200` cannot prove that the earlier proxy or tunnel path was healthy. It can only disprove a continuing outage. Exact attribution requires time-aligned logs or a controlled reproduction during the failure window.

The plugin behavior described here came from one installed IDE build and should be treated as version-specific evidence. The broader method is portable: identify the observer, reconstruct its retry and timing rules, then compare its control-plane result with the application's real data plane before editing code.
