---
title: "Tracing Dubbo Connection Refused to a Container Memory Failure"
date: 2026-07-07
lastmod: 2026-07-29
draft: false
tags: ["dubbo", "docker", "java", "oom", "troubleshooting"]
categories: ["DevOps"]
description: "A Dubbo connection failure investigation that moved from the deepest network exception to a stopped provider container and its memory limits."
---

An application repeatedly logged a Dubbo RemotingException whose deepest cause was Connection refused. The stack trace included business interfaces, proxy classes, and retry workers, which made request parameters and client code look like plausible starting points.

The transport error was much more specific. Connection refused means the target was reachable at the network layer, but nothing accepted the TCP connection on that port. That is different from a timeout, a DNS failure, or a business response.

## Start with the deepest cause

The investigation followed the runtime path outward:

1. Identify the final host and port used by the consumer.
2. Check whether any process is listening on that port.
3. Inspect whether the provider container is running, restarting, or stopped.
4. Compare service-registry state with the real container state.
5. Read the container's most recent exit reason and final logs.

The provider was not stable. After it exited, consumers continued using the previously published address, so scheduled reconnects produced a stream of connection refusals. Dubbo was reporting the failure correctly; it was not the component that caused it.

## Why the container disappeared

Container history and runtime logs pointed to memory pressure. The Java heap settings, container memory limit, and available host memory did not leave enough room for the complete process. Under load, the container was terminated.

Restarting it restored the port temporarily but kept the same failure condition. A durable correction had to respect two boundaries:

- The JVM maximum heap must leave space inside the container for metaspace, thread stacks, direct buffers, native libraries, and the operating system.
- Updated Compose or orchestration limits only affect a recreated container. Editing configuration and issuing a plain restart may keep the old resource settings.

After adjusting the memory budget, the service was force-recreated so the new configuration actually applied. Re-pulling the image was unnecessary because the image content itself had not changed.

## Verify the full recovery

A green container status was not enough. Verification included:

- the provider port was listening again;
- the Dubbo consumer established a new connection;
- service discovery matched the actual instance;
- the Java process survived sustained load without another memory termination;
- affected pages and APIs recovered;
- connection-refused messages stopped repeating.

RPC errors are often the first visible symptom of a deeper runtime failure. When the root cause says Connection refused, prove that the service exists before changing business code. Connecting the transport error to the listener, container exit reason, and resource policy usually produces a faster and more reliable diagnosis.
