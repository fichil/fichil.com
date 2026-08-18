---
title: "Repairing Store Downloads Across Service Proxy and CDN Paths"
date: 2026-08-18
draft: false
tags: ["windows", "proxy", "winhttp", "delivery-optimization", "troubleshooting"]
categories: ["DevOps"]
description: "Diagnose a Store catalog that works while installation fails: align service proxy state, measure the content path separately, and recover only the proven stuck delivery item."
---

A Windows Store page loaded normally, yet starting an installation produced a generic retry message. The foreground application and the installation service were observing different network state. The desktop session used a working local proxy, while the service-level WinHTTP configuration still referenced an old loopback endpoint that no longer had a listener.

Correcting that mismatch restored catalog and licensing requests. A second failure then appeared: the large package download remained fixed at the same byte count even though direct and proxied probes to its content host were both fast. The completed repair separated these two incidents, routed large Microsoft CDN transfers directly, and rebuilt only the verified stuck Delivery Optimization item. The package then downloaded, installed, and reached a healthy final state without enabling a system-wide tunnel.

## A working catalog did not prove the installer path was healthy

The initial symptom tempted a broad Store reset. That would have changed cache, registration, and account state before identifying the failing boundary. The useful evidence came from comparing the network consumers:

| Consumer | Observed role | Relevant state |
| --- | --- | --- |
| Store foreground | Display catalog and product page | Current user proxy |
| Installation service | Acquire catalog and license data | Machine-level WinHTTP proxy |
| Delivery Optimization | Transfer large content | WinHTTP policy, CDN route, task state |

