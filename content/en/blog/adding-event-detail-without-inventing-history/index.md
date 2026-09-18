---
title: "Add Event Detail Without Inventing History"
date: 2026-09-18
publication_date: 2026-09-18
slug: "adding-event-detail-without-inventing-history"
draft: false
tags: ["data-integrity", "event-log", "transactions", "pagination", "cloudflare-d1", "observability"]
categories: ["Backend"]
description: "Evolve aggregate-only counters into an event log by writing details and totals atomically, preserving irreducible legacy summaries, and using stable cursor pagination."
ai:
  schema_version: 1
  problem: "Daily aggregate counters proved that requests occurred but could not show each request's detected name, time, or read path."
  symptoms:
    - "A page could show a nonzero daily request count while having no individual visit rows to display."
    - "Older totals contained less information than the new event schema required."
    - "Naive offset pagination could skip or repeat events when new requests arrived or several records shared a timestamp."
  evidence:
    - "The public schema and request path showed that the existing daily counter stored article, locale, agent family, UTC date, and count."
    - "The reviewed change added an event table for normalized identity, detection source, UTC timestamp, and request kind without storing raw network identifiers."
    - "The write path batches the aggregate upsert and event insert; Cloudflare documents D1 batches as transactions that roll back the sequence when a statement fails."
    - "Automated tests covered concurrent increments, same-time cursor pagination, legacy remainder calculation, zero-comment rendering, error states, and both languages."
  root_cause: "Aggregation discarded event-level dimensions. Once only a count remained, individual names and timestamps could not be recovered truthfully."
  resolution_steps:
    - "Add an append-only event table while retaining the aggregate table used by existing readers."
    - "Write the aggregate increment and event row in one database batch so the two representations move together."
    - "Represent old data as a legacy remainder equal to the aggregate count minus recorded event rows for the same article, locale, agent family, and UTC date."
    - "Page event rows by descending timestamp and unique ID, and bind the cursor to the article and view."
    - "Keep statistics, event history, and comments independent in the interface so one failed request is not presented as a confirmed empty result."
  verification:
    - "The schema migration created the event table and indexes for article-time and daily reconciliation queries."
    - "Unit tests verified transactional write intent, concurrent counts, bounded cursors, same-time records, article isolation, and legacy totals."
    - "Browser tests verified that visits remain visible when comments are empty and that failed data sources retain separate retry states."
    - "The reviewed commit passed repository checks and the exact merged version was verified after deployment."
  limitations:
    - "Detected client names are heuristic and are explicitly shown as unverified identities."
    - "Historical aggregates remain summaries; the design does not fabricate missing names, timestamps, or request kinds."
    - "Telemetry writes run outside the response's success boundary, so a database failure may lose observability data without blocking article delivery."
    - "The event table needs a separate retention decision if long-term volume becomes material."
  applies_to:
    - "systems evolving from counters to audit or observability events"
    - "analytics migrations that must preserve coarse historical data"
    - "high-churn event feeds that need stable pagination"
  keywords: ["aggregate to event migration", "legacy remainder", "atomic dual write", "keyset pagination", "data integrity"]
---

A daily counter can answer how many requests occurred. It cannot identify every request, recover its exact time, or explain which read path it used. That distinction became visible when a page had a nonzero AI-request total but no individual visits to list.

The system needed richer records for new traffic while preserving the meaning of older totals. Expanding one historical count into several plausible-looking rows would have produced a cleaner interface and weaker evidence. The migration therefore kept the old aggregate as an aggregate, added real event rows only when they were observed, and made the boundary visible to readers.

## The information loss happened at aggregation time

The original model stored an article slug, locale, normalized agent family, UTC date, and request count. Those fields support daily totals. They do not contain an individual client name, a per-request timestamp, a detection source, or whether the client read HTML or machine-readable JSON.

No migration can recover dimensions that were never stored. A count of five could represent five requests from one detected client, one request from each of five clients, or another sequence entirely. Assigning names and times later would turn assumptions into records.

The safe boundary was straightforward:

- Existing rows stay in the daily table.
- New requests create real event rows.
- The interface labels unreconstructable data as a historical summary.
- Claims about individual visits begin only when the event schema is active.

This principle applies beyond request analytics. Any system that moves from balances, counters, or daily snapshots to an event log must preserve the difference between measured history and reconstructed narrative.

## Write the total and the event together

The new write path keeps two representations because they serve different readers. The daily table remains efficient for totals and compatibility. The event table stores one observed request with a unique ID, normalized agent identity, detection source, UTC timestamp, date, and request kind.

