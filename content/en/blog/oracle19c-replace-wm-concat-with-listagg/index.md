---
title: "Replacing WM_CONCAT with Deterministic LISTAGG on Oracle 19c"
date: 2026-09-01
publication_date: 2026-09-01
slug: "oracle19c-replace-wm-concat-with-listagg"
draft: false
tags: ["oracle", "oracle-19c", "sql", "listagg", "legacy-modernization", "troubleshooting"]
categories: ["Database"]
description: "Trace an HTTP 200 empty response to an Oracle invalid-identifier error, replace legacy WM_CONCAT calls with deterministic LISTAGG, and verify source, build, artifact, and overflow boundaries."
ai:
  schema_version: 1
  problem: "A legacy application returned HTTP 200 with an empty body because Oracle 19c rejected queries that still called WM_CONCAT."
  symptoms:
    - "The browser request completed with HTTP 200 but contained no response body or data."
    - "The backend log recorded ORA-00904 for WM_CONCAT while executing mapped SQL."
    - "The same aggregation pattern appeared in multiple XML query mappings and capitalization variants."
  evidence:
    - "A case-insensitive source scan found the complete set of legacy calls, including variants missed by the initial search."
    - "After the replacement, all affected mapping files parsed and the isolated JDK 8 multi-module build completed."
    - "A nested scan of the packaged artifact found no remaining WM_CONCAT call and found the expected LISTAGG expressions."
    - "Queries against a sanitized Oracle 19c test database kept measured aggregation results below the configured VARCHAR2 byte limit."
  root_cause: "The application still depended on the undocumented legacy WM_CONCAT aggregate, which the target Oracle 19c database did not recognize; an application exception path then converted the database failure into a misleading successful HTTP response with an empty body."
  resolution_steps:
    - "Trace the empty response through backend logs and identify the first database error instead of treating HTTP 200 as proof of success."
    - "Search SQL mappings case-insensitively and inventory every legacy aggregate before editing."
    - "Replace each call with LISTAGG using the same delimiter and a stable WITHIN GROUP ordering key, while preserving duplicates, aliases, filters, and paired list alignment."
    - "Keep overflow behavior fail-closed unless truncation is an explicit business requirement, and measure result lengths on representative data."
    - "Validate XML parsing, source scans, module builds, the packaged artifact, and live Oracle 19c queries."
  verification:
    - "Eleven affected mapping files contained 42 LISTAGG expressions and no WM_CONCAT after the source rewrite."
    - "All affected XML files parsed and the required JDK 8 module build chain completed successfully."
    - "The packaged application scan covered 935 XML entries and found no runtime WM_CONCAT reference."
    - "Representative Oracle 19c queries completed without ORA-00904 or ORA-01489, and measured values stayed within the configured limit."
  limitations:
    - "The source, build, artifact, and database compatibility boundaries were verified, but the repaired artifact was not deployed during this work."
    - "A user-visible page smoke test remains required after deployment; this article does not claim the production page is restored."
    - "LISTAGG return limits depend on MAX_STRING_SIZE and data type, so every environment must measure its own byte lengths."
    - "Truncation changes business output and must not be introduced merely to hide an overflow error."
  applies_to:
    - "Legacy Oracle applications moving to Oracle 19c"
    - "SQL stored in XML or ORM mapping files"
    - "String aggregation migrations that must preserve ordering and duplicate semantics"
  keywords: ["Oracle 19c WM_CONCAT", "ORA-00904", "LISTAGG migration", "deterministic aggregation", "ORA-01489", "HTTP 200 empty response"]
---

A browser request returned `HTTP 200`, yet the response body was empty and the page showed no data. The status code looked successful, but the backend log told a different story: mapped SQL had failed with `ORA-00904` while calling `WM_CONCAT`.

The repair was not a global text substitution. String aggregation has ordering, duplicate, delimiter, alias, and overflow semantics. A safe Oracle 19c migration had to preserve each one, prove that every runtime copy changed, and keep the final deployment boundary separate from source-level success.

## Start with the first failed boundary

The useful execution chain was:

```text
HTTP 200, empty body
  -> exception caught
  -> mapped SQL fails
  -> ORA-00904: WM_CONCAT
```

