---
title: "Verifying Cross-Module Business Flows with Database Reconciliation"
date: 2026-07-17
lastmod: 2026-07-29
draft: false
tags: ["integration-testing", "database", "flyway", "smoke-test", "logistics"]
categories: ["Quality Engineering"]
description: "An end-to-end logistics-platform acceptance run using real services, controlled test data, state history, and database reconciliation."
---

Passing module tests and frontend builds does not prove that a platform's business flows work from start to finish. A logistics transaction may cross identity, master data, warehousing, transportation, carrier assignment, billing, yard operations, and OpenAPI. A missing transaction boundary, state mapping, or event consumer can leave every individual module green while the end-to-end flow fails.

The goal of this acceptance run was not to repeat existing tests. It was to build a reproducible end-to-end smoke-test suite and reconcile the database result of every step.

## Protect the data before performing real writes

The current database was fully backed up before the first write, with checksums and schema metadata recorded. Every new business identifier used a run-specific prefix. Update and delete scenarios were restricted to data created by the same run.

Test records were retained for later inspection. The tooling generated optional cleanup SQL but did not execute it automatically. A separate empty schema verified that every Flyway module could migrate from zero, and that temporary schema was removed after the check.

## Orchestrate the complete domain set

One runner covered:

- users, roles, and data scope;
- master-data create, update, activation, and reference constraints;
- inbound, putaway, inventory, outbound, wave, picking, and shipping;
- transport orders, dispatch, carrier assignment, execution, exception, and delivery;
- rating, bills, invoices, payment, and reconciliation;
- appointment, arrival, queue, dock, and departure;
- multi-domain OpenAPI, idempotent replay, and tenant isolation.

External ERP, map, push, and hardware dependencies used simulations or contract checks. An unavailable third party should not determine whether the platform's own workflow is internally correct.

## Defects found only at runtime

Real writes exposed issues that static verification had missed: incorrect wave relationships, an inventory uniqueness conflict, ambiguous SQL columns, missing mobile permissions, incompatible time formats, and protected-field handling in OpenAPI.

Each defect was diagnosed in the order of request evidence, database state, cross-service calls, and legacy behavior. Fixes remained minimal. Previously applied migrations were never edited; database changes were introduced through new module-owned Flyway versions.

## Acceptance must reconcile database state

An HTTP 200 response was not considered sufficient. Every flow reconciled header and detail records, state history, audit entries, idempotency records, and outbox events. Consistency checks confirmed that the run introduced no orphan relationships, duplicate business documents, or failed migrations.

The final validation also included:

- the complete backend clean verification;
- web and mobile tests, type checks, and production builds;
- browser end-to-end scenarios;
- Android unit tests and APK builds;
- migration of a brand-new database;
- health and registration checks for the restored service stack.

At completion, every domain smoke scenario passed, database consistency checks reported no violations, the service stack was healthy again, and worktrees contained only intended commits.

Migration completion should be supported by reproducible evidence: workflows reach their final state, failed paths preserve consistency, repeated requests do not repeat writes, database records reconcile, and services can restart cleanly. Combining automated scenarios with database facts is what confirms that a cross-module flow works end to end.
