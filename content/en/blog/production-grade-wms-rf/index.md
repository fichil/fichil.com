---
title: "Building a Production-Grade WMS RF Application"
date: 2026-07-16
lastmod: 2026-07-21
draft: false
tags: ["wms", "rf", "ionic", "capacitor", "idempotency"]
categories: ["System Design"]
description: "A WMS RF migration centered on warehouse-scoped identity, shared domain rules, idempotent writes, offline recovery, and native printing."
---

Migrating an old WMS RF application is not a matter of resizing pages for a phone. The RF client is a warehouse execution endpoint that directly changes inventory, task, and device state. It must handle identity, warehouse isolation, concurrent task claims, uncertain networks, and physical hardware.

The new client used Ionic Vue and Capacitor so PWA and Android builds shared business code. Existing WMS domain services remained the only workflow state machine. The mobile API focused on authenticated scope, task orchestration, scan validation, idempotency, and responses designed for handheld use.

## Put warehouse scope in the identity

The identity service gained an RF operator role and warehouse grants. The authenticated token carries the warehouses available to the operator, and backend code resolves the actor from the security context.

Requests cannot choose an arbitrary company or warehouse. A warehouse switch is accepted only when it belongs to the server-side grant set. Modifying a mobile request therefore cannot expose or mutate another warehouse's tasks.

## Idempotency and exclusive task claims

RF devices often operate on unreliable wireless networks. When a confirmation returns no visible response, users naturally press the button again. Without idempotency, the same inventory or workflow mutation may run twice.

Every write uses a stable idempotency key, and a timeout keeps that key for the retry. Task claiming uses exclusion and version checks so two devices cannot successfully claim the same work. The mobile layer does not duplicate inventory rules; it calls the existing domain service so web and RF paths share state transitions and transaction boundaries.

## Offline does not mean fake success

The client preserves drafts, scan results, and pending operations. A transport failure can enter a synchronization queue, while a business validation failure remains immediately visible. A version conflict requires refreshed data and an explicit user decision before retry.

The scanning layer normalizes camera scans, hardware input, and manual entry and applies short-window deduplication. Attachment size and count are limited, and a request timeout does not discard work already entered by the operator.

## Native printing behind an adapter

The Android build includes a network-printing plugin for server-produced PDF or printer data. The plugin exposes a small contract to the Vue application, allowing most workflows to run in a browser when physical equipment is unavailable.

Printing, scanning, and permission handling are all wrapped in native adapters instead of being embedded in business pages. Replacing a printer or scanner can therefore be contained within the adapter layer.

## Layered verification

The gates covered backend module tests, client unit tests, browser smoke tests, TypeScript production builds, Capacitor synchronization, Android unit tests, and Debug APK assembly. The delivery also included a migration matrix, privacy and permission documentation, a parallel-cutover guide, and dedicated smoke tooling.

All software gates passed, while physical RF and printer checks remained explicit field acceptance items. Automated validation can prove API, state, and build behavior, but it cannot substitute for scan latency, wireless quality, and printed output on the actual device.

A production RF application is defined less by its page count than by its guarantees: every scan and confirmation is traceable, retryable without duplication, and permanently constrained to the operator's warehouse scope.
