# fichil.com content quality standard

Every published post should explain one engineering conclusion. A post may use
several examples, but each example must support the same thesis rather than
forming an unrelated work log.

## Editorial sequence

1. State the observed problem and why it mattered.
2. Separate symptoms from evidence gathered from logs, runtime state, data, or
   reproducible behavior.
3. Explain the root cause and why the most obvious explanation was incomplete.
4. Describe the smallest safe change, including preserved contracts and
   relevant tradeoffs.
5. Verify the real boundary: user behavior, database results, retries, builds,
   deployed version, or external contract as appropriate.
6. End with one reusable conclusion instead of a generic summary.

English and Chinese versions must describe the same facts, limits, and result.
Natural phrasing is preferred over sentence-by-sentence translation. Never add
client names, private identifiers, credentials, unsupported metrics, or a claim
that planned work has already succeeded.

## Image and diagram rules

- Use selectable Markdown tables, code blocks, and text flows for technical
  explanations whenever possible.
- Images require meaningful alternative text; decorative images use an empty
  alt attribute.
- Do not place essential instructions or evidence only inside a screenshot.
- Check every image containing text character by character before publishing.
- Avoid generic project art that does not explain the adjacent case.

## 2026-07-21 bilingual audit

| Slug | Central thesis | Evidence/verification boundary | Visual decision |
| --- | --- | --- | --- |
| `database-backed-business-flow-acceptance` | Cross-module completion requires database reconciliation | real writes, state history, consistency and service recovery | text lists and reconciliation steps |
| `production-grade-wms-rf` | RF reliability depends on server-owned identity and write semantics | warehouse scope, idempotency, offline failure and native build checks | text architecture |
| `legacy-tms-migration-matrix` | Migration scope must be a capability matrix, not a page count | domain smoke, mobile contracts and runtime validation | text matrix narrative |
| `codex-no-tun-proxy-launcher` | A launcher should discover and validate the current proxy | process environment and connectivity check | commands remain selectable |
| `production-dashboard-aggregation` | A visible zero may be a failed summary request | read-only SQL reconciliation and failure-state UI | query steps remain text |
| `codex-animated-pet-pipeline` | Deterministic assembly is safer than one-shot spritesheet generation | frame order, direction coverage and visual QA | article describes the QA pipeline |
| `logistics-organization-data-model` | Company, project, organization, and warehouse are different ownership axes | query usage and relationship model | monospace relationship tree |
| `gradle-java-home-precedence` | Gradle's JVM must be proven from its own resolution path | daemon/toolchain output and repeatable launch check | commands remain selectable |
| `dubbo-connection-refused-container` | The deepest transport error points to the missing runtime service | container history, memory limits and restored registration | text causal chain |
| `copied-order-time-window` | Copy semantics must reset time fields owned by the new document | query-window reproduction and source immutability | text state transition |
| `distributed-runtime-environment-drift` | A distributed environment is the full dependency path | process arguments and outbound JDBC/RPC/cache connections | text dependency path |
| `rf-printer-safe-retry` | Printing is retryable only before the write boundary | per-label logs, network failure and duplicate prevention | text retry table/list |
| `mysql-wave-query-optimization` | Reduce the aggregation input before adding speculative indexes | EXPLAIN, rollback of weak indexes and measured comparison | SQL and plans remain selectable |
| `recent-bug-fixing-work` | Business rules belong at the real execution boundary | alternate UI paths, per-record results, shared calculations and safe errors | no decorative image |
| `fix-vps-connection` | Historical connection refusal diagnosis starts at network/listener state | external probes, listener, proxy and route verification | historical notice; no homepage art |
| `ai-maintained-hugo-site` | AI-assisted delivery stays trustworthy through human review and exact releases | Git/CI, exact SHA, `/version.json`, smoke and version rollback | text delivery flow plus site social card |

