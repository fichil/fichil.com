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

## Nonpublishing batch implementation (additional checkpoint)

`tools/cloud_blog_batch.py` now supplies executable nonpublishing orchestration:

- Shanghai schedule/window identity, same-workspace process exclusion, complete
  remote reconstruction gates, pending-PR-first recovery and two semantic-review
  adapter passes around TOP_1 selection.
- Separate `NO_NEW_TOPIC`, `NO_CHANGE`, review-wait, unknown mutation outcome and
  `TECHNICAL_FAILURE` results. Technical failure blocks release planning.
- SHA-256-verified bounded private archive extraction into fresh directories;
  rejects traversal, duplicate entries, links and special files. Private packet
  restoration verifies every file and the four bilingual viewport references,
  binds the packet to head/content, and returns `RESTORED_REVERIFY_REQUIRED`.
- Unique exact-key/target reconciliation for Issue, commit, PR, merge, Sites
  version and deployment results. Missing reads or uncertain creates never turn
  into a blind retry. Conflicting keys and multiple matches block progress.
- Deployment restart recovery retains the actual ID and completion timestamp;
  it cannot reset the stabilization deadline or reuse pre-restart samples.

The runner has **no external mutation functions or execute switch**. Runtime
ports must be trusted adapters, not JSON copied from PR descriptions. Tests mark
all simulated ports `MOCK`; `LIVE_READ_ONLY` may be used only when all invoked
ports actually collect fresh connector evidence. Reading a real ref separately
is not a live end-to-end batch rehearsal. Semantic review is deliberately an
adapter call, not keyword matching represented as semantic understanding.

`local_guard` is a process lock, not distributed serialization. Different cloud
workspaces do not share it. The exposed scheduling schema has not established
an atomic one-writer guarantee. Before enabling writes, the runtime must supply
a verified exclusive owner for the whole workflow, covering article and Sites
mutations, plus restart recovery. An expired lease alone must not allow a second
writer while an earlier external request is unresolved. An Issue comment or
local lock cannot supply that guarantee. Until then, all plans remain read-only.

### Remaining activation blockers

1. Bind and demonstrate complete live source/history/Sites adapters, including
   paginated closed Issues, historical semantic dedup and private evidence
   reacquisition. The Python port tests do not establish connector completeness.
2. Establish authoritative cross-workspace serialization; keep unknown external
   operation outcomes unresolved until a unique remote result is recovered.
3. Prove fresh bootstrap/submodule/toolchain access in the intended dot cloud
   runtime without bypassing denied downloads. A local clone of an existing
   checkout validates code isolation, not fresh network bootstrap.
4. Complete actual full QA and four inspected mobile screenshots in that same
   execution route. A blocked Chromium launch remains a blocker; mock evidence,
   packet transport tests and earlier CI results do not waive it.
5. Bind and test the full guarded write executor, including Issue creation,
   atomic two-file commit/Draft PR after QA, exact-head approval, the existing
   normal protected merge adapter, main push CI/build/Sites and smoke/rollback.
6. Separately authorize scheduler cutover after maintenance review and all
   nonpublishing live/fresh/restart rehearsals pass. No schedule is created or
   changed by these additions.

The existing Actions Python discovery automatically includes the new batch tests.
No article, screenshot, private Library identity or private evidence belongs in
this maintenance patch. Package reacquisition and package self-tests are distinct
from actual article QA. Private packet transport tests use explicitly synthetic
fixtures and cannot approve or publish an article.

### Proposed GitHub CAS serialization adapter (not activated)

`tools/cloud-blog-lease.mjs` implements a credential-free candidate protocol
using the supported `github.update_ref` connector's `expected_sha` field with
`force=false`. It targets a dedicated `automation/blog-runner-state` ref, not
`main` or `chatgpt`. Bootstrap is deliberately absent and requires separate
approval before any live trial. The read-only default returns a transition
plan without creating commits or refs. `execute=true` is exercised only with
mock tools in this patch.

The existing state commit's unchanged tree is reused. Its commit message stores
only a strict schema of opaque owner ID, monotonic epoch, bounded expiry and at
most one opaque pending-operation ID/kind/target SHA. No claim maps, Library
references, private evidence, article prose or credentials belong there. Each
transition creates one single-parent state commit, advances the ref by CAS,
and reads back the exact commit; rejection or uncertain response never causes
a blind retry. A fence requires current state SHA + owner + epoch; immediately
before a side effect, the pending operation and unexpired lease are re-read.
Unknown operations remain journaled and prevent overlapping work or release.

