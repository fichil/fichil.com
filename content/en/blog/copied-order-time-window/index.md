---
title: "Why a Copied Outbound Order Disappeared from the Default Dashboard"
date: 2026-07-06
draft: false
tags: ["wms", "java", "sql", "data-integrity", "debugging"]
categories: ["Backend Engineering"]
description: "How inherited audit timestamps made a newly copied outbound order invisible to a time-windowed dashboard."
---

A newly created outbound order could be found by its exact order number, but it did not appear when the default order-status dashboard opened. The API returned no authorization or warehouse-scope error, so the behavior initially looked like a missing SQL condition or stale cache.

Comparing the two query paths exposed the important difference. The exact search used a unique business identifier. The default dashboard also applied a recent-time window. The record had a new order number and a valid initial status, but its creation timestamp belonged to the older order it had been copied from.

## The bug was in copy semantics

The copy operation reused a source header and its detail records. Reusing business fields was intentional, but lifecycle and audit fields were copied as well, including creation and modification timestamps.

The result was a contradictory entity:

- its order number was new;
- its workflow state was the initial state of a new order;
- its timestamps described an old order;
- the default dashboard excluded it through its recent-time filter;
- an exact-number query still found it because that path did not depend on the date window.

This also explained why normal order creation worked and only the copy path failed.

## Fixing the domain boundary

When copying a domain object, template data and entity identity must be treated differently. The fix explicitly cleared creation and modification timestamps on both the new header and new detail records before persistence. The normal creation path could then assign the current lifecycle timestamps.

A defensive fallback also filled the current time if a creation path still produced an empty value. This ensured that dashboards, workflow-duration calculations, and reports all used the new order's own temporal baseline.

I did not widen the dashboard's default date range. The query correctly represented the page requirement. The defect was the new record carrying historical metadata that did not belong to it.

## Verification

The verification covered three layers:

1. A copied header and its details received current creation and modification times.
2. The new order appeared in the default dashboard without an exact-number search.
3. Initial workflow duration started at the copied order's creation time instead of inheriting elapsed time from the source.

The general lesson is that copying an entity is not the same as cloning an object. Primary keys, business numbers, audit fields, versions, state history, and timestamps usually define the identity of the new record and must be rebuilt. If they are copied blindly, the write may succeed while time-windowed views, SLA calculations, and audit trails treat the new record as old data.