For each accepted request, the application sends two prepared statements in one D1 batch:

1. Upsert the daily row and increment its request count.
2. Insert the corresponding event row.

[Cloudflare's D1 documentation](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch) states that batched statements are SQL transactions and that a failing statement aborts or rolls back the sequence. The [reviewed write path](https://github.com/fichil/fichil.com/blob/b63c0d5c34de2144b466c7907091cb7adbc24c4d/sites/lib/ai-blog-api.ts#L221-L233) uses that boundary directly.

This avoids two misleading states: a total that increased without a detail row, and a detail row that appeared without its corresponding total. The request handler still treats telemetry as non-critical. A failed telemetry write is logged while the article response remains available. Atomicity protects the two database representations from disagreeing with each other; it does not make analytics part of the content-delivery success condition.

The stored identity is deliberately narrow. The event contains the normalized result of detection, not an IP address, raw user-agent string, or full query string. That keeps the record useful for the stated feature without turning an observability improvement into unnecessary network-identifier retention.

## Preserve legacy data as a remainder

Keeping both tables creates another risk: double-counting. After the event schema is active, the daily total includes requests that also have event rows. Showing the full daily total under “historical” and then listing events would count the same request twice.

The legacy view solves this by calculating a remainder for each article, locale, agent family, and UTC date:

> legacy remainder = daily aggregate − recorded event rows

Only positive remainders are returned. The [public query](https://github.com/fichil/fichil.com/blob/b63c0d5c34de2144b466c7907091cb7adbc24c4d/sites/lib/ai-blog-api.ts#L263-L280) performs that subtraction at read time. New requests appear as events; old requests that lack event dimensions remain summarized. There is no artificial cutover timestamp to maintain and no invented backfill.

This design also tolerates a mixed transition period. If an aggregate row contains ten requests and six matching event rows exist, the interface exposes six real events plus a legacy remainder of four. The result is explicit about what the database knows at each level of detail.

## Use a cursor that defines a total order

An active event stream changes while readers page through it. Offset pagination can shift when a newer row arrives. Timestamp-only pagination also breaks when several events share the same timestamp.

The event query orders by two fields:

1. `visited_at` descending.
2. `id` descending as a unique tie-breaker.

The next page requests rows older than that compound position. The cursor also includes locale, article slug, and view, so a cursor returned for one article or for the legacy view cannot silently be reused elsewhere. Page sizes are bounded, and one extra row determines whether another page exists. The [event query and cursor validation](https://github.com/fichil/fichil.com/blob/b63c0d5c34de2144b466c7907091cb7adbc24c4d/sites/lib/ai-blog-api.ts#L235-L291) make those constraints part of the API rather than client convention.

## Empty, unavailable, and absent are different states

The page loads aggregate statistics, event history, and comments independently. A comment count of zero does not hide visit records. An event API failure produces a retryable error instead of an empty-success message. Legacy totals remain in their own expandable section because they carry a different evidence level.

The [bilingual interface](https://github.com/fichil/fichil.com/blob/b63c0d5c34de2144b466c7907091cb7adbc24c4d/sites/components/AiVisits.tsx) also labels detected names as unverified. A user-agent or request header can identify software, but that signal does not prove who controlled the request. The UI keeps the useful observation and its confidence boundary together.

## Verification covered the transition boundaries

The tests focused on places where a clean demo can hide inconsistent data:

- Concurrent requests must preserve every aggregate increment.
- Records with the same timestamp must remain reachable across cursor pages.
- A cursor is valid only for its original article, locale, and view.
- Legacy totals must subtract matching event rows and never become negative or duplicated.
- Visit records must render when comments are empty.
- Statistics, visits, and comments must retain independent loading and failure states.
- Both language routes must present the same data contract.

The [migration](https://github.com/fichil/fichil.com/blob/b63c0d5c34de2144b466c7907091cb7adbc24c4d/sites/drizzle/0001_ai_visit_events.sql) adds indexes for article-time pagination and daily reconciliation. The [merged implementation](https://github.com/fichil/fichil.com/commit/b63c0d5c34de2144b466c7907091cb7adbc24c4d) passed repository checks and was verified on the deployed site at that exact commit.

## Reusable conclusion

When an aggregate-only system gains event detail, treat the two models as different levels of evidence. Write new totals and events atomically, subtract real events from legacy aggregates, page events with a stable compound key, and label unverifiable history honestly. A richer schema should increase what the system can prove from the cutover forward without pretending that the past contained data it never recorded.
