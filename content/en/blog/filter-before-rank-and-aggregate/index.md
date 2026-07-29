---
title: "Filter Before You Rank and Aggregate: Taking a 27-Second Query Down to About One Second"
date: 2026-07-27
lastmod: 2026-07-29
draft: false
tags: ["oracle", "sql", "performance", "pagination", "query-optimization"]
categories: ["Backend"]
description: "How moving selective business filters ahead of window functions and dependent aggregates cut a paginated Oracle query from 27.49 seconds to about 1.40 seconds."
---

A paginated operations screen took 27.49 seconds to return ten kilobytes of data. The small response ruled out payload transfer as the main problem, and the browser timing alone could not explain whether the delay came from rendering, application code, or the database.

The useful clue was that one page load executed two expensive statements: a count query for pagination and a data query for the ten visible rows. Database statistics showed that the count averaged about 21.3 seconds and read roughly 4.48 million buffer blocks. The data query needed another 7.8 to 9.0 seconds. Together, they accounted for nearly the entire observed request time.

## Evidence before rewriting

The SQL assembled several derived datasets before it knew which orders the user could actually see. It ranked a large circulation-history table with a window function, aggregated detail and inspection records, and only then applied the selective filters for organization, project, recent order date, and optional search fields.

That order of operations made a ten-row page misleading. Pagination limited the final output, but it did not limit the work performed by the upstream common table expressions. The database still processed broad historical sets twice: once for the total count and again for the page data.

A nearby summary query provided a useful control. It first selected the relevant recent orders and then joined dependent data. Under the same environment, that query completed in well under one second. The difference supported a predicate-placement problem rather than a general network or database-capacity problem.

## Root cause

The root cause was not simply “missing indexes” or “too many joins.” High-selectivity business predicates were attached to the final result instead of to the input of the expensive operations.

This distinction matters for three SQL patterns:

- window functions must rank every row that reaches their input;
- aggregates must read and group every matching detail row;
- pagination count queries repeat most of that work even though they return only one number.

When filtering happens after those operations, the optimizer may not be able to push every predicate through complex joins, optional conditions, and window expressions. The result is a logically correct plan with a needlessly large working set.

## Candidate-set-first rewrite

The rewrite introduced a `filtered_orders` common table expression as the boundary of the query. It applies tenant scope, business ownership, the default recent-date window, and advanced filters before any expensive ranking or aggregation.

Every dependent dataset then joins to that candidate set:

1. select the order identifiers that satisfy the request;
2. rank circulation records only for those orders;
3. aggregate package, inspection, and detail facts only for those orders;
4. assemble the existing response fields and status rules;
5. preserve the existing sort and pagination behavior.

The same structure was applied to both inbound and outbound queries. Unused joins were removed only where they contributed no selected field or filter. No database definition, API parameter, controller, response type, or front-end behavior changed.

This is more than a cosmetic CTE refactor. The candidate set limits later operations to the orders already selected, so the amount of data being processed cannot accidentally expand back to the full historical tables.

## Verification

The optimized mappings passed XML parsing and a Java 8 build before runtime testing. The locally deployed application then executed the same read-only production queries used for the baseline.

For the inbound path:

- the browser request fell from 27.49 seconds to 1.40 seconds, about a 94.9% reduction;
- three consecutive database measurements completed in approximately 1.320, 0.750, and 0.602 seconds for the combined core statements;
- the median was about 0.750 seconds;
- count-query buffer reads dropped by about 98.9%;
- data-query buffer reads dropped by about 94.8%.

For the outbound path, three runs all returned the expected ten rows, with the two core statements averaging about 1.18 seconds together.

The verification deliberately separated browser time from database time. A faster screenshot was encouraging, but repeated database measurements proved that the improvement came from less work rather than a single warm-cache result.

## Lessons and limits

`LIMIT`, `ROWNUM`, or another pagination wrapper constrains returned rows, not necessarily rows processed. When a query contains window functions, large aggregates, or an expensive count companion, inspect where the selective predicates enter the plan.

A useful optimization sequence is:

1. measure count and data statements separately;
2. identify the smallest stable business key set for the request;
3. join expensive derived datasets to that set before computing them;
4. preserve response semantics and compare repeated results;
5. consider indexes only after the working set and join shape are correct.

This approach works best when the request has genuinely selective scope, such as tenant, organization, date, or exact identifiers. It is less useful for intentionally unbounded analytical queries. Optional search conditions also need regression coverage because moving them earlier can change null handling or one-to-many semantics if the original query relied on late joins. Performance is not accepted until totals, ordering, field values, and edge-case filters remain equivalent.
