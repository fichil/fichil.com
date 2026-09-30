# Cloud blog runner: approved migration contract

Status: **approved policy, locally implemented, not activated**. No scheduler,
GitHub permissions, branch protection, remote refs, or Sites deployment are
changed by this work. The approved cloud policy below replaces only admin-policy introspection and native auto-merge; all other original invariants remain.

## Minimal architecture

The Friday 09:10 Asia/Shanghai task is an orchestrator, not a GitHub CLI process.
Each execution starts in a disposable cloud workspace and reads fresh GitHub
and Sites state using supported connectors. GitHub remains canonical; Actions
only validates. Do not store a GitHub token or deploy from Actions.

`tools/cloud_blog_contract.py` contains dependency-free, read-only decisions:
30-complete-day window, hard-filtered score ordering, full bilingual path scope, current-head/content/report hash binding,
exact-main push-run release eligibility, saved-version reuse, and propagation
stabilization. Run its tests using:

```sh
python3 -m unittest discover -s tools/tests -p 'test_*.py' -v
```

The module intentionally does not execute connector calls or authorize writes.
A successful function is one necessary gate, not an end-to-end approval. Full
QA remains the `fichil-content-qa` skill, not this helper. Semantic dedup,
privacy review, source verification, and visual QA cannot be replaced by a
boolean emitted by an untrusted document. Only the orchestrator may normalize
fresh verified evidence into these function inputs. Function inputs are not a
public endpoint. Invalid/missing fields stop progression, never default to pass.

### Bootstrap and durable state

1. Resolve `origin/main`, clone anonymously, inspect AGENTS/deployment/Hugo and
   this contract from that exact SHA. Use an isolated clean worktree. Retrieve
   pinned recursive submodules and validate their status. Do not silently reuse
   a previous run's directory, node_modules, login, process, or cached records.
2. Materialize the registered private QA package through the current Library
   workflow, verify its registered archive SHA, read its policies and run its
   self-tests. The package identity/version/hash belong in the private task
   configuration, not a signed URL or public Issue. Missing package is a hard
   failure. A future reviewed repository-native skill is optional, not assumed.
3. Reconstruct state from full `main` article history, `chatgpt`, all open blog
   PRs, relevant open/closed Issues, current PR heads, QA packet references, and
   Sites version/deployment records. Paginate; partial lists are not empty lists.
   A private durable QA packet holds the claim map, review files, four inspected
   screenshots, source evidence, review approval provenance, and baseline ledger.
   Publish only safe summaries and hashes to Issues/PRs.
4. Use one writer for this workflow. The scheduler must reject overlapping
   executions and resume an existing run, not start another publisher. Confirm
   that capability before activation. An Issue comment alone is not an atomic
   distributed lock; if serialization cannot be established, stop before writes.
5. Before every externally mutating step, reconcile its durable result. A
   timed-out Issue/PR/version/deploy call has an **unknown** result. Read/search
   for the exact scope/head/commit and recover the unique result; do not retry
   create blindly. If ambiguous, stop. Record confirmed identities before the
   next phase. Private state stores are resumability hints; live remote state
   and recomputed hashes always win.

### Content flow

- Verify accessible repository/ref/PR state and required checks. Do not request
  the denied administration-only baseline. Existing protection settings stay
  unchanged; normal server-enforced exact-head merge decides acceptance. This
  does not assert that the protection configuration was inspected.
- Reconcile the existing `chatgpt` PR before selecting anything new. Preserve
  scope markers; require complete diff pairs and unique Issue per slug. No
  extra draft or appended topic while a valid earlier PR is pending.
- Source only completed, accessible cloud work and GitHub commits/PRs/Issues in
  the preceding 30 full Shanghai dates. Explicitly skip insufficient evidence.
  No laptop sessions or fabricated historical access. Re-scan each run.
- Do full-history semantic dedup before scoring and again before writing. Keep
  the original five scores 30/25/20/15/10, verification/reuse/date/stable-source-ID
  tie breaks, TOP_1, privacy checks, and exactly two new article `index.md` files.
- Establish/reuse the unique Issue before writing. Enforce current front matter
  and AI schema. Perform complete QA and four mobile screenshots. Only
  `review_ready` permits the one atomic article commit and Draft PR.
- To avoid shell credentials, supported Git Data connectors can create blobs,
  one tree and one commit with the verified current parent, then update
  `chatgpt` with `force=false`. First prove the required ordinary fast-forward
  relationship. Read back the resulting ref/full diff and actual commit bytes;
  use the **remote** commit SHA, not a locally predicted commit hash. Reconcile
  a lost response before retry. This does not permit writing `main` directly.
- A freshly re-read, exact current head and explicit user content approval are
  mandatory before skill `approve`, marker insertion, Ready or merge progression.
  Run skill `verify-review` over current content/assets/report first. A head or
  asset/content change invalidates approval; restore Draft, invalidate the old
  marker, run full QA, and ask again. Ordinary “yes” and old approval do not count.
- If current capabilities cannot safely recover an existing native auto-merge
  request, stop for owner recovery; never pretend it was disabled. Do not
  introduce new native auto-merge requests through an underspecified wrapper.

### Production flow

Except on hard failure, still synchronize safe `main` for no topic, review wait,
normal pending PR, or a non-security PR check failure. Freshly resolve full
`main` SHA, confirm merged content ancestry where applicable, then pin it for
all checks, source push, packaging, save, deployment and `/version.json`.

Read exact `Site Build Check` **push** evidence for that main SHA, including
latest run/attempt and completion. The current `fetch_commit_workflow_runs`
connector is explicitly PR-only and first-page-only; it cannot establish this
gate. Use a supported push-inclusive read and verify event/branch/SHA. Never
substitute PR checks or a successful older attempt. Unavailable evidence stops
release. Wait pending checks according to the original 15-minute limit.