Oracle defines `ORA-00904` as an invalid identifier or column name ([ORA-00904](https://docs.oracle.com/en/error-help/db/ora-00904/)). In this run, the identifier was the legacy aggregate itself. The target Oracle 19c database did not recognize it.

That distinction matters. The empty response was not evidence that the query returned zero rows. It was a secondary behavior of the application exception path. The database error was the earliest failing boundary and therefore the right place to repair.

## Inventory every call before editing

The first search found most occurrences, but not all of them. Three capitalization variants appeared only after a case-insensitive scan. The final inventory covered eleven XML query mappings.

A useful pre-edit record includes:

- the file and query identifier;
- the expression being concatenated;
- the delimiter;
- the alias consumed by application code;
- the grouping columns and filters;
- the required output order;
- whether duplicates are significant;
- any parallel aggregates that must stay positionally aligned.

This record prevents a mechanical rewrite from silently changing a query contract. It also gives the post-edit scan an exact expected scope.

## Replace syntax while preserving semantics

The replacement pattern was:

```sql
LISTAGG(
  value_expression,
  ','
) WITHIN GROUP (
  ORDER BY stable_key
)
```

Oracle documents that `LISTAGG` orders values within each group and concatenates the measure expression. It is deterministic only when the `ORDER BY` list produces unique ordering ([Oracle 19c `LISTAGG`](https://docs.oracle.com/en/database/oracle/oracle-database/19/sqlrf/LISTAGG.html)).

The migration therefore applied five constraints.

1. **Keep the delimiter.** Existing consumers expected comma-separated values, so the replacement retained the comma.
2. **Do not add `DISTINCT`.** The legacy queries did not request duplicate elimination. Removing repeats would change visible data.
3. **Choose a stable order.** Each aggregate used the business key that already defined row order. Where one key cannot be unique, add a documented tie-breaker instead of relying on fetch order.
4. **Align parallel lists.** If one query returns a name list and a code list, both must use the same ordering key. Otherwise item positions can describe different rows.
5. **Preserve aliases and filters.** Application code still reads the old result aliases, and the original `WHERE` and `GROUP BY` logic remains part of the contract.

An outer character conversion that no longer changed the `LISTAGG` result type was removed only where it was demonstrably redundant. It was not treated as a required part of the migration.

## Treat overflow as a data-contract decision

`LISTAGG` returns `VARCHAR2` for character input. Oracle 19c documents a maximum of 4,000 bytes when `MAX_STRING_SIZE=STANDARD` and 32,767 bytes when it is `EXTENDED`. The default overflow behavior is `ON OVERFLOW ERROR`, which raises `ORA-01489`; `ON OVERFLOW TRUNCATE` deliberately returns an incomplete list ([Oracle 19c `LISTAGG`](https://docs.oracle.com/en/database/oracle/oracle-database/19/sqlrf/LISTAGG.html)).

This repair did not add truncation. A clipped identifier or name list could misrepresent business data while making the query appear successful. The safer policy was:

- measure `LENGTHB` for representative grouped results on the target database;
- compare the maximum with the actual environment limit;
- retain fail-closed overflow behavior;
- redesign the output or adopt an explicitly approved truncation contract if future growth approaches the limit.

Oracle's own 19c tutorial demonstrates both `ORA-01489` and the explicit truncation option ([avoiding `LISTAGG` overflow](https://docs.oracle.com/en/database/oracle/oracle-database/19/tutorial-avoid-errors-listagg-function/index.html)). The choice is observable application behavior, not a cosmetic SQL detail.

## Verify source, build, artifact, and database separately

The repair used independent checks because each catches a different failure mode.

### Source and XML

- A case-insensitive scan reported zero remaining `WM_CONCAT` calls.
- The eleven affected files contained 42 expected `LISTAGG` expressions.
- Every modified mapping file parsed as XML.

### Build

The required multi-module application chain compiled with its isolated JDK 8 toolchain. One historical module outside the required artifact path still had a pre-existing dependency problem; its mapping XML and SQL were inspected, but the unrelated module was not presented as newly buildable.

### Packaged artifact

The final application package was scanned recursively rather than trusting the source tree. Across 935 embedded XML entries, it contained no runtime `WM_CONCAT` reference and contained the expected packaged `LISTAGG` expressions. The source and package counts differ because not every source mapping belongs in the selected artifact.

### Oracle 19c

Representative queries ran against a sanitized Oracle 19c test database. They no longer raised `ORA-00904`, did not raise `ORA-01489`, and their measured byte lengths remained below the configured limit.

Together these checks prove query compatibility through the database and packaged-artifact boundaries. They do not prove that a deployed page is healthy.

## Keep deployment outside the completed claim

The repaired artifact was not deployed during this work. A later release still needs to verify the real page, response body, log stream, and representative data after deployment.

The precise conclusion is therefore: the legacy aggregate was removed from the affected source and packaged runtime; the replacement preserved the reviewed query semantics; the required build completed; and representative Oracle 19c queries passed identifier and overflow checks. Production recovery remains a separate acceptance step.

That boundary is as important as the SQL change. It prevents a successful compile from being reported as a successful release.
