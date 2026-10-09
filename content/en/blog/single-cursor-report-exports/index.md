---
title: "Export a Report Through One Cursor"
date: 2026-10-09
publication_date: 2026-10-09
slug: "single-cursor-report-exports"
draft: false
tags: ["java", "mybatis", "xlsx", "performance", "resource-lifecycle"]
categories: ["Backend"]
description: "Separate all-rows XLSX export from page queries: consume one result cursor, preserve permissions and cell conversion, stage the file, and verify failure cleanup."
ai:
  schema_version: 1
  problem: "A report export repeated expensive page and count queries for each output batch."
  symptoms:
    - "Downloading a filtered result performed substantially more database work than reading it once."
    - "The workbook writer streamed rows while its provider restarted paginated queries."
  evidence:
    - "A sanitized local reproduction counted repeated data and count statements in the old path."
    - "The repaired path executed one result query and no result-count query."
    - "Read-only comparisons preserved business fields including duplicate occurrences, totals, headers and cell types."
    - "Tests covered query errors, disconnected clients, empty results and temporary-file cleanup."
  root_cause: "The export reused the list-page execution lifecycle, coupling each writing batch to another paginated read and total count."
  resolution_steps:
    - "Retain authorization, business filters, selected columns and existing value conversion in a bounded export entry point."
    - "Consume one lazy result cursor while its database session remains open."
    - "Use bounded batches for conversion and streaming XLSX writing with SXSSF without restarting the query."
    - "Finish and check a temporary workbook before sending the download."
    - "Close resources and remove workbook and writer temporary files on every exit path."
  verification:
    - "Instrumented local tests confirmed one data SELECT and zero result-count SELECTs."
    - "Repeated comparisons used matched filters and a controlled read-only snapshot."
    - "Field and workbook comparisons excluded the independently generated display sequence."
    - "Local HTTP download, permission rejection and cleanup tests passed."
  limitations:
    - "Production deployment and production HTTP performance were not verified."
    - "Permission and column-configuration reads can still execute separate SQL."
    - "A cursor controls memory only when its driver and consumer also remain incremental."
    - "Streaming workbooks still need temporary storage and explicit cleanup."
  applies_to:
    - "large XLSX exports built on paginated report frameworks"
    - "Java pipelines that must preserve existing authorization and formatting"
  keywords: ["single result query", "database cursor", "SXSSF", "export lifecycle", "cleanup"]
---

A report could display a filtered page, yet exporting the same selection took much longer. It already used a streaming workbook writer, making batch size or writer configuration plausible places to investigate.

Tracing the provider exposed repeated work upstream. Every output batch entered the list-page machinery again: count the result, run a paginated query, convert the rows, and append them to the workbook. File writing was incremental while database execution kept restarting.

The completed local repair gave the export its own execution lifecycle. The evidence below comes from local tests and controlled read-only comparisons. The packages had not been deployed; production HTTP improvement remained unverified.

## Measure statement executions

A list page needs a slice of data and may need a total for page navigation. An all-rows download needs to consume the selected result and finish a file.

The old implementation tied each writing batch to another page operation. It repeatedly paid for counting and paginated execution. A small processing batch therefore also determined how often the database repeated expensive work.

Two counters exposed this coupling:

- Data SELECT executions.
- Result-count SELECT executions.

The repaired result path produced one and zero. These counters cover the exported result, not every SQL statement in the request. Permission, report-definition and column-configuration reads may still have their own queries.

Incrementally fetching more rows from an executing statement also differs from restarting it. JDBC describes fetch size as a [driver hint about rows to fetch](https://docs.oracle.com/javase/8/docs/api/java/sql/Statement.html#setFetchSize-int-). Changing that hint alone cannot remove a loop that executes the SELECT again.

## Consume one cursor and preserve the surrounding contract

The new entry point was restricted to the intended report. Existing authorization, current-user scope, filters, selected columns and value conversion remained in use. Only paging parameters were removed from the exported data selection.

The provider used a MyBatis cursor: a closeable, lazy iterator over query results. [MyBatis documents this contract](https://mybatis.org/mybatis-3/apidocs/org/apache/ibatis/cursor/Cursor.html). Its database session stayed open while the cursor was consumed.

The sequence became:

1. Authorize the request and resolve the report and columns.
2. Open one result cursor with the selected business filters.
3. Read a bounded batch, apply the existing converter, and write cells.
4. Continue consuming the same cursor.
5. Finish and check the workbook, then send it.

Conversion and writing still used batches. Those batches no longer triggered another page query or result count.

## Control the reader and writer separately

The repair retained Apache POI SXSSF, its streaming XLSX writer. [POI explains](https://poi.apache.org/components/spreadsheet/how-to.html#sxssf) that SXSSF keeps a sliding window of rows and writes older rows to disk. Its temporary files need explicit disposal, and some features such as shared strings can still consume substantial memory.

Both sides of the pipeline need a resource check. A streaming writer cannot remove memory already consumed by a provider that materializes every row. A consumer that accumulates the cursor into a complete list similarly loses the benefit of incremental reading.

Resource ownership included the database session, cursor, workbook, streams and temporary files. Tests checked cleanup after success, query failure and a simulated client disconnect. They included the writer's temporary files as well as the final XLSX.

## Generate a valid file before starting delivery

The implementation generated and checked a temporary XLSX before sending download bytes. This added staging I/O and delayed the start of transfer, while allowing generation failures to be handled before committing a successful download response.

The [Servlet response contract](https://jakarta.ee/specifications/servlet/4.0/apidocs/javax/servlet/servletresponse) matters here: a committed response has already sent its status and headers, and cannot be reset. Staging does not prevent subsequent network failure. It separates valid-file generation from delivery.

The implementation also guarded worksheet capacity. Empty results still generated the configured headers.

## Verify equivalence and the timing boundary

Checks covered single-result, empty, shorter-range and longer-range cases. Repeated local comparisons used the same filters and a controlled read-only snapshot; the repaired path had a lower median duration.

The acceptance checks also covered:

- Business-field multisets, including each record's number of occurrences, and relevant totals.
- Headers, configured column order, cell types and values.
- Existing permission and parameter handling.
- One data query and zero result-count queries.
- Resource closure and temporary-file removal after failures.
- Actual local HTTP downloads and repeated requests.

The independently generated display sequence (row numbering) was explicitly excluded from equivalence comparisons. Business fields still had to match.

Local timing included database reads, conversion and file generation. It excluded production routing, real service concurrency and the user's complete browser download. Deployment, request-level logs and production timing still needed their own acceptance run.

Give an all-rows export its own execution lifecycle: preserve proven authorization and conversion rules, consume the selected result once, and make valid-file generation, delivery and cleanup explicit checkpoints.
