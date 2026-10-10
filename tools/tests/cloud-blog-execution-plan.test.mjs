import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as api from '../cloud-blog-execution-plan.mjs';
const {PlanGateError, REPOSITORY, CORE_SMOKE_PATHS, CONTENT_CHECKS, RELEASE_CHECKS, sha256, articleContentHash,
  planIssue, planArticleCommit, planDraftPR, planMerge, planRelease, planSmoke} = api;
const A = 'a'.repeat(40), B = 'b'.repeat(40), C = 'c'.repeat(40), H = 'd'.repeat(64);
const NOW = '2026-10-10T06:59:00Z';
const at = seconds => new Date(Date.parse(NOW) + seconds * 1000).toISOString();
const clone = v => structuredClone(v);
const envelope = evidence => ({schema_version: 1, mode: 'MOCK', run_id: 'synthetic-unit-test', observed_at: NOW, evidence});
const checks = names => Object.fromEntries(names.map(name => [name, {status: 'passed', evidence_sha256: sha256(`MOCK ${name}`)}]));
const issue = () => ({complete: true, slug: 'topic', matches: [{number: 7, slug: 'topic', state: 'open', created_at: at(-300), confirmed_at: at(-290)}]});
const ancestry = head => ({main_sha: B, head_sha: head, status: 'ahead', behind_by: 0});
function reportFixture(contentHash) {
  // This synthetic flat object has lexically sorted keys; its hash follows the
  // registered skill's canonical JSON rule. Pretty file bytes differ on purpose.
  const document = {content_sha256: contentHash, note: 'MOCK report, no actual QA was performed', status: 'review_ready'};
  const skillHash = sha256(JSON.stringify(document));
  const raw = `${JSON.stringify({...document, qa_report_sha256: skillHash}, null, 2)}\n`;
  return {qa_report_sha256: skillHash, report: {content: raw, sha256: sha256(raw)},
    verified_report: {status: 'review_ready', content_sha256: contentHash, qa_report_sha256: skillHash, report_bytes_sha256: sha256(raw)}};
}
function article() {
  const files = ['en', 'zh-cn'].map(locale => ({path: `content/${locale}/blog/topic/index.md`, status: 'added',
    content: `MOCK article bytes, not publishable: ${locale}`, sha256: sha256(`MOCK article bytes, not publishable: ${locale}`), written_at: at(-280)}));
  const content = articleContentHash(files), report = reportFixture(content);
  return {repository: REPOSITORY, slug: 'topic', issues: issue(), files, qa: {
    skill: 'fichil-content-qa', package_sha256: H, package_selftests: {status: 'passed', evidence_sha256: H}, status: 'review_ready',
    execution: {kind: 'MOCK', operation: 'full-qa', invocation_id: 'mock-full-qa', completed_at: at(-240), verified_report: report.verified_report},
    byte_bundle_sha256: content, content_sha256: content, assets_sha256: H, qa_report_sha256: report.qa_report_sha256, report: report.report, checks: checks(CONTENT_CHECKS),
    screenshots: ['en', 'zh-cn'].flatMap(locale => [[360, 800], [390, 844]].map(([width, height]) => ({locale, width, height,
      image_sha256: sha256(`MOCK screenshot ${locale} ${width}`), content_sha256: content, assets_sha256: H,
      captured_at: at(-260), inspected_at: at(-250), inspection: 'passed', inspection_sha256: H}))),
  }};
}
const fullDiff = fs => ({complete: true, files: fs.map(f => ({path: f.path, status: f.status, sha256: f.sha256}))});
function articleInput() { return envelope({...article(), main_sha: B, branch_head_sha: A, ancestry: ancestry(A), branch_diff: [], open_blog_prs: [], reconstruction_complete: true}); }
function draftInput() {
  const a = article(); return envelope({...a, commit: {sha: C, parents: [A], expected_parent_sha: A, byte_bundle_sha256: articleContentHash(a.files), created_at: at(-200), readback_at: at(-190)},
    remote_ref_sha: C, full_diff: fullDiff(a.files), open_blog_prs: [], reconstruction_complete: true});
}
function mergeInput(draft = false) {
  const a = article(), binding = {head_sha: A, content_sha256: articleContentHash(a.files), assets_sha256: H, qa_report_sha256: a.qa.qa_report_sha256};
  return envelope({...a,
    pr: {number: 8, state: 'open', merged: false, draft, auto_merge: null, base_repository: REPOSITORY, head_repository: REPOSITORY,
      base_ref: 'main', head_ref: 'chatgpt', head_sha: A, read_at: at(-5), ready_at: draft ? null : at(-10), mergeable: true,
      body: `<!-- codex-workday-bilingual-blog -->\n<!-- fichil-content-qa-approval:v1 status=approved head_sha=${A} content_sha256=${binding.content_sha256} qa_report_sha256=${binding.qa_report_sha256} -->\nCloses #7`},
    full_diff: fullDiff(a.files), approval: {kind: 'EXPLICIT_CURRENT_HEAD_CONTENT_APPROVAL', user_id: 'mock-owner', message_id: 'mock-message', ...binding, granted_at: at(-30)},
    verify_review: {skill: 'fichil-content-qa', package_sha256: H, status: 'approved', execution: {kind: 'MOCK', operation: 'verify-review', invocation_id: 'mock-verify', completed_at: at(-3)}, ...binding, byte_bundle_sha256: articleContentHash(a.files), evidence_sha256: H},
    main_sha: B, ancestry: ancestry(A), checks: {complete: true, items: ['build', 'sites'].map((name, i) => ({id: i + 1, name, app_id: 15368, head_sha: A, status: 'completed', conclusion: 'success'}))},
    reviews: {complete: true, items: []},
  });
}
function run() { return {id: 12, name: 'Site Build Check', path: '.github/workflows/hugo-check.yml', event: 'push', head_branch: 'main', head_sha: B, run_number: 9, run_attempt: 2, status: 'completed', conclusion: 'success'}; }
function releaseInput() {
  const r = run(); return envelope({repository: REPOSITORY, main_sha: B,
    checkout: {sha: B, clean: true, submodules_pinned: true, tracked_unchanged: true},
    ci: {complete: true, runs: [r], selected_run: clone(r), selected_read_at: at(-5)},
    live: {commit_sha: A, version_id: 'known-good'}, known_good: {version_id: 'known-good', commit_sha: A, verified_at: at(-300), smoke_sha256: H},
    build: {commit_sha: B, hugo_version: '0.160.1', node_version: '22.13.0', workspace_local_npm_cache: true, clean_after: true, submodules_pinned: true, artifact_sha256: H, checks: checks(RELEASE_CHECKS)},
    source: {commit_sha: B, confirmed_at: at(-10)}, archive: {commit_sha: B, build_sha256: H, archive_sha256: H},
    versions: {complete: true, items: [{version_id: 'target-version', commit_sha: B, source_commit_sha: B, build_sha256: H, archive_sha256: H},
      {version_id: 'known-good', commit_sha: A, source_commit_sha: A, build_sha256: H, archive_sha256: H}]},
  });
}
function smokeInput() {
  const entries = [...CORE_SMOKE_PATHS];
  const routes = {en: '/blog/topic/', 'zh-cn': '/zh-cn/blog/topic/'};
  const uncached = (s, token) => ({at: at(s), query_token: token, cache_control: 'no-cache', pragma: 'no-cache'});
  return envelope({repository: REPOSITORY,
    deployment: {id: 'actual-deployment-id', version_id: 'target-version', target_sha: B, status: 'succeeded', completed_at: at(-120), persisted_completed_at: at(-120)},
    known_good: {version_id: 'known-good', commit_sha: A, verified_at: at(-300), smoke_sha256: H}, routes, restart_at: null,
    samples: [-60, -50, -40].map((s, i) => ({...uncached(s, `prop-${i}`), commit_sha: B, en_status: 200, zh_cn_status: 200})),
    core_manifest: {origin: 'https://fichil.com', entries, sha256: sha256(JSON.stringify(entries))},
    full_rounds: [-30, -20, -10].map((s, i) => ({...uncached(s, `full-${i}`), core_status: Object.fromEntries(entries.map(p => [p, 200])),
      article_status: Object.fromEntries(Object.values(routes).map(p => [p, 200])), commit_sha: B, version_status: 200, www_status: 308, www_location: 'https://fichil.com/'})),
  });
}
function rejects(label, fn, fixture, mutate) { test(label, () => { const input = fixture(); mutate(input.evidence, input); assert.throws(() => fn(input, NOW), PlanGateError); }); }

