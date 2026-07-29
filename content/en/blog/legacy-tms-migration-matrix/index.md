---
title: "Migrating a Legacy TMS with a Capability Matrix and Real Smoke Tests"
date: 2026-07-15
lastmod: 2026-07-29
draft: false
tags: ["tms", "migration", "spring-boot", "ionic", "testing"]
categories: ["System Design"]
description: "A legacy transportation-system migration organized around capability mapping, end-to-end business flows, idempotency, and runtime verification."
---

A legacy TMS migration can easily confuse visible navigation with completed business behavior. The old application contained order, dispatch, carrier, execution, exception, proof-of-delivery, tracking, tendering, reporting, finance, and mobile workflows. Copying menus and page shells would not prove that any of those workflows could reach a valid final state.

The migration began with a capability matrix and then moved through complete business flows. Every old entry had to be classified as migrated, merged, replaced, or deliberately dropped, with a new route, API, state machine, and acceptance scenario. An unclassified page could not be counted as complete.

## Organize work around the business chain

Implementation batches followed the actual transport lifecycle:

~~~text
Transport order
→ task and dispatch
→ carrier assignment or tender
→ pickup, transit, and exception
→ delivery and POD
→ charges, reconciliation, and invoice
~~~

Each action required an explicit state transition, authorization boundary, and duplicate-request policy. The client was not allowed to choose company, driver, or supplier identity through request fields. Those scopes came from the authenticated server context.

Write operations used idempotency keys. The same key with the same payload returned the original result; the same key with different content returned a conflict. Mobile retries could therefore recover from uncertain network outcomes without creating duplicate tasks, locations, or finance records.

## One set of interface rules for web, PWA, and Android

The administration UI gained real operational pages and aligned Chinese and English resources. The mobile application used Ionic Vue and Capacitor so the PWA and Android versions shared business code for authentication, assignments, execution, exceptions, POD, tracking, notifications, and settlement.

The offline queue distinguished transport failures, business rejections, and version conflicts. Attachments uploaded before the business request, which referenced stable file IDs. GPS data was batched and deduplicated. A 401 triggered one token refresh, while ordinary 4xx responses remained visible business failures instead of being disguised as offline success.

Legacy private plugins, historical secrets, and proprietary authorization mechanisms were intentionally excluded. Native capabilities used configurable adapters and remained clearly disabled when production map, push, or signing configuration was unavailable.

## Verification went beyond compilation

Automated checks covered the full backend test suite, open-source boundary checks, frontend type checking and production builds, mobile tests, Capacitor synchronization, and Android APK assembly.

The decisive validation started isolated service instances and executed a real smoke flow:

- create and advance a transport order;
- verify dispatch constraints and carrier tendering;
- replay idempotent requests;
- submit and deduplicate tracking points;
- generate reports and finance resources;
- replay an OpenAPI request;
- inspect final database state.

Runtime validation exposed a URL interpolation defect in the smoke script. It was not a product-service bug, but unit tests alone would never have found it. After correcting the script, the complete flow was rerun from the beginning before the isolated services were stopped and module commits were finalized.

The completion criterion for a legacy migration should not be code volume or menu count. Every old capability needs an explicit destination, critical workflows must reach valid final states, retries and failures must be explainable, and the database result must be verifiable. The migration matrix controls scope; the runtime smoke test confirms that the workflow actually reaches its final state.
