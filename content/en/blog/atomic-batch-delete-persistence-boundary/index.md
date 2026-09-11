---
title: "Keep Batch Deletes Inside the Persistence Boundary"
date: 2026-09-11
publication_date: 2026-09-11
slug: "atomic-batch-delete-persistence-boundary"
draft: false
tags: ["transactions", "batch-operations", "java", "oracle", "deletion", "verification"]
categories: ["Backend"]
description: "Repair a batch deletion path that depended on a read projection by loading persistence models directly, validating the full batch, and returning the real transaction result."
ai:
  schema_version: 1
  problem: "A batch deletion endpoint failed before completing because its mutation path reused a read-oriented projection query whose aggregate expression was invalid on the target database."
  symptoms:
    - "The browser received an HTTP 500 when deleting one or more selected records."
    - "The first database error came from an aggregate detail projection used for display, even though the requested operation was deletion."
    - "The page could show a success message without proving that the service had committed the full batch."
  evidence:
    - "Sanitized runtime tracing connected the delete request to the projection query and reproduced its database error with a read-only check."
    - "Source tracing showed that the delete path loaded expanded display objects before removing persistence records."
    - "Transaction tests injected failures in later batch items and in each child or parent phase, then verified that earlier changes did not commit."
    - "Packaged-artifact checks confirmed that both application sides contained the reviewed interface, transaction configuration, query, and client behavior."
  root_cause: "The mutation boundary was split across a browser loop, a controller that did not preserve the real result, and a service that depended on a display projection. A read compatibility failure could therefore block or obscure a destructive operation after work had already begun."
  resolution_steps:
    - "Give batch deletion one server-side service entry point and normalize duplicate or empty identifiers before any write."
    - "Load persistence models with exact ownership and version keys, without using display aggregates or expanded projection objects."
    - "Validate every requested target before deleting any of them."
    - "Delete dependent records before their parent records inside one REQUIRED service transaction and let failures escape so rollback remains effective."
    - "Return the service result through the controller and show success in the client only when the response explicitly confirms it."
  verification:
    - "Nineteen Java tests passed for validation, ownership isolation, exact matching, stale data, repeated selection, child-first removal, and rollback after injected failures."
    - "Six client-side scenarios passed for success, business failure, empty or malformed responses, and transport failure."
    - "Eight read-only database cases verified the repaired detail projection, including empty, duplicate, multilingual, scoped, and long display values."
    - "The required multi-module build produced both application artifacts, and the packaged files matched the reviewed source."
  limitations:
    - "The repaired artifacts were built but were not deployed during this work."
    - "Database query checks were read-only; no live business record was deleted for article evidence."
    - "The transaction tests used the real service boundary and framework interceptor with an isolated JDBC test store, not the deployed application server, remote-call layer, or production concurrency."
  applies_to:
    - "legacy applications where list projections are reused by write operations"
    - "batch delete APIs that require all-or-nothing behavior"
    - "multi-layer clients that must distinguish a committed mutation from request completion"
  keywords: ["atomic batch delete", "persistence boundary", "transaction rollback", "read projection", "truthful UI result"]
---

A user selected several records and clicked Delete. The request returned HTTP 500, and the first database error came from a grouped detail query intended to assemble display text. The mutation had inherited a read dependency that it did not need.

That coupling made the failure larger than one incompatible query. The browser submitted deletions item by item, the controller did not reliably preserve the service result, and the service loaded expanded display objects before deleting persistence records. If a later step failed, the page could not clearly state whether the full selection committed, partially ran, or rolled back.

The repair established one boundary for the destructive operation: the server receives the whole batch, loads exact persistence models, validates every target, removes dependent rows before parent rows inside one transaction, and returns the actual outcome to the client.

## Trace the first failure without stopping there

