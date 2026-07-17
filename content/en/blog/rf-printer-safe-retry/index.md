---
title: "Reliable RF Label Printing on a Lossy Network"
date: 2026-07-02
draft: false
tags: ["android", "rf", "printing", "network", "reliability"]
categories: ["Mobile Engineering"]
description: "How I diagnosed interrupted RF label batches and added per-label delivery with a retry boundary that avoids duplicate prints."
---

A warehouse RF device repeatedly stopped halfway through a batch of package labels. The same printer behaved normally from a desktop computer, which initially made the template, printer buffer, and Android implementation all look suspicious.

The useful evidence came from three places: application send logs, the exact label where the batch stopped, and network quality from the RF device to the printer. Several labels completed their TCP connection and write successfully, while the next label failed during connection setup. At the same time, packet loss from the RF device increased sharply even though the desktop path remained stable.

The failing label was not malformed. The wireless hotspot path briefly stopped accepting new connections while the printer was processing earlier jobs.

## Why one large write was fragile

The original implementation joined every label into one large byte sequence and sent the entire batch over one connection. That was easy to implement, but it created an ambiguous recovery problem. If the connection failed, the client could not safely determine how many labels the printer had accepted. Retrying the whole payload could print earlier labels twice.

The first improvement was to render every label as a complete standalone printer job and send the jobs sequentially. Each label received its own connection and log entry. A failure could now be associated with one specific job instead of an opaque batch.

That change improved observability but did not eliminate the interruption. A field retest still showed several successful labels followed by a connection timeout. The remaining requirement was a retry policy that understood external side effects.

## Defining the safe retry boundary

The important question is not simply whether an exception occurred. It is whether the client had started writing bytes:

- A timeout or refusal before the connection is established can retry the same label after a delay.
- A failure after writing has started must not retry automatically. The printer may have accepted the job even if the client did not receive a clean completion signal.
- Each label has a fixed attempt limit. Exhausting it stops the batch with a precise error instead of looping indefinitely.

I also increased the connection window, added a pause between labels, and delayed the final success callback so the device could finish consuming its queue. Logs now include the job position, attempt number, whether the failure is retryable, and whether any data was written.

## Verification

The change was built and installed on the physical RF device. Verification included more than checking the UI success message:

1. Logs had to show every job in order from the first label to the last.
2. A weak connection had to retry only the affected label during connection setup.
3. Failures after writing began had to remain non-retryable.
4. Single-label and multi-label batches, quantity synchronization, and unrelated print paths had to retain their previous behavior.

The broader lesson is that reliability is not achieved by increasing timeouts alone. Break a batch into observable units, then define retries around the moment an external side effect may have happened. That produces a system that is both more resilient and less likely to create duplicate physical output.