test('module exposes plans only: no executor, tool dispatch, external I/O or mutation switch', () => {
  assert.deepEqual(Object.keys(api).sort(), ['CONTENT_CHECKS', 'CORE_SMOKE_PATHS', 'MOBILE_VIEWPORTS', 'PlanGateError', 'RELEASE_CHECKS', 'REPOSITORY', 'articleContentHash', 'planArticleCommit', 'planDraftPR', 'planIssue', 'planMerge', 'planRelease', 'planSmoke', 'sha256'].sort());
  const source = readFileSync(new URL('../cloud-blog-execution-plan.mjs', import.meta.url), 'utf8');
  assert.equal(/\b(?:fetch|eval|require|spawn|setTimeout)\s*\(|\bimport\s*\(/.test(source), false);
  assert.deepEqual([...source.matchAll(/from ['"]([^'"]+)['"]/g)].map(m => m[1]), ['node:crypto']);
  for (const [fn, fixture] of [[planArticleCommit, articleInput], [planDraftPR, draftInput], [planMerge, mergeInput], [planRelease, releaseInput], [planSmoke, smokeInput]]) {
    const input = fixture(), before = clone(input), r = fn(input, NOW); assert.equal(r.external_mutations, false); assert.equal(r.evidence_mode, 'MOCK'); assert.equal(r.status, 'PLAN_ONLY');
    assert.ok(Object.isFrozen(r) && Object.isFrozen(r.intents)); assert.deepEqual(input, before);
    assert.throws(() => { r.intents.push({kind: 'unsafe'}); }, TypeError);
    input.execute = true; assert.throws(() => fn(input, NOW), PlanGateError);
  }
});
test('tool/function/accessor objects are rejected without invoking them', () => {
  let called = false;
  for (const shape of [Object.assign(articleInput(), {tools: {mutate() { called = true; }}}), Object.defineProperty(articleInput(), 'execute', {enumerable: true, get() { called = true; return true; }})]) assert.throws(() => planArticleCommit(shape, NOW), PlanGateError);
  assert.equal(called, false);
});
test('new Issue intent blocks writing until unique remote Issue is confirmed', () => {
  const input = envelope({repository: REPOSITORY, slug: 'topic', issues: {complete: true, slug: 'topic', matches: []}});
  const p = planIssue(input, NOW); assert.equal(p.intents[0].kind, 'CREATE_UNIQUE_ISSUE'); assert.equal(p.article_writing, 'BLOCKED_UNTIL_REMOTE_ISSUE_CONFIRMED');
  input.evidence.issues = issue(); assert.equal(planIssue(input, NOW).intents[0].kind, 'REUSE_UNIQUE_ISSUE');
});
test('atomic commit intent contains exactly two byte-bound files, one verified parent, no force', () => {
  const p = planArticleCommit(articleInput(), NOW), intent = p.intents[0]; assert.equal(intent.kind, 'CREATE_ATOMIC_TWO_FILE_COMMIT'); assert.deepEqual(intent.parents, [A]);
  assert.equal(intent.expected_parent_sha, A); assert.equal(intent.force, false); assert.equal(intent.files.length, 2); assert.equal(p.intents.length, 1);
});
for (const [name, mutate] of [
  ['missing unique Issue', e => { e.issues.matches = []; }],
  ['duplicate Issue', e => { e.issues.matches.push({...e.issues.matches[0], number: 9}); }],
  ['closed Issue', e => { e.issues.matches[0].state = 'closed'; }],
  ['partial Issue history', e => { e.issues.complete = false; }],
  ['writing before Issue confirmation', e => { e.files[0].written_at = at(-400); }],
  ['old branch changes', e => { e.branch_diff = ['content/en/old.md']; }],
  ['existing PR', e => { e.open_blog_prs = [8]; }],
  ['branch behind main', e => { e.ancestry.behind_by = 1; }],
  ['partial reconstruction', e => { e.reconstruction_complete = false; }],
  ['third file', e => { e.files.push({...e.files[0], path: 'README.md'}); }],
  ['different bilingual slug', e => { e.files[1].path = 'content/zh-cn/blog/other/index.md'; }],
  ['file overwrite', e => { e.files[0].status = 'modified'; }],
  ['changed actual bytes', e => { e.files[0].content += ' changed'; }],
  ['non-review-ready QA', e => { e.qa.status = 'approved'; }],
  ['QA predates content', e => { e.qa.execution.completed_at = at(-285); }],
  ['report bytes changed', e => { e.qa.report.content += ' changed'; }],
  ['missing content check', e => { delete e.qa.checks.privacy; }],
  ['failed privacy check', e => { e.qa.checks.privacy.status = 'failed'; }],
  ['failed QA selftest', e => { e.qa.package_selftests.status = 'failed'; }],
  ['missing screenshot', e => { e.qa.screenshots.pop(); }],
  ['duplicate viewport', e => { e.qa.screenshots[1] = clone(e.qa.screenshots[0]); }],
  ['duplicate screenshot bytes', e => { e.qa.screenshots[1].image_sha256 = e.qa.screenshots[0].image_sha256; }],
  ['uninspected screenshot', e => { e.qa.screenshots[0].inspection = 'pending'; }],
  ['wrong screenshot content', e => { e.qa.screenshots[0].content_sha256 = H; }],
  ['wrong screenshot assets', e => { e.qa.screenshots[0].assets_sha256 = 'a'.repeat(64); }],
  ['inspection after report', e => { e.qa.screenshots[0].inspected_at = at(-200); }],
]) rejects(`article gate: ${name}`, planArticleCommit, articleInput, mutate);
rejects('freshness: stale envelope', planArticleCommit, articleInput, (_, i) => { i.observed_at = at(-61); });
rejects('freshness: future envelope', planArticleCommit, articleInput, (_, i) => { i.observed_at = at(1); });
rejects('provenance: MOCK skill cannot be presented as a real adapter', planArticleCommit, articleInput, (_, i) => { i.mode = 'TRUSTED_ADAPTER'; });
rejects('provenance: live rehearsal label is not accepted', planArticleCommit, articleInput, (_, i) => { i.mode = 'LIVE_READ_ONLY'; });
rejects('strict schema: wrong repository', planArticleCommit, articleInput, e => { e.repository = 'attacker/repo'; });
rejects('strict schema: unknown nested execution flag', planArticleCommit, articleInput, e => { e.qa.execute = true; });
test('real-mode claims remain explicitly trusted-boundary claims, never authorization', () => {
  const input = articleInput(); input.mode = 'TRUSTED_ADAPTER'; input.evidence.qa.execution.kind = 'REAL_SKILL_EXECUTION';
  const p = planArticleCommit(input, NOW); assert.equal(p.status, 'PLAN_ONLY'); assert.equal(p.external_mutations, false); assert.equal(p.evidence_mode, 'TRUSTED_ADAPTER');
});
test('local byte binding never substitutes its algorithm for the registered skill content hash', () => {
  const i = mergeInput(), previous = i.evidence.qa.content_sha256, previousReport = i.evidence.qa.qa_report_sha256, skillHash = sha256('MOCK independent skill-defined content digest');
  i.evidence.qa.content_sha256 = skillHash; i.evidence.qa.screenshots.forEach(s => { s.content_sha256 = skillHash; });
  i.evidence.approval.content_sha256 = skillHash; i.evidence.verify_review.content_sha256 = skillHash;
  const report = reportFixture(skillHash); i.evidence.qa.report = report.report; i.evidence.qa.qa_report_sha256 = report.qa_report_sha256; i.evidence.qa.execution.verified_report = report.verified_report;
  i.evidence.approval.qa_report_sha256 = report.qa_report_sha256; i.evidence.verify_review.qa_report_sha256 = report.qa_report_sha256;
  i.evidence.pr.body = i.evidence.pr.body.replace(`content_sha256=${previous}`, `content_sha256=${skillHash}`).replace(`qa_report_sha256=${previousReport}`, `qa_report_sha256=${report.qa_report_sha256}`);
  assert.equal(planMerge(i, NOW).intents[0].kind, 'NORMAL_SERVER_PROTECTED_MERGE');
  i.evidence.verify_review.byte_bundle_sha256 = H; assert.throws(() => planMerge(i, NOW), PlanGateError);
});
test('raw report hash and registered canonical report hash remain distinct through commit and merge', () => {
  const a = articleInput(), q = a.evidence.qa; assert.notEqual(q.report.sha256, q.qa_report_sha256);
  assert.equal(planArticleCommit(a, NOW).intents[0].qa_report_sha256, q.qa_report_sha256);
  const m = mergeInput(); assert.ok(m.evidence.pr.body.includes(`qa_report_sha256=${m.evidence.qa.qa_report_sha256}`));
  assert.equal(planMerge(m, NOW).intents[0].kind, 'NORMAL_SERVER_PROTECTED_MERGE');
});
function rewriteReport(e, mutate) {
  const parsed = JSON.parse(e.qa.report.content); mutate(parsed);
  e.qa.report.content = JSON.stringify(parsed, null, 2); e.qa.report.sha256 = sha256(e.qa.report.content);
  e.qa.execution.verified_report.report_bytes_sha256 = e.qa.report.sha256;
}
test('different report whitespace preserves verified skill hash but must rebind actual file bytes', () => {
  const i = mergeInput(), skillHash = i.evidence.qa.qa_report_sha256;
  i.evidence.qa.report.content = JSON.stringify(JSON.parse(i.evidence.qa.report.content));
  i.evidence.qa.report.sha256 = sha256(i.evidence.qa.report.content);
  assert.throws(() => planMerge(i, NOW), PlanGateError);
  i.evidence.qa.execution.verified_report.report_bytes_sha256 = i.evidence.qa.report.sha256;
  assert.equal(planMerge(i, NOW).intents[0].kind, 'NORMAL_SERVER_PROTECTED_MERGE'); assert.equal(i.evidence.qa.qa_report_sha256, skillHash);
});
for (const [name, mutate] of [
  ['raw byte hash substituted for normalized skill report digest', e => { e.qa.qa_report_sha256 = e.qa.report.sha256; }],
  ['raw byte hash substituted into approval marker', e => { e.pr.body = e.pr.body.replace(`qa_report_sha256=${e.qa.qa_report_sha256}`, `qa_report_sha256=${e.qa.report.sha256}`); }],
  ['raw byte hash substituted into verify-review', e => { e.verify_review.qa_report_sha256 = e.qa.report.sha256; }],
  ['report JSON is malformed even with a matching byte hash', e => { e.qa.report.content = 'not JSON'; e.qa.report.sha256 = sha256(e.qa.report.content); e.qa.execution.verified_report.report_bytes_sha256 = e.qa.report.sha256; }],
  ['parsed report status differs from trusted normalized status', e => { rewriteReport(e, r => { r.status = 'blocked'; }); }],
  ['parsed report content digest differs from current content', e => { rewriteReport(e, r => { r.content_sha256 = H; }); }],
  ['parsed canonical report digest differs from skill result', e => { rewriteReport(e, r => { r.qa_report_sha256 = H; }); }],
  ['parsed report lacks canonical digest', e => { rewriteReport(e, r => { delete r.qa_report_sha256; }); }],
  ['missing actual invocation report binding', e => { delete e.qa.execution.verified_report; }],
  ['invocation verified a different raw report', e => { e.qa.execution.verified_report.report_bytes_sha256 = H; }],
  ['invocation returned a different canonical report digest', e => { e.qa.execution.verified_report.qa_report_sha256 = H; }],
]) rejects(`registered report binding: ${name}`, planMerge, mergeInput, mutate);
rejects('sparse evidence arrays are not complete JSON collections', planArticleCommit, articleInput, e => { delete e.qa.screenshots[1]; });
test('Draft PR uses read-back remote head and always starts Draft', () => { const p = planDraftPR(draftInput(), NOW); assert.equal(p.intents[0].expected_remote_head_sha, C); assert.equal(p.intents[0].draft, true); });
for (const [name, mutate] of [
  ['predicted SHA differs from remote', e => { e.remote_ref_sha = B; }],
  ['commit before full QA', e => { e.commit.created_at = at(-245); }],
  ['unexpected commit parent', e => { e.commit.parents = [B]; }],
  ['multi-parent article commit', e => { e.commit.parents = [A, B]; }],
  ['readback before commit', e => { e.commit.readback_at = at(-210); }],
  ['remote bytes differ', e => { e.full_diff.files[0].sha256 = H; }],
  ['incomplete remote diff', e => { e.full_diff.complete = false; }],
  ['uncertain existing PR result', e => { e.open_blog_prs = [8]; }],
]) rejects(`Draft PR gate: ${name}`, planDraftPR, draftInput, mutate);
test('Draft merge plan stops at Ready, requiring a fresh post-Ready plan', () => { const p = planMerge(mergeInput(true), NOW); assert.deepEqual(p.intents.map(i => i.kind), ['MARK_READY_FOR_REVIEW']); assert.match(p.next_gate, /AFTER_READY/); });
test('merge intent is normal protected exact-head merge with reconciliation', () => { const p = planMerge(mergeInput(), NOW).intents[0]; assert.equal(p.kind, 'NORMAL_SERVER_PROTECTED_MERGE'); assert.equal(p.expected_head_sha, A); assert.equal(p.merge_method, 'merge'); assert.match(p.on_unknown, /WITHOUT_RETRY/); });
for (const [name, mutate] of [
  ['ordinary yes', e => { e.approval.kind = 'YES'; }],
  ['missing message provenance', e => { e.approval.message_id = ''; }],
  ['stale user head', e => { e.approval.head_sha = B; }],
  ['remote head race', e => { e.pr.head_sha = B; }],
  ['stale approved assets', e => { e.approval.assets_sha256 = 'a'.repeat(64); }],
  ['stale verify report hash', e => { e.verify_review.qa_report_sha256 = H; }],
  ['wrong skill', e => { e.verify_review.skill = 'some-other-skill'; }],
  ['verify before fresh remote head read', e => { e.verify_review.execution.completed_at = at(-6); }],
  ['approval before full QA', e => { e.approval.granted_at = at(-250); }],
  ['Ready after latest PR read', e => { e.pr.ready_at = at(-4); }],
  ['native auto-merge exists', e => { e.pr.auto_merge = {}; }],
  ['not mergeable', e => { e.pr.mergeable = null; }],
  ['fork head repository', e => { e.pr.head_repository = 'other/repo'; }],
  ['stale marker', e => { e.pr.body = e.pr.body.replace(`head_sha=${A}`, `head_sha=${B}`); }],
  ['duplicate marker', e => { e.pr.body += e.pr.body; }],
  ['missing issue closure', e => { e.pr.body = e.pr.body.replace('Closes #7', 'Closes #9'); }],
  ['wrong check app', e => { e.checks.items[0].app_id = 1; }],
  ['partial checks', e => { e.checks.complete = false; }],
  ['newer failed check supersedes success', e => { e.checks.items.push({...e.checks.items[0], id: 3, conclusion: 'failure'}); }],
  ['newer pending check supersedes success', e => { e.checks.items.push({...e.checks.items[0], id: 3, status: 'in_progress', conclusion: null}); }],
  ['outstanding change request', e => { e.reviews.items = [{id: 1, user_id: 'reviewer', state: 'CHANGES_REQUESTED'}]; }],
  ['partial reviews', e => { e.reviews.complete = false; }],
]) rejects(`merge gate: ${name}`, planMerge, mergeInput, mutate);
test('later reviewer approval supersedes that reviewer change request', () => { const i = mergeInput(); i.evidence.reviews.items = [{id: 1, user_id: 'r', state: 'CHANGES_REQUESTED'}, {id: 2, user_id: 'r', state: 'APPROVED'}]; assert.equal(planMerge(i, NOW).intents[0].kind, 'NORMAL_SERVER_PROTECTED_MERGE'); });
test('release phases cannot skip build, source, saved-version readback or known-good rollback', () => {
  const i = releaseInput(); assert.equal(planRelease(i, NOW).intents[0].kind, 'DEPLOY_VERIFIED_VERSION');
  i.evidence.versions.items = i.evidence.versions.items.filter(v => v.version_id === 'known-good'); assert.equal(planRelease(i, NOW).intents[0].kind, 'SAVE_EXACT_MAIN_VERSION');
  i.evidence.source = null; assert.equal(planRelease(i, NOW).intents[0].kind, 'PUSH_EXACT_MAIN_SOURCE');
  i.evidence.build = null; i.evidence.archive = null; assert.equal(planRelease(i, NOW).intents[0].kind, 'RUN_COMPLETE_LOCAL_RELEASE_QA');
});
test('live exact main is a no-op after exact push CI and saved-version identity verification', () => { const i = releaseInput(); i.evidence.live = {commit_sha: B, version_id: 'target-version'}; assert.equal(planRelease(i, NOW).outcome, 'NOOP_ONLINE_CURRENT'); });
test('deploy intent keeps independently resolved target and rollback identities distinct', () => {
  const i = releaseInput(), p = planRelease(i, NOW).intents[0];
  assert.notEqual(p.version_id, p.rollback_version_id);
  assert.equal(i.evidence.versions.items.find(v => v.version_id === p.version_id).commit_sha, B);
  assert.equal(i.evidence.versions.items.find(v => v.version_id === p.rollback_version_id).commit_sha, A);
});
for (const [name, mutate] of [
  ['dirty checkout', e => { e.checkout.clean = false; }],
  ['wrong checkout SHA', e => { e.checkout.sha = A; }],
  ['unpinned submodule', e => { e.checkout.submodules_pinned = false; }],
  ['PR-only CI', e => { e.ci.runs[0].event = 'pull_request'; }],
  ['wrong workflow path', e => { e.ci.runs[0].path = '.github/workflows/other.yml'; }],
  ['wrong push branch', e => { e.ci.runs[0].head_branch = 'chatgpt'; }],
  ['wrong push SHA', e => { e.ci.runs[0].head_sha = A; }],
  ['partial push runs', e => { e.ci.complete = false; }],
  ['newer failed attempt', e => { e.ci.runs.push({...e.ci.runs[0], run_attempt: 3, conclusion: 'failure'}); }],
  ['newer pending workflow run', e => { e.ci.runs.push({...e.ci.runs[0], id: 13, run_number: 10, status: 'in_progress', conclusion: null}); }],
  ['reread changed attempt', e => { e.ci.selected_run.run_attempt = 1; }],
  ['reread became pending', e => { e.ci.selected_run.status = 'in_progress'; e.ci.selected_run.conclusion = null; }],
  ['ambiguous CI ordering identity', e => { e.ci.runs.push({...e.ci.runs[0], id: 99}); }],
  ['missing rollback version', e => { e.known_good.version_id = ''; }],
  ['rollback not previously live', e => { e.known_good.commit_sha = C; }],
  ['target version ID reused as live and rollback for a different SHA', e => { e.live.version_id = 'target-version'; e.known_good.version_id = 'target-version'; }],
  ['rollback saved ID maps to different commit', e => { e.versions.items[1].commit_sha = C; e.versions.items[1].source_commit_sha = C; }],
  ['rollback saved source differs from commit', e => { e.versions.items[1].source_commit_sha = C; }],
  ['rollback saved ID missing from complete list', e => { e.versions.items.pop(); }],
  ['no-op live SHA conflicts with saved version ID', e => { e.live.commit_sha = B; }],
  ['wrong built SHA', e => { e.build.commit_sha = A; }],
  ['wrong source SHA', e => { e.source.commit_sha = A; }],
  ['wrong archive SHA', e => { e.archive.commit_sha = A; }],
  ['wrong archive build bytes', e => { e.archive.build_sha256 = 'a'.repeat(64); }],
  ['wrong saved source SHA', e => { e.versions.items[0].source_commit_sha = A; }],
  ['wrong saved archive bytes', e => { e.versions.items[0].archive_sha256 = 'a'.repeat(64); }],
  ['duplicate saved target versions', e => { e.versions.items.push({...e.versions.items[0], version_id: 'duplicate'}); }],
  ['incomplete versions', e => { e.versions.complete = false; }],
  ['failed browser regression', e => { e.build.checks.browser_accessibility.status = 'failed'; }],
  ['missing security audit', e => { delete e.build.checks.security_audit; }],
  ['wrong pinned Hugo', e => { e.build.hugo_version = 'latest'; }],
  ['wrong pinned Node', e => { e.build.node_version = 'latest'; }],
  ['shared npm cache', e => { e.build.workspace_local_npm_cache = false; }],
  ['source token payload', e => { e.source.token = 'never accepted'; }],
]) rejects(`release gate: ${name}`, planRelease, releaseInput, mutate);
test('success requires simultaneous propagation and three full uncached rounds', () => { const p = planSmoke(smokeInput(), NOW); assert.equal(p.outcome, 'STABLE_FULL_SMOKE_VERIFIED'); assert.deepEqual(p.intents, []); });
test('canonical nine smoke entries match original publisher contract', () => {
  assert.deepEqual(CORE_SMOKE_PATHS, ['/', '/zh-cn/', '/blog/', '/zh-cn/blog/', '/blog/index.xml', '/zh-cn/blog/index.xml', '/sitemap.xml', '/zh-cn/sitemap.xml', '/version.json']);
});
test('stable propagation alone is not full smoke success', () => { const i = smokeInput(); i.evidence.full_rounds = []; assert.equal(planSmoke(i, NOW).outcome, 'STABLE_AWAITING_THREE_FULL_SMOKE_ROUNDS'); });
test('one transient failure keeps propagating, never rolls back', () => { const i = smokeInput(); i.evidence.samples[2].en_status = 503; i.evidence.full_rounds = []; assert.equal(planSmoke(i, NOW).outcome, 'PROPAGATING'); });
test('three same-route target failures produce only a known-good rollback intent', () => { const i = smokeInput(); i.evidence.samples.forEach(s => { s.en_status = 503; }); i.evidence.full_rounds = []; const p = planSmoke(i, NOW); assert.equal(p.reason, 'THREE_CONSECUTIVE_SAME_ROUTE_FAILURES'); assert.equal(p.intents[0].version_id, 'known-good'); assert.match(p.next_gate, /VERIFY_ROLLBACK/); });
test('alternating route errors do not falsely meet consecutive same-route failure gate', () => { const i = smokeInput(); i.evidence.samples[0].en_status = 503; i.evidence.samples[1].zh_cn_status = 503; i.evidence.samples[2].en_status = 503; i.evidence.full_rounds = []; assert.equal(planSmoke(i, NOW).outcome, 'PROPAGATING'); });
test('restart retains original deadline, discards older observations and cannot reset expiry', () => {
  const i = smokeInput(); i.evidence.deployment.completed_at = at(-181); i.evidence.deployment.persisted_completed_at = at(-181); i.evidence.restart_at = at(-10); i.evidence.samples = []; i.evidence.full_rounds = [];
  const p = planSmoke(i, NOW); assert.equal(p.reason, 'ORIGINAL_STABILIZATION_WINDOW_EXPIRED'); assert.equal(p.intents[0].kind, 'ROLLBACK_KNOWN_GOOD');
});
test('target achieved after the original deadline still requires rollback', () => { const i = smokeInput(); i.evidence.deployment.completed_at = at(-300); i.evidence.deployment.persisted_completed_at = at(-300); i.evidence.full_rounds = []; assert.equal(planSmoke(i, NOW).reason, 'ORIGINAL_STABILIZATION_WINDOW_EXPIRED'); });
for (const [name, mutate] of [
  ['no actual deployment id', e => { e.deployment.id = ''; }],
  ['deployment not successful', e => { e.deployment.status = 'running'; }],
  ['restart reset completion time', e => { e.deployment.persisted_completed_at = at(-10); }],
  ['pre-restart sample', e => { e.restart_at = at(-45); }],
  ['too-frequent samples', e => { e.samples[1].at = at(-59); }],
  ['duplicate cache query', e => { e.samples[1].query_token = e.samples[0].query_token; }],
  ['cached sample', e => { e.samples[1].cache_control = 'max-age=60'; }],
  ['missing Pragma', e => { e.samples[1].pragma = ''; }],
  ['malformed response status', e => { e.samples[1].en_status = '200'; }],
  ['wrong canonical article pair', e => { e.routes['zh-cn'] = '/zh-cn/blog/other/'; }],
  ['English article incorrectly mounted under /en', e => { e.routes.en = '/en/blog/topic/'; }],
  ['missing known-good version', e => { e.known_good = null; }],
  ['rollback is target', e => { e.known_good.version_id = e.deployment.version_id; }],
  ['missing core entry', e => { e.core_manifest.entries.pop(); }],
  ['changed core manifest hash', e => { e.core_manifest.sha256 = H; }],
  ['self-consistent hash of wrong canonical manifest', e => { e.core_manifest.entries[0] = '/en/'; e.core_manifest.sha256 = sha256(JSON.stringify(e.core_manifest.entries)); }],
  ['missing round core result', e => { delete e.full_rounds[0].core_status['/blog/']; }],
  ['missing round article result', e => { delete e.full_rounds[0].article_status[e.routes.en]; }],
  ['reused full-round query', e => { e.full_rounds[0].query_token = e.samples[0].query_token; }],
  ['cached full smoke', e => { e.full_rounds[0].pragma = ''; }],
  ['malformed full-smoke status', e => { e.full_rounds[0].core_status['/'] = '200'; }],
  ['malformed full-smoke version', e => { e.full_rounds[0].commit_sha = 'not-a-sha'; }],
]) rejects(`smoke gate: ${name}`, planSmoke, smokeInput, mutate);
for (const [name, mutate] of [
  ['core path failure', e => { e.full_rounds[1].core_status['/'] = 503; }],
  ['article route failure', e => { e.full_rounds[1].article_status[e.routes.en] = 404; }],
  ['version response failure', e => { e.full_rounds[1].version_status = 503; }],
  ['wrong live SHA', e => { e.full_rounds[1].commit_sha = A; }],
  ['wrong www canonical redirect', e => { e.full_rounds[1].www_location = 'https://other.example/'; }],
]) test(`full smoke rollback: ${name}`, () => { const i = smokeInput(); mutate(i.evidence); const p = planSmoke(i, NOW); assert.equal(p.reason, 'FULL_SMOKE_FAILED'); assert.equal(p.intents[0].kind, 'ROLLBACK_KNOWN_GOOD'); });
test('all missing top-level fields and malformed booleans fail closed', () => {
  for (const [fn, factory] of [[planArticleCommit, articleInput], [planDraftPR, draftInput], [planMerge, mergeInput], [planRelease, releaseInput], [planSmoke, smokeInput]]) {
    for (const key of Object.keys(factory().evidence)) { const i = factory(); delete i.evidence[key]; assert.throws(() => fn(i, NOW), PlanGateError, `${fn.name} accepted missing ${key}`); }
  }
  const i = articleInput(); i.evidence.reconstruction_complete = 1; assert.throws(() => planArticleCommit(i, NOW), PlanGateError);
});