This is cooperative serialization, **not downstream-enforced Sites fencing**.
The Sites API does not currently establish a fencing-token contract. Therefore
an expiry never transfers ownership automatically: it stops new actions, and
all competing workers remain blocked. The same sole owner may reconcile an
already-started operation and explicitly release after no operation remains.
If that owner is lost, manual recovery requires proof that it is quiescent,
reconciliation of the remote outcome and a separately reviewed recovery change.
No lock deletion, lease theft or timer-only recovery API is included.

To turn this candidate into an authoritative workflow gate, separately approve
creating the dedicated state ref and a no-publication CAS contention test using
supported connectors. Then bind **every** GitHub/Sites mutation to the protocol,
including persist-intent before request and verified-outcome before release.
No uncontrolled alternate publisher may participate. Verify connector CAS
semantics under simultaneous contenders, uncertain replies and stale workers.
If the provider cannot guarantee atomic expected-head rejection, or if any
mutator can outlive ownership without being fenced, stop rather than activate.
The automation schedule itself supplies no assumed serialization guarantee.

## Live read binding and disabled execution interfaces

`cloud-blog-read-state.mjs` binds supported read-only GitHub and Sites adapters.
It paginates PRs/Issues, reads all content-history commit trees and unique article
blobs, verifies Git blob identity, gathers all saved versions and exact-main push
CI, and rechecks refs at the end. `collection_complete` concerns those lists and
article context only; `execution_evidence_complete` remains false. It does not
claim full selected-PR QA/review or live production smoke. Secrets and temporary
Sites screenshot/source credentials are excluded from normalized output. The
provenance default is `MOCK`; actual read adapters opt into `LIVE_READ_ONLY`.

`cloud-blog-execution-plan.mjs` now exposes six strictly nonmutating interfaces:
`planIssue`, `planArticleCommit`, `planDraftPR`, `planMerge`, `planRelease`, and
`planSmoke`. Outputs are frozen `PLAN_ONLY` descriptions, never dispatchable
capabilities. Trusted evidence is required for full QA/four distinct inspected
viewports, current exact-head user approval, real verify-review, latest exact
push CI, matching build/source/saved version, and known-good rollback. The exact
original nine core smoke paths are enforced, plus both canonical article routes,
www canonical redirect and exact version. No network/tool/execute interface exists.

`cloud_blog_rehearsal.py` replays a SHA-256-pinned captured live snapshot into a
local plan, re-verifying every article Git blob. Fresh-directory replay is not a
second live scan, a new executor restart, or successful fresh Git bootstrap. It
keeps unqualified cloud tasks skipped, leaves semantic review explicitly undone,
and never promotes unavailable screenshots or source facts into article approval.

### Minimal proposed isolated CAS trial; separate approval required

Proposed nonproduction ref: `automation/blog-runner-cas-rehearsal-20261010`.
This differs from the future production state ref. Do not create either ref as
part of installing this code. The existing CAS adapter must first gain an
explicitly allowlisted isolated-test binding; no arbitrary branch override.

After approval, a bounded trial would use four metadata-only commits with the
same tree: one idle bootstrap, two competing owners from the same initial parent,
and one final release. Create only the named test ref; race the two owner updates
using the same expected SHA and force=false; require exactly one success. Simulate
a lost client response without repeating the update, then recover the actual
owner from a separate fresh read. Reconstruct ownership after discarding local
state. An expired owner must still block takeover. Since no GitHub content or
Sites request is dispatched, the confirmed sole owner may release the idle lease.
Keep the final test ref for inspection; deletion would require separate approval.
No PR, `main`, `chatgpt`, production state ref, Site, schedule, credential or access
configuration is part of that trial. Provider CAS failure blocks activation.

Remaining runtime functions are concrete: an approved isolated CAS trial binding;
a fenced dispatcher that persists intent and reconciles result around every
mutation; trusted source/semantic review producing a selected candidate; actual
local article generation and registered full QA with screenshots; private packet
save/reacquisition; exact-head approval verification; and build/source/save/deploy/
smoke/rollback adapters. None is silently supplied by a valid plan.
