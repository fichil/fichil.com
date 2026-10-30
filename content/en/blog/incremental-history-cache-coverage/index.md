---
title: "Incremental History Sync Needs Explicit Cache Coverage"
date: 2026-10-30
publication_date: 2026-10-30
slug: "incremental-history-cache-coverage"
draft: false
tags: ["sqlite", "incremental-sync", "caching", "data-integrity", "pagination", "testing"]
categories: ["Engineering"]
description: "Keep local-history caches truthful by committing records, coverage ranges, and source watermarks together, then exposing partial and offline states explicitly."
ai:
  schema_version: 1
  problem: "A local history interface repeatedly read an external desktop data source, making every page load expensive while leaving cached completeness undefined."
  symptoms:
    - "Opening the same history could repeat source discovery, decoding, and parsing work."
    - "A fast cache response could still be stale or partial without telling the reader which range was complete."
    - "Advancing a source watermark separately from cached records could make a failed batch look successfully synchronized."
  evidence:
    - "A completed local implementation added versioned SQLite storage, stable identities, explicit history ranges, source-generation state, and cache-first JSON queries."
    - "A sanitized verification run passed 155 automated tests plus contract and frontend build checks."
    - "A synthetic dataset of 100,000 messages produced local cache-query P95 results between 5.32 and 6.45 milliseconds on the test machine."
    - "Restart and offline checks kept cached histories available for two isolated test accounts without cross-account results."
  root_cause: "The design treated cached rows as sufficient proof of synchronization even though row presence, range completeness, and source progress are separate facts."
  resolution_steps:
    - "Store stable account, conversation, and message identities separately from source-process details."
    - "Track committed source progress and cached history ranges independently, including explicit gaps and source generations."
    - "Commit messages, coverage, and the corresponding source watermark in one transaction."
    - "Return cached results first and schedule bounded incremental or historical fills only for known missing ranges."
    - "Use stable keyset cursors bound to the account, conversation, and query boundary."
  verification:
    - "Tests covered repeated synchronization, late low-sort records, identical timestamps, source resets, batch failures, interrupted restarts, cache eviction, and migration failure."
    - "Cache-only query tests made zero source-reader calls."
    - "No-change checks skipped source decoding, while changed-source checks imported bounded batches."
    - "Sanitized restart and offline checks verified stable identities and account isolation."
  limitations:
    - "The cache can prove only the ranges it has marked complete; unfilled history remains partial."
    - "Source replacement or checkpoint changes can require rebuilding an affected in-memory snapshot."
    - "The performance figures describe one machine and synthetic records, not a universal latency guarantee."
    - "The implementation reads locally available history and does not claim access to records that never reached the desktop source."
  applies_to:
    - "local-first history viewers backed by an external application database"
    - "incremental importers that must survive restarts and source resets"
    - "offline-capable interfaces that need truthful completeness states"
  keywords: ["cache coverage", "transactional watermark", "incremental sync", "keyset pagination", "offline history"]
---

A history page became expensive because every request repeated work against an external desktop data source. Reading locally stored records promised a much faster path, and it also introduced a harder question: what exactly does the cache know?

A table containing some messages does not prove that it contains every message before, after, or between them. A saved maximum source ID does not prove that the corresponding records committed. A fast empty result can mean complete history, an unfilled range, an offline source, or a failed synchronization.

The completed implementation treated those states as separate facts. It stored cached records, explicit coverage ranges, and committed source watermarks, then made the API return their status together.

## Cached rows and complete history are different facts

The earlier request path discovered the desktop source, prepared a readable snapshot, decoded affected files, parsed messages, and assembled a page. Repeating that path for an unchanged page wasted work. Persisting parsed records removed most of the repeated cost, but row storage alone could not describe completeness.

Consider a conversation with two cached intervals:

```text
older history        known gap           recent history
[complete range A]   [not loaded]        [complete range B]
```

Returning both ranges as one continuous history would hide the gap. Marking the entire conversation incomplete would also discard useful evidence. The cache therefore records coverage as ranges, with an independent indication of whether it has reached the source's historical beginning.

