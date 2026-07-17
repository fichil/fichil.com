---
title: "When a Production Dashboard Shows Zero Despite Having Data"
date: 2026-07-13
draft: false
tags: ["oracle", "sql", "performance", "wms", "aggregation"]
categories: ["Backend Engineering"]
description: "Replacing full-detail loading with database aggregation after a production dashboard timed out and left every counter at its initial zero."
---

An order-status dashboard worked in the test environment but showed zero for every inbound, outbound, and workflow counter in production. The page list contained many orders, and read-only database checks confirmed recent activity. Zero was not the business result; it was the value left behind when the summary request did not finish successfully.

## The difference was not an index

The old endpoint calculated each counter through several extremely large paginated queries. It loaded detail rows into Java and grouped them in memory. The paging framework also executed a count query for each request, so one dashboard refresh produced a sequence of expensive statements.

The implementation appeared acceptable against the small test database. The production workflow table was several orders of magnitude larger, and individual queries took from the high teens to more than twenty seconds. Running several of them serially exceeded the page's practical waiting time.

The frontend had no explicit failure state, so its initialized zero remained visible. The result looked exactly like valid empty data.

Index definitions and statistics did not reveal an environment-specific defect large enough to explain the behavior. The algorithm simply did not scale with production volume.

## Move the calculation back to the database

I added dedicated inbound and outbound aggregate queries:

1. Filter target orders by company, warehouse, order time, and page conditions first.
2. Restrict workflow and detail processing to those orders.
3. Calculate distinct order totals and workflow-node counts in one database operation.
4. Return a single aggregate row without an extra paging count.
5. Return numeric zero explicitly when no records match.

The endpoint path, request parameters, and response fields stayed unchanged, so callers required no migration.

The frontend also stopped refreshing summary counters on ordinary page navigation. Filters, tab changes, and explicit refreshes still request a new summary. A failed request now displays a placeholder and an actionable message instead of pretending that the value is zero.

## Read-only reconciliation

The old and new SQL were compared with the same filters and, for the strictest check, inside the same read-only snapshot. Individual legacy queries took roughly twenty-four seconds. The aggregate versions usually returned in under one second while producing the same distinct totals and node counts.

Additional cases covered:

- exact order-number lookup;
- advanced filters;
- a future range with no records;
- orders without workflow history;
- the existing small test dataset.

Every production verification used SELECT-only access. No production data or running service was modified.

The broader lesson is that zero can be a default state, a valid state, or a failed state. Summary APIs should calculate summaries directly, and clients must distinguish a real zero from an unsuccessful request. A full-detail approach that works in a tiny test database can still be structurally unsuitable for production.