Microsoft describes WinHTTP as suitable for services and notes that it does not share the browser's cookies, cache, or credentials. WinINet, by contrast, inherits the user's Internet Options configuration for desktop applications ([About WinHTTP](https://learn.microsoft.com/en-us/windows/win32/winhttp/about-winhttp), [About WinINet](https://learn.microsoft.com/en-us/windows/win32/wininet/about-wininet)). A healthy browser or Store page therefore cannot establish that a service using WinHTTP has the same usable proxy.

The local event sequence made the split concrete. The installation service recorded a connection failure through a stale loopback proxy. A request through the currently listening proxy reached the same catalog class successfully. Store packages, licensing services, and the application-container loopback exemption were otherwise healthy.

This evidence supported one narrow first change: align WinHTTP with the current local proxy while retaining the existing bypass rules. It did not support re-registering every Store package, changing region settings, clearing all caches, or enabling a full-tunnel adapter.

## Inspect and change the service proxy explicitly

Windows exposes the effective WinHTTP configuration through `netsh`. Microsoft documents `show proxy`, `set proxy`, `import proxy`, and `reset proxy` as separate operations ([netsh winhttp](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/netsh-winhttp)). Inspection should come first:

```powershell
netsh winhttp show proxy
```

The endpoint must also be tested. A syntactically valid proxy entry can still point to a closed local port. In this case, the saved endpoint had no listener, while the current endpoint accepted connections and returned a successful catalog response.

The repair used an elevated, explicit `set proxy` operation with a generic structure like this:

```powershell
netsh winhttp set proxy `
  proxy-server=loopback:port `
  bypass-list="localhost;<local>"
```

Real endpoint values should be discovered from current state and kept out of public logs. Importing user settings can be appropriate in a managed environment, but it should not be assumed to preserve a carefully designed service bypass list.

After the change, readback confirmed that WinHTTP used the listening endpoint. The user proxy, local proxy client, loopback exemption, and tunnel state did not change. A fresh Store request moved past the earlier connection failure and entered the download pipeline.

## Treat slow transfer as a separate incident

Passing the catalog boundary did not complete the installation. The transfer advanced only to a small, fixed fragment and then stopped. Repeating the request reused the same item and the same byte count.

The investigation compared three signals instead of attributing every delay to the proxy:

1. a bounded direct download from the actual Microsoft content host;
2. the same bounded request through the current local proxy;
3. Delivery Optimization's live item progress and connection activity.

Direct and proxied probes reached similar healthy throughput. The background item, however, made no progress and at one point had no active external transfer. Bandwidth policy inspection found no restrictive foreground limit. This combination ruled out a general ISP bottleneck and made a stuck delivery item the leading explanation.

Microsoft recommends using `Get-DeliveryOptimizationStatus` during Store-download troubleshooting and checking download mode, cloud reachability, and peer or content activity ([Troubleshoot Delivery Optimization](https://learn.microsoft.com/en-us/windows/deployment/do/delivery-optimization-troubleshoot)). The command provided a task-level view that the Store progress indicator could not:

```powershell
Get-DeliveryOptimizationStatus
```

Field availability varies by Windows build, and the command may require an elevated shell. Relevant output includes status, file size, HTTP and peer byte counters, and connection activity. The diagnostic goal is stable: identify one file item, observe whether its received-byte counters change, and correlate that state with real connections and event timestamps.

## Split control traffic from large content transfers

The working route policy kept Store catalog and licensing requests on the local proxy while allowing the documented Microsoft download CDN classes to connect directly. This preserved the path required for control-plane reachability and removed an unnecessary hop from large payload delivery.

The split also respected a protocol detail. Microsoft notes that Windows Update downloads use partial range requests and that proxies on the path must permit HTTP range transfers ([Windows Update proxy troubleshooting](https://learn.microsoft.com/en-us/troubleshoot/windows-client/installing-updates-features-roles/windows-update-issues-troubleshooting)). A small test request can succeed while a long-running or resumed range transfer behaves poorly. Measuring both paths against the real content host is more informative than assuming all HTTP success responses represent equivalent download behavior.

Refreshing Delivery Optimization and the installation queue under the new routing policy was safe and reversible, but it still reused the same frozen fragment. That result narrowed the remaining fault to the item state. It also prevented a false success report based only on updated proxy configuration.

## Recover one proven item, not every cache

The final recovery targeted the single download item whose identity, total size, cached byte count, and repeated non-progress state had already been established. The operation removed only its temporary fragment and then recreated the same installation request. Other Store applications and Windows Update content were left untouched.

That scope matters because a global Store reset or full Delivery Optimization cache purge destroys evidence and can interrupt unrelated downloads. Item-scoped cleanup still requires care: stop the relevant services in a guarded operation, confirm the target belongs to the failed request, remove only the verified temporary state, and ensure each service returns to its expected running state before resubmitting.

After the item was rebuilt, its byte counter immediately moved beyond the previous ceiling. Sustained transfer reached roughly the rate measured by the earlier path probes, then the workflow moved from download to deployment. The package manager returned success, the installed package reported a healthy state, and the Store recorded completion with a zero result code.

## Verification covered every changed boundary

The final checks proved more than “the progress bar moved”:

- WinHTTP readback showed the current service proxy and intended CDN bypasses.
- The old connection-error class did not recur after the fix.
- The rebuilt delivery item passed its former fixed byte count and continued with active transfer.
- The package completed deployment and reported a healthy installed state.
- The Store completion event reported success.
- The user proxy and application-container exemption remained intact.
- The local proxy process was not restarted, and no full-tunnel adapter was enabled.

These checks separate configuration correctness, transfer recovery, installation completion, and scope preservation. Stopping at any earlier signal would leave a different failure class unverified.

## Limits

This method applies when evidence shows a stale service proxy or one Delivery Optimization item that repeatedly reuses frozen state. Corporate PAC files, authenticated proxies, TLS inspection, endpoint security, MDM policy, metered networks, and peer-caching policy can produce similar symptoms with different causes. A direct CDN bypass may also violate an organization's network policy and must be reviewed before use on managed devices.

Do not copy signed download URLs, local proxy endpoints, account identifiers, package identities, or cache paths into tickets or public posts. Signed URLs are temporary credentials, and local paths can expose personal or organization details.

The reusable diagnostic sequence is to inventory each network consumer, align the stale service state, measure control and content paths independently, observe item-level progress, and apply the smallest recovery that the evidence supports. A Store page, a successful probe, a moving progress bar, and a completed installation each prove a different boundary.