This lets the interface distinguish four useful states:

- cached and complete for the requested range;
- cached but partial, with a known missing interval;
- source currently offline while cached data remains readable;
- synchronization required because the source has advanced.

## Keep identity stable while the source process changes

Process IDs, file locations, and creation times are useful for validating a live source instance. They make poor public identities because they can change after a restart.

The cache assigns stable account, conversation, and message identities. Source-specific information stays in synchronization state. A valid source message identifier is used for deduplication when available. Otherwise, the fallback key includes the stable account and conversation plus the source generation, shard, and local record number.

The source generation matters when a file is replaced or rebuilt. Reusing a local row number from an older generation must not merge two unrelated records. Generation-aware keys and state allow the importer to rebuild one affected source boundary without clearing unrelated history.

## Commit records, coverage, and progress together

An incremental importer usually needs at least three updates:

1. insert or update the parsed records;
2. extend the range known to be cached;
3. advance the committed source watermark.

Those updates describe one result. If the watermark commits after only part of the record batch, a retry can skip missing data. If records commit while coverage does not, the same batch can be read repeatedly and the API still cannot describe what is complete.

The implementation writes the records, coverage, and watermark in one SQLite transaction. A failed batch preserves the previously committed state and remains retryable. The in-progress batch boundary is recorded separately from committed progress, so a restart can continue without presenting attempted work as completed work.

SQLite uses write-ahead logging (WAL), while one database thread owns the connection and short transactions. This keeps database work outside the HTTP event loop and gives checkpoint work the same connection ownership as normal writes.

## Separate new-record monitoring from historical filling

Importing every old record at startup would make the first run slow and would save data the reader may never request. The implementation establishes an initial high-water mark without importing all older bodies. New records after that point enter through bounded incremental batches.

Historical reads follow a different path. Opening a conversation returns cached rows immediately. When the requested window is missing, a background job fills that specific range and records the resulting coverage. Gaps remain visible until filled; one completed interval never certifies its neighboring intervals.

Periodic checks first compare cheap source signals such as file identity, size, and modification time. An unchanged source skips decoding and message queries. Changed sources enter a shared queue that coalesces duplicate work, and a timer does not add another scan while one is active.

## Bind pagination to one stable query boundary

Offset pagination becomes fragile while new records arrive. A stable cursor uses the message ordering fields and a unique tie-breaker, and it also binds the cursor to the account, conversation, and query boundary that produced it.

That boundary prevents a cursor from one account or conversation from being reused elsewhere. It also gives a multi-page reader a fixed upper edge: newer records can arrive without shifting the already selected history window.

The API returns large identifiers as strings and keeps the cursor opaque. Clients can continue paging without learning source table names, shards, or internal database paths.

## Verify failure boundaries as well as the fast path

The sanitized implementation passed 155 automated tests, API contract checks, and a frontend production build. The test matrix included repeated synchronization, identical timestamps, late records with lower sort values, source resets, batch failures, interrupted restarts, history gaps, media eviction, disk-write failure, and migration failure.

Cache-only queries made zero calls to the source reader. Unchanged checks skipped decoding. A synthetic dataset of 100,000 messages produced cache-query 95th-percentile (P95) results between 5.32 and 6.45 milliseconds on the test machine.

A separate sanitized check restarted the service and queried cached data while the source was unavailable. Histories for two isolated accounts remained readable without crossing account boundaries. Passive observation during the final run recorded no focus changes in the source desktop application.

These results support the local cache and synchronization boundaries. They do not guarantee the same latency on another machine, and they do not prove access to history that never reached the desktop source.

## Reusable conclusion

An incremental cache needs to describe more than the rows it has stored. Track which ranges are complete, which gaps remain, which source generation produced each record, and which watermark committed with the data. Return cached results quickly, but keep partial, offline, and synchronized states visible.

That design turns cache speed into trustworthy behavior. A reader can use the fast path without confusing “available now” with “complete everywhere.”
