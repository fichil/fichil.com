---
title: "Optimizing a Slow MySQL Wave List Query: From Index Tests to a SQL Rewrite"
date: 2026-05-22
lastmod: 2026-07-21
draft: false
tags: ["mysql", "sql", "performance", "explain", "wms"]
categories: ["Backend Engineering"]
description: "How I investigated a slow WMS list query, reverted ineffective index attempts, and validated a much faster query structure."
---

A wave planning list in a WMS application took about six seconds to return one page of results. This note records the investigation path and the evidence behind the final optimization direction.

Identifiers and environment details have been anonymized. The SQL shape, measurements, and decisions are based on the actual debugging session.

## Query symptoms

The page queried wave headers, joined detail rows and outbound order headers, aggregated OMS order numbers and Homebase values, joined user names, and looked up a loading timestamp. It then grouped the expanded result, sorted it by creation time, and returned 50 records.

The runtime filters included a modification-time range plus organization and project conditions, while ordering by creation time.

This combination matters: the query was doing aggregation and sorting before it had reduced the dataset to the 50 headers needed by the page.

## Inspecting indexes first

I started by checking the indexes already available on the header, detail, and order-header tables. The detail-to-order joins already had usable composite indexes. I also found two header-table indexes with exactly the same column order, so I removed one duplicate index to reduce maintenance overhead on writes.

That cleanup was valid, but it did not explain the multi-second read time. The list query already had an indexed path for its normal creation-time ordering.

## Testing an index for the loading-time subquery

The original SQL contained a correlated lookup equivalent to:

```sql
SELECT FM_LD_TIME
FROM wm_ld_header
WHERE DEF1 = WWH.WAVE_NO
  AND ORG_ID = WWH.ORG_ID
LIMIT 1;
```

A candidate index on organization and the wave reference field was tested. Before keeping it, I checked the data distribution. The result was unexpected: the reference field used by the subquery was null for every row in the table.

The execution plan then confirmed that MySQL still scanned the loading table for the dependent subquery rather than using the tested index. Because the index did not improve the actual plan, it was removed.

The useful conclusion was more important than the failed index attempt: this loading-time expression returned no value for the current dataset while still adding repeated query work.

## Testing an index for the real time filter

The log showed filtering on `MODIFY_TIME`, so I tested a composite header index starting with organization, project, and modification time. Its statistics looked reasonable, but the real list query still preferred the existing creation-time path.

I compared actual durations instead of relying on assumptions:

| Variant | Path | Duration |
| --- | --- | ---: |
| A | Optimizer choice | 6.859s |
| B | Existing creation-time index forced | 6.225s |
| C | New modification-time index forced | 7.433s |

The new index was slower for this request and was removed. This was the turning point: another index was not going to solve this page.

## Reading the execution plan

The execution plan showed that detail and order-header joins were already cheap indexed lookups. The expensive signs were elsewhere:

- the header result used a temporary table and filesort while aggregating details;
- a dependent loading-time subquery scanned over ten thousand rows;
- only after this work did the query return a 50-row page.

The real issue was the order of operations: aggregate first, page later.

## Rewriting the query structure

The successful test query reversed that order:

1. Filter and sort the wave header table first.
2. Select only the 50 header rows needed on the page.
3. Aggregate OMS order numbers and Homebase values only for those selected waves.
4. Return an empty loading-time value until the correct data relationship is confirmed.

The essential structure was:

```sql
SELECT
    WWH.JOB_ID,
    WWH.WAVE_NO,
    (SELECT GROUP_CONCAT(...) FROM wm_wv_detail ... WHERE ... = WWH.WAVE_NO) AS OMS_ORDER_NO,
    (SELECT GROUP_CONCAT(DISTINCT ...) FROM wm_wv_detail ... WHERE ... = WWH.WAVE_NO) AS HOMEBASE_IDS,
    NULL AS FM_LD_TIME
FROM (
    SELECT *
    FROM wm_wv_header
    WHERE MODIFY_TIME BETWEEN :from_time AND :to_time
      AND ORG_ID = :org_id
      AND PROJECT_ID = :project_id
    ORDER BY CREATE_TIME DESC
    LIMIT 50
) WWH
ORDER BY WWH.CREATE_TIME DESC;
```

This does not mean subqueries are automatically faster than joins. The improvement came from reducing the candidate headers before doing one-to-many aggregation.

## Measured result

I ran the rewritten test query three times with query caching disabled:

| Run | Duration |
| --- | ---: |
| 1 | 0.006605s |
| 2 | 0.006195s |
| 3 | 0.006315s |

The average was about `0.00637s`. Compared with the better original measurement of `6.225s`, the tested query structure was about 977 times faster for this filter pattern.

## A rollout constraint: do not hardcode page 1

The test placed `LIMIT 50` inside the header-only subquery. That location is the reason the aggregation work became small.

The application currently lets its query framework wrap the statement for paging. A real implementation cannot simply hardcode `LIMIT 50` in a Hibernate mapping, because that would break later pages and may affect exports. Pagination parameters need to reach the inner header query, or the paging mechanism needs to be adjusted so headers are paged before their detail aggregation.

Before release, the rewritten query must be checked for default listing, status filters, order-number searching, page navigation, exports, and bilingual UI paths where applicable.

## One separate correctness issue

The original query also appeared to join the modifier display name through the creator field. That should be fixed separately from the performance refactor, because it changes returned data and should be reviewed as its own bug fix.

## Conclusion

The investigation path was straightforward but important:

```text
Find the real slow query in logs
→ inspect existing indexes
→ test and remove ineffective candidate indexes
→ use EXPLAIN and timings as evidence
→ page header rows before aggregating details
```

The performance gain did not come from adding more indexes. It came from making the database aggregate only the rows that the page actually needed.