Use the pinned official Hugo/Node versions and a workspace-local npm cache.
Run QA shell tests, mirror tooling tests, Hugo, `npm ci`, security audit, lint,
unit/build and browser/accessibility regressions. Verify unchanged tracked tree,
submodules, server bundle, and hosting schema. Keep the Sites project identity
only in `sites/.openai/hosting.json`.

No-op if live version already matches. Otherwise record prior live SHA and its
known-good Sites version. Reuse a unique saved target version; reconcile
ambiguous versions rather than making another. Obtain short-lived Sites source
credentials only through the current hosting skill; never print or persist
credentials. Source, archive and saved version must refer to the exact target.
After dispatch, record and poll the actual deployment, including on restart.

A `succeeded` deployment begins a 3-minute stabilization window with 10-second
cache-bypassed reads (unique query, Cache-Control and Pragma no-cache). Require
three consecutive simultaneous target-SHA + both-article-200 samples. Three
consecutive target-SHA samples with the same failed article route, or window
expiry, permits known-good rollback. Then require three full uncached rounds
of nine core entries, both canonical article routes, www canonical redirect,
and version. Report rollback and verify it if any full smoke fails. Missing
known-good version or failed rollback requires urgent human attention.

A restart must retain the deployment completion time/window rather than resetting
it forever. If exact timing cannot be recovered, reconcile live state and do not
claim stability from pre-restart samples. No DNS, VPS/mirror, access, environment,
D1/R2, or credential settings changes are part of this migration.

## Approved policy and executable connector adapter

The user explicitly approved replacing administration-only baseline inspection
with current check validation plus GitHub's normal server-enforced protected
merge, and replacing native auto-merge with exact-approved-head normal merge.
No protection settings change; reduced configuration-inspection assurance was
disclosed. These are resolved decisions, not activation blockers.

`tools/cloud-blog-github.mjs` implements the supported connector transitions.
Inject the current tool runtime; `createRunner(tools)` defaults to read-only
rehearsal. `mergeApproved(prNumber, verifyQA)` reads paginated PR files/reviews,
Issues, live main ancestry and app-15368 checks; it verifies full article scope,
current-head marker/hashes, and user/skill approval. Its `verifyQA` callback must
actually rerun the trusted QA skill, never echo PR fields. With execution
explicitly authorized, use `createRunner(tools, {execute:true})`; it marks Ready,
repeats verification, calls `merge_pull_request` with explicit method/head, and
reconciles result against remote PR/main. Rejection restores Draft. A lost
response is read back before any possible later retry. Unresolved read failures
stop; no blind merge retry is performed. A subsequent invocation needs full
fresh verification. Initial unsafe snapshots stop merge progression and recover an already-Ready
PR to Draft. The orchestrator also removes its invalid old marker. A restart
after a confirmed merge reconciles it without another merge request. Recovery
is never treated as authorization to merge.

`pushEvidence(targetSHA)` uses supported `github.fetch` with
`/actions/runs?event=push&branch=main&head_sha=<SHA>&per_page=100&page=<N>`.
It paginates and re-reads the selected run by ID; PR-only wrappers are not used.
This route and `/commits/<SHA>/check-runs` were verified read-only on current
main. Current main push run 36681989383 succeeded at SHA
25150e3c859aed0dd4444dcfbc965cd5d39747b8. This is evidence of adapter availability,
not reusable approval for future SHAs.

Run `node --test tools/tests/cloud-blog-github.test.mjs` for nonmutating simulated
success, rejected merge, lost success/open response, retry after revalidation,
Ready/head race, pending/failed checks, behind main, exact push identity, and
pagination. The adapter handles the GitHub approval/merge/CI boundary; the
orchestrator still performs source selection, actual content/QA and Sites work
using the complete task instructions. Do not label simulated rehearsal a live
merge or deployment test.

A behind branch remains paused until a supported authorized branch update is
available, followed by complete new QA and review. Existing native auto-merge
requests need verified owner recovery. Neither is waived by policy approval.

## Original invariant parity and activation checklist

| Original area | Treatment |
| --- | --- |
| Friday 09:10 Shanghai; previous 30 complete days | Preserved; deterministic boundary test |
| QA skill, four screenshots, baseline, exact-head/hash review | Preserved; skill required, helper adds binding tests |
| Admin security baseline | Approved replacement: observable checks + unchanged server protection |
| Old branch/PR recovery; no extra pending article | Preserved; unsupported recovery blocks |
| All-history semantic dedup and closed-Issue interpretation | Preserved in orchestrator; not falsely automated by helper |
| Evidence/privacy hard filters; scores and TOP_1 | Preserved; cloud-only source change already approved |
| Unique Issue, two files, atomic commit, no force/history rewrite | Preserved; Git Data fast-forward protocol in approved task instructions |
| Native auto-merge | Approved replacement: exact-head normal protected merge; unsupported branch update still pauses |
| Separate content/deployment outcome and hard failure | Preserved; no deployment after observable safety/auth failure |
| Main-only exact push-check, submodule and full local QA | Preserved; PR-only workflow tool explicitly excluded |
| One SHA for built/source/saved/deployed version | Preserved; read-only planner tests |
| Stable propagation, full nine-entry smoke, known-good rollback | Preserved; stabilization tests, adapter must do actual reads |
| Complete score/source/Issue/PR/SHA/version/smoke report | Preserved; redact credentials/private source data |

Before activation: establish serialized execution; register durable private QA
packet/package retrieval; review and merge the maintenance PR; verify its exact
main push CI; complete nonpublishing fresh-run/restart rehearsal; then separately
authorize scheduler replacement. Keep the original task untouched until the
replacement is confirmed. Current patch does not itself enable a scheduler.
