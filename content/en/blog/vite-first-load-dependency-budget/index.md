---
title: "Budgeting the Real First-Load Dependency Graph of a Vite SPA"
date: 2026-08-12
draft: false
tags: ["vite", "vue", "performance", "code-splitting", "testing"]
categories: ["Frontend Engineering"]
description: "A Vite manifest can turn an SPA's real first-load dependency closure into a gzip budget, catching regressions that total build size and single-chunk checks miss."
---

A production build reported several megabytes of JavaScript, while the application entry compressed to a much smaller file after code splitting. Neither number answered the operational question: how much code did an unauthenticated user actually need before the login screen became usable?

A sanitized enterprise SPA made the gap visible. The original build registered dozens of routed views and a complete component library during bootstrap. A first optimization reduced the entry chunk sharply, but that file no longer contained the route chunk, shared imports, and styles required by the initial screen. Treating the smaller entry as the result would have overstated the improvement.

The durable solution combined route-level lazy loading with a budget derived from the Vite build manifest. The budget measured the application entry, the selected initial route, and every statically imported JavaScript and CSS dependency reachable from those two roots. Deferred business routes stayed outside the first-load set.

## The visible symptom was an ambiguous bundle number

Three common measurements describe different things:

| Measurement | What it answers | What it misses |
| --- | --- | --- |
| Total output size | How much the build produced | Which files the first screen requests |
| Entry chunk size | How large one generated entry file is | Shared imports and the first route's dynamic entry |
| Largest chunk | Which individual artifact is heavy | The combined dependency path needed for one user journey |

The initial application synchronized every page with startup. That made the entry file a rough proxy for first-load cost, even though it included code that login users did not need. After route components moved behind dynamic imports, the entry became smaller by design. The relationship then reversed: checking only that file omitted required code.

The root cause of the measurement problem was a missing path definition. “Initial JavaScript” had to mean the static dependency closure for a named screen, not one filename chosen from the output directory.

## Reduce the startup graph before setting a budget

The implementation first separated route metadata from route component loading. Route names, paths, access rules, and navigation structure could remain available at bootstrap, while each page component used a function that imported its module only when navigation selected it.

The same rule applied to other startup dependencies:

- UI components and styles were resolved on demand instead of installing the entire library globally;
- the default locale remained available at startup, while an alternate locale loaded only after selection;
- mapping and other heavy feature libraries stayed inside the routes that used them;
- production builds emitted a manifest so generated filenames and import relationships were machine-readable.

Vite documents that dynamic imports become separate chunks and that its manifest records entry chunks, dynamic entries, static `imports`, dynamic imports, and associated CSS. Those two capabilities make the startup path measurable without depending on unstable hashed filenames ([Vite features](https://vite.dev/guide/features.html), [Vite backend integration](https://vite.dev/guide/backend-integration.html)).

## Traverse only dependencies required by the initial screen

The manifest budget used two roots:

1. the application entry that bootstraps the framework, router, state, and default styles;
2. the login route's generated entry, because unauthenticated navigation selects it immediately.

For each root, the checker collected its JavaScript file and CSS list, then recursively followed only the `imports` field. A visited set prevented shared chunks from being counted twice.

```text
collect(root):
  if visited: return
  mark visited
  add root.file
  add root.css
  for child in root.imports:
    collect(child)

collect(application entry)
collect(initial route entry)
```

The checker deliberately did not traverse every `dynamicImports` edge. Doing so would pull deferred business pages back into the first-load total and erase the distinction created by lazy loading. If a different public route is part of the startup journey, that route must be added as another explicit root.

Missing roots or referenced manifest entries failed the check. Silently treating them as zero would allow a renamed or unexpectedly inlined route to produce a misleading green result.

## Compare compressed bytes with separate JavaScript and CSS limits

The checker read the emitted files, compressed each with the same gzip implementation, and summed unique JavaScript and CSS files separately. Node's `gzipSync` accepts buffers and returns their gzip-compressed representation, which makes the calculation deterministic inside the build job ([Node.js zlib documentation](https://nodejs.org/api/zlib.html#zlibgzipsyncbuffer-options)).

Separate limits mattered. A combined budget could hide a JavaScript regression behind small styles, or allow CSS growth because JavaScript happened to shrink. The sanitized build used fixed ceilings for both resource types and failed with a non-zero exit when either ceiling was exceeded.

After the refactor, the selected first-load graph measured about 202 KB of gzip-compressed JavaScript against a 350 KB ceiling and about 16.5 KB of compressed CSS against a 50 KB ceiling. The entry chunk alone was much smaller, which confirmed why it could not serve as the complete metric.

## Verify behavior and performance in the same delivery path

A passing size check did not prove that the application still worked. The final verification combined several boundaries:

- unit tests covered route contracts, locale loading, authentication errors, and login recovery;
- production build and manifest generation completed successfully;
- the dependency-closure budget passed on the emitted artifacts;
- browser tests exercised the login flow at desktop and mobile viewports;
- the mobile screen had no horizontal overflow and kept the primary action inside the first viewport;
- the release workflow invoked the same verification command used locally.

This ordering caught two different failure classes. Route and browser tests protected behavior after splitting. The manifest budget protected the resource graph after bundling. Running one without the other would leave either usability or performance unverified.

## Limits

Compressed transfer size is only one part of loading performance. It does not measure latency, cache state, JavaScript parsing and execution, rendering cost, API response time, or a slower device's main-thread pressure. Gzip also differs from Brotli and from the exact behavior of a production CDN.

The selected roots must match the real unauthenticated journey. Applications with server-side rendering, service workers, conditional boot modules, or several equally common landing pages need a wider model. A static budget should be paired with browser timing or real-user monitoring when those signals are available.

The reusable conclusion is to optimize and budget a user path as a dependency graph. Split code at real navigation boundaries, select the roots required for the first screen, recurse through their static imports, count each emitted file once, and keep the resulting budget in the same verification path that protects behavior.