The database log recorded an invalid identifier while executing an aggregate projection. Oracle documents ORA-00904 as an invalid identifier or column name ([Oracle error reference](https://docs.oracle.com/en/error-help/db/ora-00904/)). A read-only reproduction confirmed that the projection failed on the target database.

Replacing the invalid aggregate restored the detail view. Oracle's LISTAGG documentation also makes ordering, duplicate handling, result type, and overflow behavior explicit ([Oracle 19c LISTAGG](https://docs.oracle.com/en/database/oracle/oracle-database/19/sqlrf/LISTAGG.html)). Those query semantics were reviewed separately because a display repair can choose a bounded presentation contract that would be unsuitable for identifiers used by a mutation.

The call chain exposed the deeper design issue. The browser looped over selected rows, the controller invoked deletion, and the service loaded an expanded display projection. That projection ran grouped text SQL after child work could already have begun, so its failure reached the browser as HTTP 500.

A deletion service only needed the exact parent and dependent persistence rows. The projected text, labels, and grouped conditions existed for readers. Reusing that object added database functions, joins, aliases, and overflow behavior to a destructive path.

## Separate read models from mutation models

Read projections and persistence models serve different contracts:

- A read projection makes a list understandable; a mutation model identifies rows that may change.
- A read projection commonly contains labels, joined names, and aggregates; a mutation model keeps keys, ownership, version, and relationships.
- A read projection can sort, format, or bound display text; a mutation model requires exact matching with no silent broadening.
- A projection failure prevents a list or detail from rendering; a mutation failure must stop the state change and roll it back.

The repaired delete path queried the persisted parent, detail, and condition records directly. Each lookup used the current ownership scope and exact business key; detail removal also included its line identity. Wildcard characters in an identifier were treated as data rather than search syntax.

The display projection still had its own compatibility fix, but the mutation no longer depended on it. A future list-column change can now fail without changing which rows the delete service selects.

## Validate the whole batch before the first delete

A browser loop creates several independent requests. The third request can fail after the first two have committed, even when the user chose one batch and expected one result.

The new API sends the complete selection to one service method. It normalizes and deduplicates the identifiers, rejects an empty request, loads exact records in the current scope, and confirms that every target exists at the expected version. Only then does it delete conditions, details, and headers in that order and return success.

Validation finishes before the first delete. A missing, stale, or out-of-scope target rejects the batch without touching a valid sibling. Duplicate selections are normalized, while empty identifiers and missing ownership context fail explicitly.

The delete order follows the reviewed parent-child relationships: conditions first, then details, then headers. This avoids relying on unspecified cascade behavior and keeps each removal visible to the transaction tests.

## Make one service transaction own the result

The batch service participates in one REQUIRED transaction. Spring documents that PROPAGATION_REQUIRED joins an existing outer physical transaction or creates one when none exists, and that participating logical scopes map to that physical transaction ([Spring transaction propagation](https://docs.spring.io/spring-framework/reference/data-access/transaction/declarative/tx-propagation.html)).

That guarantee still depends on failure behavior. The transaction cannot protect the batch if inner code catches an exception, reports success, and allows the outer call to commit. The repaired flow validates known business failures before deletion and lets unexpected persistence failures escape. The controller returns the service's result instead of replacing it with an unconditional success response.

The client follows the same rule:

- refresh and show success only when the response explicitly says success: true;
- preserve the server's reviewed business message on a rejected batch;
- restore the action button after business, parsing, or transport failure;
- when the connection result is unknown, ask the operator to refresh before retrying.

A network error cannot prove whether the server committed. The UI therefore avoids turning request completion into a claim about database state.

## Verify rollback, scope, and packaging independently

Nineteen Java tests exercised the service and controller boundary. They covered empty input, duplicate selection, exact identity matching, ownership isolation, already-removed data, version conflict, child-first deletion, and repeated submission.

Failure injection supplied the stronger evidence. Tests failed the second selected record and separately failed condition, detail, and header removal. Every case verified that earlier changes were absent after rollback. The service ran through the application's transaction interceptor against an isolated JDBC store, so the checks observed transaction behavior rather than only mocking a return value.

Six client scenarios covered explicit success, business failure, empty or malformed responses, and transport errors. The page refreshed only after confirmed success and restored its controls after every failure path.

Eight read-only database cases covered the repaired display query: existing and empty detail sets, duplicate and multilingual values, ownership and line scoping, stable ordering, and long display text. No business record was deleted as part of this database evidence.

Finally, the required multi-module build completed and produced the two coordinated application artifacts. Archive checks matched the reviewed classes, interface, query mapping, client script, and transaction configuration, and confirmed that test-only dependencies did not enter the deliverables.

## Limits and reusable conclusion

The evidence stops at source, transaction tests, read-only database checks, build, and packaged artifacts. The artifacts were not deployed during this work. A release still needs a disposable test record, server-side log review, data reconciliation after deletion, and a concurrency check in the deployed environment.

The reusable conclusion is to give destructive batches a narrow persistence boundary. Send one batch to the server, load exact mutation models, validate every target before writing, let one transaction own all child and parent changes, and carry the real result back to the user. Read projections can remain rich and convenient without becoming hidden prerequisites for changing state.
