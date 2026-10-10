/**
 * NONPUBLISHING execution interface. These functions return immutable descriptions,
 * not capabilities or authorization. There is no runtime/tool argument, dispatch,
 * execution option, network access, filesystem write, credential, or mutator here.
 *
 * TRUST BOUNDARY: evidence MUST be normalized by a trusted runtime adapter which
 * actually reads complete, fresh remote state, verifies user-message provenance,
 * runs the registered QA skill, and inspects the screenshot pixels. Neither a PR
 * body nor user-supplied JSON can provide that evidence. Shape/hash checking cannot
 * authenticate a caller or prove that a claimed check happened. MOCK plans remain
 * visibly MOCK. TRUSTED_ADAPTER is a provenance assertion, not certification by
 * this module. Even a valid plan requires separate authorized, fenced execution.
 * This module intentionally does not import the mutation-capable GitHub adapter.
 */
import {createHash} from 'node:crypto';

export class PlanGateError extends Error {}
export const REPOSITORY = 'fichil/fichil.com';
// Original approved publisher prompt, supplied separately from its abbreviated docs.
export const CORE_SMOKE_PATHS = Object.freeze(['/', '/zh-cn/', '/blog/', '/zh-cn/blog/', '/blog/index.xml', '/zh-cn/blog/index.xml', '/sitemap.xml', '/zh-cn/sitemap.xml', '/version.json']);
export const MOBILE_VIEWPORTS = Object.freeze(['en:360x800', 'en:390x844', 'zh-cn:360x800', 'zh-cn:390x844']);
export const CONTENT_CHECKS = Object.freeze(['sources', 'claims', 'terminology', 'logic', 'privacy', 'semantic_dedup', 'front_matter_ai_schema', 'hugo', 'mobile_layout', 'accessibility']);
export const RELEASE_CHECKS = Object.freeze(['qa_shell_tests', 'mirror_tests', 'hugo', 'npm_ci', 'security_audit', 'lint', 'unit_build', 'browser_accessibility', 'server_bundle', 'hosting_schema']);
const SHA = /^[a-f0-9]{40}$/, HASH = /^[a-f0-9]{64}$/, SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TASK_MARKER = '<!-- codex-workday-bilingual-blog -->';
const MAX_EVIDENCE_AGE_MS = 60_000;
const need = (ok, why) => { if (!ok) throw new PlanGateError(why); };
const str = (v, name) => need(typeof v === 'string' && v.length > 0, `${name}: nonempty string required`);
const sha = (v, name = 'SHA') => need(typeof v === 'string' && SHA.test(v), `${name}: full SHA required`);
const hash = (v, name = 'hash') => need(typeof v === 'string' && HASH.test(v), `${name}: SHA-256 required`);
const integer = (v, name) => need(Number.isSafeInteger(v) && v > 0, `${name}: positive integer required`);
export function sha256(text) { need(typeof text === 'string', 'Hash input must be text'); return createHash('sha256').update(text, 'utf8').digest('hex'); }
function record(v, keys, name) {
  need(v && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype, `${name}: plain record required`);
  need(Object.keys(v).sort().join('\0') === [...keys].sort().join('\0'), `${name}: missing or unexpected field`);
}
function json(v, depth = 0) {
  need(depth <= 30, 'Evidence nesting exceeds limit');
  if (v === null || typeof v === 'string' || typeof v === 'boolean') return;
  if (typeof v === 'number') { need(Number.isFinite(v), 'Non-finite evidence'); return; }
  need(v && typeof v === 'object' && (Array.isArray(v) || Object.getPrototypeOf(v) === Object.prototype), 'Evidence must be plain JSON, never tools/functions');
  need(Object.getOwnPropertySymbols(v).length === 0, 'Symbol evidence is forbidden');
  if (Array.isArray(v)) need(Object.keys(v).length === v.length && Object.keys(v).every((k, i) => k === String(i)), 'Sparse/non-JSON evidence array');
  for (const [key, d] of Object.entries(Object.getOwnPropertyDescriptors(v))) {
    if (Array.isArray(v) && key === 'length') continue;
    need(d.enumerable && 'value' in d, 'Accessor/non-JSON evidence is forbidden'); json(d.value, depth + 1);
  }
}
function array(v, name) { need(Array.isArray(v), `${name}: complete array required`); }
function time(v, name) {
  need(typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(v), `${name}: UTC timestamp required`);
  const n = Date.parse(v); need(Number.isFinite(n) && new Date(n).toISOString().replace('.000Z', 'Z') === v.replace('.000Z', 'Z'), `${name}: invalid timestamp`); return n;
}
function before(v, end, name) { const n = time(v, name); need(n <= end, `${name}: future evidence`); return n; }
function freeze(v) { if (v && typeof v === 'object') { Object.values(v).forEach(freeze); Object.freeze(v); } return v; }
function envelope(input, now, keys) {
  json(input); record(input, ['schema_version', 'mode', 'run_id', 'observed_at', 'evidence'], 'envelope');
  need(input.schema_version === 1, 'Unsupported evidence schema');
  need(['MOCK', 'TRUSTED_ADAPTER'].includes(input.mode), 'Explicit evidence provenance required'); str(input.run_id, 'run_id');
  const end = time(now, 'now'), observed = time(input.observed_at, 'observed_at');
  need(end >= observed && end - observed <= MAX_EVIDENCE_AGE_MS, 'Evidence snapshot is stale or future');
  record(input.evidence, keys, 'evidence'); need(input.evidence.repository === REPOSITORY, 'Wrong repository');
  return {e: input.evidence, end: observed, mode: input.mode, run_id: input.run_id, observed_at: input.observed_at};
}
function result(ctx, phase, intents, details = {}) {
  return freeze({schema_version: 1, status: 'PLAN_ONLY', external_mutations: false, evidence_mode: ctx.mode,
    run_id: ctx.run_id, observed_at: ctx.observed_at, phase, intents, ...details});
}
function issueIndex(index, slug, end, requireExisting = false) {
  need(typeof slug === 'string' && SLUG.test(slug), 'Invalid article slug');
  record(index, ['complete', 'slug', 'matches'], 'issue index');
  need(index.complete === true && index.slug === slug, 'Complete exact-slug issue history required'); array(index.matches, 'issue matches');
  need(index.matches.length <= 1, 'Ambiguous Issues: reconcile before writing');
  if (!index.matches.length) { need(!requireExisting, 'Establish the unique Issue before article writing'); return null; }
  const issue = index.matches[0]; record(issue, ['number', 'slug', 'state', 'created_at', 'confirmed_at'], 'issue');
  integer(issue.number, 'issue number'); need(issue.slug === slug && issue.state === 'open', 'Closed/mismatched Issue requires reconciliation');
  need(before(issue.created_at, end, 'issue created_at') <= before(issue.confirmed_at, end, 'issue confirmed_at'), 'Issue confirmation precedes creation'); return issue;
}
function files(files, slug, end, issue) {
  array(files, 'article files'); need(files.length === 2, 'Exactly two added article files required');
  const expected = new Set(['en', 'zh-cn'].map(l => `content/${l}/blog/${slug}/index.md`));
  for (const f of files) {
    record(f, ['path', 'status', 'content', 'sha256', 'written_at'], 'article file');
    need(expected.delete(f.path) && f.status === 'added', 'Invalid/duplicate article path or non-addition');
    str(f.content, 'article bytes'); hash(f.sha256); need(sha256(f.content) === f.sha256, 'Article bytes do not match hash');
    const written = before(f.written_at, end, 'article written_at');
    if (issue) need(written >= time(issue.confirmed_at, 'issue confirmed_at'), 'Article writing preceded unique Issue confirmation');
  }
  return articleContentHash(files);
}
/** Local byte-bundle binding, NOT the QA skill's own content hash algorithm. */
export function articleContentHash(articleFiles) {
  array(articleFiles, 'article files');
  const entries = articleFiles.map(f => { str(f.path, 'path'); str(f.content, 'content'); return [f.path, sha256(f.content)]; });
  need(new Set(entries.map(x => x[0])).size === entries.length, 'Duplicate content paths');
  return sha256(JSON.stringify(entries.sort((a, b) => a[0].localeCompare(b[0], 'en'))));
}
function checks(v, names, name) {
  record(v, names, name);
  for (const n of names) { record(v[n], ['status', 'evidence_sha256'], `${name}.${n}`); need(v[n].status === 'passed', `${name}.${n} did not pass`); hash(v[n].evidence_sha256); }
}
function execution(v, mode, operation, end) {
  record(v, ['kind', 'operation', 'invocation_id', 'completed_at', ...(operation === 'full-qa' ? ['verified_report'] : [])], 'skill execution');
  need(v.kind === (mode === 'MOCK' ? 'MOCK' : 'REAL_SKILL_EXECUTION') && v.operation === operation, 'Actual trusted skill execution required');
  str(v.invocation_id, 'skill invocation'); return before(v.completed_at, end, 'skill completed_at');
}
function qa(q, contentHash, fs, ctx) {
  record(q, ['skill', 'package_sha256', 'package_selftests', 'status', 'execution', 'byte_bundle_sha256', 'content_sha256', 'assets_sha256', 'qa_report_sha256', 'report', 'checks', 'screenshots'], 'full QA');
  need(q.skill === 'fichil-content-qa' && q.status === 'review_ready', 'Full registered QA must be review_ready'); hash(q.package_sha256);
  record(q.package_selftests, ['status', 'evidence_sha256'], 'package selftests'); need(q.package_selftests.status === 'passed', 'QA package selftests failed'); hash(q.package_selftests.evidence_sha256);
  const completed = execution(q.execution, ctx.mode, 'full-qa', ctx.end);
  need(q.byte_bundle_sha256 === contentHash, 'QA is not bound to actual article bytes'); hash(q.content_sha256); hash(q.assets_sha256);
  record(q.report, ['content', 'sha256'], 'QA report'); str(q.report.content, 'QA report bytes'); hash(q.report.sha256); need(sha256(q.report.content) === q.report.sha256, 'QA report bytes changed');
  // The registered skill hashes canonical JSON without qa_report_sha256. Its
  // trusted adapter must run that skill's integrity check, not echo report fields.
  // Preserve its result separately from the raw-file hash; do not replace the
  // registered Python canonicalizer with a second JavaScript implementation.
  hash(q.qa_report_sha256, 'skill QA report hash'); let parsed;
  try { parsed = JSON.parse(q.report.content); } catch { throw new PlanGateError('QA report is not valid JSON'); }
  json(parsed); need(parsed && !Array.isArray(parsed) && typeof parsed === 'object', 'QA report must be a JSON object');
  need(parsed.status === q.status && parsed.content_sha256 === q.content_sha256 && parsed.qa_report_sha256 === q.qa_report_sha256, 'Parsed report does not match normalized skill status/content/report hash');
  const verified = q.execution.verified_report;
  record(verified, ['status', 'content_sha256', 'qa_report_sha256', 'report_bytes_sha256'], 'trusted skill report result');
  need(verified.status === q.status && verified.content_sha256 === q.content_sha256 && verified.qa_report_sha256 === q.qa_report_sha256 && verified.report_bytes_sha256 === q.report.sha256, 'Trusted skill invocation does not bind this exact report and canonical hash');
  need(fs.every(f => time(f.written_at, 'article written_at') <= completed), 'QA predates latest article write');
  checks(q.checks, CONTENT_CHECKS, 'content checks'); array(q.screenshots, 'screenshots'); need(q.screenshots.length === 4, 'Four inspected mobile screenshots required');
  const viewports = new Set(MOBILE_VIEWPORTS), imageHashes = new Set();
  for (const s of q.screenshots) {
    record(s, ['locale', 'width', 'height', 'image_sha256', 'content_sha256', 'assets_sha256', 'captured_at', 'inspected_at', 'inspection', 'inspection_sha256'], 'screenshot');
    need(Number.isSafeInteger(s.width) && Number.isSafeInteger(s.height) && viewports.delete(`${s.locale}:${s.width}x${s.height}`), 'Wrong/duplicate mobile viewport');
    hash(s.image_sha256); hash(s.inspection_sha256); need(!imageHashes.has(s.image_sha256), 'Reused screenshot bytes'); imageHashes.add(s.image_sha256);
    need(s.content_sha256 === q.content_sha256 && s.assets_sha256 === q.assets_sha256 && s.inspection === 'passed', 'Uninspected/stale mobile evidence');
    const captured = before(s.captured_at, ctx.end, 'screenshot captured_at'), inspected = before(s.inspected_at, ctx.end, 'screenshot inspected_at');
    need(fs.every(f => time(f.written_at, 'article written_at') <= captured) && captured <= inspected && inspected <= completed, 'Screenshot inspection order invalid');
  }
  return q.qa_report_sha256;
}
export function planIssue(input, now) {
  const ctx = envelope(input, now, ['repository', 'slug', 'issues']); const {e} = ctx;
  const issue = issueIndex(e.issues, e.slug, ctx.end);
  return result(ctx, 'ISSUE', [{kind: issue ? 'REUSE_UNIQUE_ISSUE' : 'CREATE_UNIQUE_ISSUE', slug: e.slug, issue_number: issue?.number ?? null}],
    {article_writing: issue ? 'UNIQUE_ISSUE_CONFIRMED' : 'BLOCKED_UNTIL_REMOTE_ISSUE_CONFIRMED'});
}
export function planArticleCommit(input, now) {
  const ctx = envelope(input, now, ['repository', 'slug', 'issues', 'main_sha', 'branch_head_sha', 'ancestry', 'branch_diff', 'open_blog_prs', 'reconstruction_complete', 'files', 'qa']); const {e} = ctx;
  const issue = issueIndex(e.issues, e.slug, ctx.end, true); sha(e.main_sha); sha(e.branch_head_sha);
  need(e.reconstruction_complete === true, 'Incomplete remote reconstruction'); array(e.branch_diff, 'branch diff'); array(e.open_blog_prs, 'open blog PRs');
  need(e.branch_diff.length === 0 && e.open_blog_prs.length === 0, 'Reconcile existing branch/PR before a new article'); ancestry(e.ancestry, e.main_sha, e.branch_head_sha);
  const contentHash = files(e.files, e.slug, ctx.end, issue), reportHash = qa(e.qa, contentHash, e.files, ctx);
  return result(ctx, 'ARTICLE_COMMIT', [{kind: 'CREATE_ATOMIC_TWO_FILE_COMMIT', branch: 'chatgpt', expected_parent_sha: e.branch_head_sha,
    parents: [e.branch_head_sha], force: false, issue_number: issue.number, files: e.files.map(f => ({path: f.path, sha256: f.sha256})),
    byte_bundle_sha256: contentHash, content_sha256: e.qa.content_sha256, qa_report_sha256: reportHash}], {next_gate: 'READ_BACK_REMOTE_COMMIT_BYTES_AND_FULL_DIFF_BEFORE_DRAFT_PR'});
}
function ancestry(a, main, head) {
  record(a, ['main_sha', 'head_sha', 'status', 'behind_by'], 'ancestry');
  need(a.main_sha === main && a.head_sha === head && ['ahead', 'identical'].includes(a.status) && a.behind_by === 0, 'Current main ancestry requires branch update and new QA');
}
export function planDraftPR(input, now) {
  const ctx = envelope(input, now, ['repository', 'slug', 'issues', 'files', 'qa', 'commit', 'remote_ref_sha', 'full_diff', 'open_blog_prs', 'reconstruction_complete']); const {e} = ctx;
  const issue = issueIndex(e.issues, e.slug, ctx.end, true), contentHash = files(e.files, e.slug, ctx.end, issue); qa(e.qa, contentHash, e.files, ctx);
  record(e.commit, ['sha', 'parents', 'expected_parent_sha', 'byte_bundle_sha256', 'created_at', 'readback_at'], 'remote commit'); sha(e.commit.sha); array(e.commit.parents, 'commit parents'); sha(e.commit.expected_parent_sha);
  need(e.commit.parents.length === 1 && e.commit.parents[0] === e.commit.expected_parent_sha, 'Atomic article commit requires the verified single parent'); sha(e.commit.parents[0]);
  need(e.remote_ref_sha === e.commit.sha && e.commit.byte_bundle_sha256 === contentHash, 'Actual remote commit/ref/bytes mismatch');
  const created = before(e.commit.created_at, ctx.end, 'commit created_at'), readback = before(e.commit.readback_at, ctx.end, 'commit readback');
  need(created >= time(e.qa.execution.completed_at, 'QA completed_at') && readback >= created, 'Remote commit must follow full QA and precede readback');
  need(e.reconstruction_complete === true, 'Complete PR reconciliation required'); array(e.open_blog_prs, 'open PRs'); need(e.open_blog_prs.length === 0, 'Existing PR must be reconciled, never blindly create');
  fullDiff(e.full_diff, e.files);
  return result(ctx, 'DRAFT_PR', [{kind: 'CREATE_DRAFT_PR', base: 'main', head: 'chatgpt', expected_remote_head_sha: e.commit.sha,
    draft: true, issue_number: issue.number, task_marker: TASK_MARKER}], {next_gate: 'EXPLICIT_USER_APPROVAL_OF_CURRENT_REMOTE_HEAD_THEN_TRUSTED_VERIFY_REVIEW'});
}
function fullDiff(diff, fs) {
  record(diff, ['complete', 'files'], 'full diff'); need(diff.complete === true, 'Full remote diff is incomplete'); array(diff.files, 'remote diff files');
  need(diff.files.length === fs.length, 'Unexpected complete diff size');
  const want = new Map(fs.map(f => [f.path, f.sha256]));
  for (const f of diff.files) { record(f, ['path', 'status', 'sha256'], 'remote diff file'); need(f.status === 'added' && want.get(f.path) === f.sha256, 'Remote diff contains changed/extra bytes'); need(want.delete(f.path), 'Duplicate diff'); }
}
export function planMerge(input, now) {
  const ctx = envelope(input, now, ['repository', 'slug', 'issues', 'files', 'qa', 'pr', 'full_diff', 'approval', 'verify_review', 'main_sha', 'ancestry', 'checks', 'reviews']); const {e} = ctx;
  const issue = issueIndex(e.issues, e.slug, ctx.end, true), contentHash = files(e.files, e.slug, ctx.end, issue), reportHash = qa(e.qa, contentHash, e.files, ctx);
  const p = e.pr; record(p, ['number', 'state', 'merged', 'draft', 'auto_merge', 'base_repository', 'head_repository', 'base_ref', 'head_ref', 'head_sha', 'read_at', 'ready_at', 'mergeable', 'body'], 'PR');
  integer(p.number, 'PR number'); sha(p.head_sha); need(p.state === 'open' && p.merged === false && typeof p.draft === 'boolean' && p.auto_merge === null && p.mergeable === true, 'PR unavailable/conflicting or native auto-merge requires recovery');
  need(p.base_repository === REPOSITORY && p.head_repository === REPOSITORY && p.base_ref === 'main' && p.head_ref === 'chatgpt', 'Wrong PR source/destination');
  const readAt = before(p.read_at, ctx.end, 'current PR read'); need(ctx.end - readAt <= MAX_EVIDENCE_AGE_MS, 'Current remote head not freshly read');
  fullDiff(e.full_diff, e.files); sha(e.main_sha); ancestry(e.ancestry, e.main_sha, p.head_sha);
  const a = e.approval; record(a, ['kind', 'user_id', 'message_id', 'head_sha', 'content_sha256', 'assets_sha256', 'qa_report_sha256', 'granted_at'], 'user approval');
  need(a.kind === 'EXPLICIT_CURRENT_HEAD_CONTENT_APPROVAL', 'Ordinary yes/old approval is insufficient'); str(a.user_id, 'authenticated user'); str(a.message_id, 'approval source message');
  const approvedAt = before(a.granted_at, ctx.end, 'approval timestamp');
  need(approvedAt >= time(e.qa.execution.completed_at, 'QA completed_at'), 'Approval predates full QA');
  const v = e.verify_review; record(v, ['skill', 'package_sha256', 'status', 'execution', 'head_sha', 'byte_bundle_sha256', 'content_sha256', 'assets_sha256', 'qa_report_sha256', 'evidence_sha256'], 'verify-review');
  need(v.skill === 'fichil-content-qa' && v.package_sha256 === e.qa.package_sha256 && v.status === 'approved', 'Trusted verify-review required'); hash(v.evidence_sha256);
  const verifiedAt = execution(v.execution, ctx.mode, 'verify-review', ctx.end);
  need(verifiedAt >= approvedAt && verifiedAt >= readAt && ctx.end - verifiedAt <= MAX_EVIDENCE_AGE_MS, 'Re-read current remote head then run fresh verify-review');
  need(v.byte_bundle_sha256 === contentHash, 'Verify-review was not performed over current article bytes');
  for (const r of [a, v]) need(r.head_sha === p.head_sha && r.content_sha256 === e.qa.content_sha256 && r.assets_sha256 === e.qa.assets_sha256 && r.qa_report_sha256 === reportHash, 'Stale head/content/assets/report approval');
  const marker = `<!-- fichil-content-qa-approval:v1 status=approved head_sha=${p.head_sha} content_sha256=${e.qa.content_sha256} qa_report_sha256=${reportHash} -->`;
  need(typeof p.body === 'string' && p.body.split(TASK_MARKER).length === 2 && p.body.split('<!-- fichil-content-qa-approval:v1 ').length === 2 && p.body.includes(marker), 'Approval marker missing/stale/duplicated');
  need(new RegExp(`(?:closes|fixes|resolves)\\s+#${issue.number}\\b`, 'i').test(p.body), 'Unique Issue closure link missing');
  mergeChecks(e.checks, p.head_sha); reviewGate(e.reviews);
  if (p.draft) { need(p.ready_at === null, 'Draft cannot carry a current Ready timestamp'); return result(ctx, 'MERGE', [{kind: 'MARK_READY_FOR_REVIEW', pr_number: p.number, expected_head_sha: p.head_sha}], {next_gate: 'RE_READ_HEAD_MAIN_CHECKS_AND_VERIFY_REVIEW_AFTER_READY'}); }
  need(before(p.ready_at, ctx.end, 'ready_at') <= readAt, 'Fresh post-Ready PR read required');
  return result(ctx, 'MERGE', [{kind: 'NORMAL_SERVER_PROTECTED_MERGE', pr_number: p.number, expected_head_sha: p.head_sha, merge_method: 'merge',
    on_rejection: 'RESTORE_DRAFT_AND_FULLY_REVALIDATE', on_unknown: 'RECONCILE_REMOTE_WITHOUT_RETRY'}]);
}
function mergeChecks(v, head) {
  record(v, ['complete', 'items'], 'checks'); need(v.complete === true, 'Check pagination incomplete'); array(v.items, 'checks'); const ids = new Set();
  for (const c of v.items) { record(c, ['id', 'name', 'app_id', 'head_sha', 'status', 'conclusion'], 'check'); integer(c.id, 'check id'); need(!ids.has(c.id), 'Duplicate check identity'); ids.add(c.id); str(c.name, 'check name'); integer(c.app_id, 'check app'); sha(c.head_sha); str(c.status, 'check status'); need(c.conclusion === null || typeof c.conclusion === 'string', 'Malformed check conclusion'); }
  for (const name of ['build', 'sites']) { const xs = v.items.filter(c => c.name === name && c.app_id === 15368 && c.head_sha === head).sort((a, b) => b.id - a.id); need(xs.length && xs[0].status === 'completed' && xs[0].conclusion === 'success', `Latest app-15368 ${name} check not green`); }
}
function reviewGate(v) {
  record(v, ['complete', 'items'], 'reviews'); need(v.complete === true, 'Review pagination incomplete'); array(v.items, 'reviews'); const latest = new Map(), ids = new Set();
  for (const r of [...v.items].sort((a, b) => a.id - b.id)) { record(r, ['id', 'user_id', 'state'], 'review'); integer(r.id, 'review id'); str(r.user_id, 'review user'); need(!ids.has(r.id), 'Duplicate review'); ids.add(r.id); need(['APPROVED', 'CHANGES_REQUESTED', 'DISMISSED', 'COMMENTED', 'PENDING'].includes(r.state), 'Unknown review state'); if (['APPROVED', 'CHANGES_REQUESTED', 'DISMISSED'].includes(r.state)) latest.set(r.user_id, r.state); }
  need(![...latest.values()].includes('CHANGES_REQUESTED'), 'Unresolved changes requested');
}
function workflow(r) {
  record(r, ['id', 'name', 'path', 'event', 'head_branch', 'head_sha', 'run_number', 'run_attempt', 'status', 'conclusion'], 'workflow run');
  for (const k of ['id', 'run_number', 'run_attempt']) integer(r[k], k); sha(r.head_sha);
  for (const k of ['name', 'path', 'event', 'head_branch', 'status']) str(r[k], k); need(r.conclusion === null || typeof r.conclusion === 'string', 'Malformed workflow conclusion');
}
function pushCI(ci, target, ctx) {
  record(ci, ['complete', 'runs', 'selected_run', 'selected_read_at'], 'push CI'); need(ci.complete === true, 'Push-inclusive complete CI evidence required'); array(ci.runs, 'workflow runs'); ci.runs.forEach(workflow); workflow(ci.selected_run);
  const xs = ci.runs.filter(r => r.name === 'Site Build Check' && r.path === '.github/workflows/hugo-check.yml' && r.event === 'push' && r.head_branch === 'main' && r.head_sha === target);
  need(xs.length > 0, 'Exact main push CI missing; PR checks do not qualify'); const keys = new Set();
  for (const r of xs) { const k = `${r.run_number}:${r.run_attempt}`; need(!keys.has(k), 'Ambiguous workflow ordering identity'); keys.add(k); }
  xs.sort((a, b) => b.run_number - a.run_number || b.run_attempt - a.run_attempt); const latest = xs[0], reread = ci.selected_run;
  for (const k of ['id', 'name', 'path', 'event', 'head_branch', 'head_sha', 'run_number', 'run_attempt']) need(reread[k] === latest[k], 'Selected CI run/attempt changed or is not latest');
  need(latest.status === 'completed' && latest.conclusion === 'success' && reread.status === 'completed' && reread.conclusion === 'success', 'Latest exact main push CI not green');
  need(ctx.end - before(ci.selected_read_at, ctx.end, 'CI reread') <= MAX_EVIDENCE_AGE_MS, 'CI reread is stale'); return latest;
}
function knownGood(k, ctx) {
  record(k, ['version_id', 'commit_sha', 'verified_at', 'smoke_sha256'], 'known-good rollback'); str(k.version_id, 'rollback version'); sha(k.commit_sha); hash(k.smoke_sha256); before(k.verified_at, ctx.end, 'known-good verification');
}
export function planRelease(input, now) {
  const ctx = envelope(input, now, ['repository', 'main_sha', 'checkout', 'ci', 'live', 'known_good', 'build', 'source', 'archive', 'versions']); const {e} = ctx; sha(e.main_sha);
  record(e.checkout, ['sha', 'clean', 'submodules_pinned', 'tracked_unchanged'], 'checkout'); need(e.checkout.sha === e.main_sha && e.checkout.clean === true && e.checkout.submodules_pinned === true && e.checkout.tracked_unchanged === true, 'Clean pinned exact-main checkout required');
  pushCI(e.ci, e.main_sha, ctx); record(e.live, ['commit_sha', 'version_id'], 'live version'); sha(e.live.commit_sha); str(e.live.version_id, 'live version id');
  record(e.versions, ['complete', 'items'], 'saved versions'); need(e.versions.complete === true, 'Complete version reconciliation required'); array(e.versions.items, 'versions');
  const byId = new Map();
  for (const v of e.versions.items) {
    record(v, ['version_id', 'commit_sha', 'source_commit_sha', 'build_sha256', 'archive_sha256'], 'saved version'); str(v.version_id, 'version id'); need(!byId.has(v.version_id), 'Duplicate version identity');
    sha(v.commit_sha); sha(v.source_commit_sha); hash(v.build_sha256); hash(v.archive_sha256); need(v.source_commit_sha === v.commit_sha, 'Saved version ID has conflicting commit/source identity'); byId.set(v.version_id, v);
  }
  const liveVersion = byId.get(e.live.version_id);
  need(liveVersion && liveVersion.commit_sha === e.live.commit_sha, 'Live version ID/SHA does not match complete saved-version records');
  if (e.live.commit_sha === e.main_sha) return result(ctx, 'RELEASE', [], {outcome: 'NOOP_ONLINE_CURRENT', target_sha: e.main_sha});
  knownGood(e.known_good, ctx); need(e.known_good.commit_sha === e.live.commit_sha && e.known_good.version_id === e.live.version_id, 'Rollback must be the recorded previously live known-good version');
  const rollbackVersion = byId.get(e.known_good.version_id);
  need(rollbackVersion && rollbackVersion.commit_sha === e.known_good.commit_sha, 'Known-good rollback ID/SHA is absent or inconsistent in saved versions');
  if (e.build === null) { need(e.source === null && e.archive === null, 'Source/archive cannot precede verified build'); return result(ctx, 'RELEASE', [{kind: 'RUN_COMPLETE_LOCAL_RELEASE_QA', target_sha: e.main_sha, required_checks: RELEASE_CHECKS}], {next_gate: 'VERIFY_BUILD_SOURCE_ARCHIVE_SAME_SHA'}); }
  record(e.build, ['commit_sha', 'hugo_version', 'node_version', 'workspace_local_npm_cache', 'clean_after', 'submodules_pinned', 'artifact_sha256', 'checks'], 'build');
  need(e.build.commit_sha === e.main_sha && e.build.hugo_version === '0.160.1' && e.build.node_version === '22.13.0' && e.build.workspace_local_npm_cache === true && e.build.clean_after === true && e.build.submodules_pinned === true, 'Build provenance/toolchain/worktree mismatch'); hash(e.build.artifact_sha256); checks(e.build.checks, RELEASE_CHECKS, 'release checks');
  record(e.archive, ['commit_sha', 'build_sha256', 'archive_sha256'], 'archive'); need(e.archive.commit_sha === e.main_sha && e.archive.build_sha256 === e.build.artifact_sha256, 'Archive differs from built main'); hash(e.archive.archive_sha256);
  const versions = e.versions.items.filter(v => v.commit_sha === e.main_sha); need(versions.length <= 1, 'Ambiguous saved target versions: reconcile, never create another');
  if (e.source === null) return result(ctx, 'RELEASE', [{kind: 'PUSH_EXACT_MAIN_SOURCE', target_sha: e.main_sha}], {next_gate: 'RE_READ_REMOTE_SOURCE_IDENTITY_BEFORE_SAVE'});
  record(e.source, ['commit_sha', 'confirmed_at'], 'pushed source'); need(e.source.commit_sha === e.main_sha, 'Source push differs from main/build/archive'); before(e.source.confirmed_at, ctx.end, 'source confirmation');
  if (!versions.length) return result(ctx, 'RELEASE', [{kind: 'SAVE_EXACT_MAIN_VERSION', target_sha: e.main_sha, build_sha256: e.build.artifact_sha256, archive_sha256: e.archive.archive_sha256}], {next_gate: 'RECONCILE_UNIQUE_SAVED_VERSION_BEFORE_DEPLOY'});
  const v = versions[0]; need(v.source_commit_sha === e.main_sha && v.build_sha256 === e.build.artifact_sha256 && v.archive_sha256 === e.archive.archive_sha256, 'Saved version source/build/archive mismatch');
  need(v.version_id !== e.known_good.version_id && v.commit_sha !== e.known_good.commit_sha, 'Deployment target and known-good rollback must have distinct version IDs and SHAs');
  return result(ctx, 'RELEASE', [{kind: 'DEPLOY_VERIFIED_VERSION', target_sha: e.main_sha, version_id: v.version_id, rollback_version_id: e.known_good.version_id}], {next_gate: 'PERSIST_ACTUAL_DEPLOYMENT_ID_AND_COMPLETION_TIME_THEN_STABILIZE'});
}
function uncached(s, seen, ctx, earliest) {
  const at = before(s.at, ctx.end, 'sample timestamp'); need(at >= earliest, 'Pre-deployment/pre-restart sample cannot establish stability');
  str(s.query_token, 'unique cache-bypass query'); need(!seen.has(s.query_token), 'Reused cache-bypass query'); seen.add(s.query_token);
  need(s.cache_control === 'no-cache' && s.pragma === 'no-cache', 'Uncached Cache-Control and Pragma evidence required'); return at;
}
function routes(v) {
  record(v, ['en', 'zh-cn'], 'canonical article routes'); const a = /^\/blog\/([a-z0-9]+(?:-[a-z0-9]+)*)\/$/.exec(v.en);
  need(a && v['zh-cn'] === `/zh-cn/blog/${a[1]}/`, 'Paired canonical article routes required');
}
function httpStatus(v) { need(v === null || (Number.isSafeInteger(v) && v >= 100 && v <= 599), 'Invalid HTTP observation'); }
/** Observations must cover the exact original nine-entry publisher contract. */
export function planSmoke(input, now) {
  const ctx = envelope(input, now, ['repository', 'deployment', 'known_good', 'routes', 'restart_at', 'samples', 'core_manifest', 'full_rounds']); const {e} = ctx;
  const d = e.deployment; record(d, ['id', 'version_id', 'target_sha', 'status', 'completed_at', 'persisted_completed_at'], 'deployment');
  str(d.id, 'actual deployment id'); str(d.version_id, 'deployment version id'); sha(d.target_sha); need(d.status === 'succeeded', 'Deployment must actually succeed before stabilization');
  const completed = before(d.completed_at, ctx.end, 'deployment completion'); need(d.persisted_completed_at === d.completed_at, 'Restart must preserve actual completion time'); knownGood(e.known_good, ctx); routes(e.routes);
  need(e.known_good.version_id !== d.version_id && e.known_good.commit_sha !== d.target_sha, 'Rollback must differ from failed target');
  const earliest = e.restart_at === null ? completed : Math.max(completed, before(e.restart_at, ctx.end, 'restart time'));
  array(e.samples, 'stabilization samples'); array(e.full_rounds, 'full smoke rounds'); const seen = new Set(); let previous = null;
  for (const s of e.samples) {
    record(s, ['at', 'query_token', 'cache_control', 'pragma', 'commit_sha', 'en_status', 'zh_cn_status'], 'stabilization sample');
    const at = uncached(s, seen, ctx, earliest); need(previous === null || at - previous >= 10_000, 'Stabilization sampling must be at least 10 seconds apart'); previous = at;
    need(s.commit_sha === null || (typeof s.commit_sha === 'string' && SHA.test(s.commit_sha)), 'Invalid sampled version');
    for (const k of ['en_status', 'zh_cn_status']) httpStatus(s[k]);
  }
  const rollback = reason => result(ctx, 'SMOKE', [{kind: 'ROLLBACK_KNOWN_GOOD', version_id: e.known_good.version_id, target_sha: e.known_good.commit_sha}], {reason, next_gate: 'VERIFY_ROLLBACK_COMPLETION_AND_FULL_SMOKE_OR_URGENT_HUMAN_ATTENTION'});
  const last = e.samples.slice(-3), sameTarget = last.length === 3 && last.every(s => s.commit_sha === d.target_sha);
  if (sameTarget && ['en_status', 'zh_cn_status'].some(k => last.every(s => s[k] !== 200))) return rollback('THREE_CONSECUTIVE_SAME_ROUTE_FAILURES');
  const stable = sameTarget && last.every(s => s.en_status === 200 && s.zh_cn_status === 200) && time(last[2].at, 'latest sample') - completed <= 180_000;
  if (!stable) {
    need(e.full_rounds.length === 0, 'Full smoke cannot precede stable propagation');
    if (ctx.end - completed >= 180_000) return rollback('ORIGINAL_STABILIZATION_WINDOW_EXPIRED');
    return result(ctx, 'SMOKE', [], {outcome: 'PROPAGATING', original_deadline: new Date(completed + 180_000).toISOString()});
  }
  const manifest = e.core_manifest; record(manifest, ['origin', 'entries', 'sha256'], 'core smoke manifest'); need(manifest.origin === 'https://fichil.com', 'Wrong production origin');
  array(manifest.entries, 'core entries'); need(manifest.entries.length === 9 && new Set(manifest.entries).size === 9 && manifest.entries.every(p => typeof p === 'string' && /^\/(?!\/)[a-z0-9/._-]*$/.test(p)), 'Nine distinct configured core paths required');
  need(manifest.sha256 === sha256(JSON.stringify(manifest.entries)), 'Core manifest hash changed');
  need(JSON.stringify([...manifest.entries].sort()) === JSON.stringify([...CORE_SMOKE_PATHS].sort()), 'Core manifest differs from original nine canonical entries');
  array(e.full_rounds, 'full smoke rounds'); need(e.full_rounds.length <= 3, 'Exactly three full smoke rounds required'); let roundAt = time(last[2].at, 'stable at');
  for (const r of e.full_rounds) {
    record(r, ['at', 'query_token', 'cache_control', 'pragma', 'core_status', 'article_status', 'commit_sha', 'version_status', 'www_status', 'www_location'], 'full smoke round');
    const at = uncached(r, seen, ctx, earliest); need(at >= roundAt, 'Full smoke timestamps out of order'); roundAt = at;
    record(r.core_status, manifest.entries, 'core statuses'); record(r.article_status, [e.routes.en, e.routes['zh-cn']], 'article statuses');
    [...Object.values(r.core_status), ...Object.values(r.article_status), r.version_status, r.www_status].forEach(httpStatus);
    need(r.commit_sha === null || (typeof r.commit_sha === 'string' && SHA.test(r.commit_sha)), 'Invalid full-smoke version observation');
    need(r.www_location === null || typeof r.www_location === 'string', 'Invalid redirect observation');
    if (r.commit_sha !== d.target_sha || r.version_status !== 200 || ![301, 308].includes(r.www_status) || r.www_location !== 'https://fichil.com/' || [...Object.values(r.core_status), ...Object.values(r.article_status)].some(s => s !== 200)) return rollback('FULL_SMOKE_FAILED');
  }
  return result(ctx, 'SMOKE', [], {outcome: e.full_rounds.length === 3 ? 'STABLE_FULL_SMOKE_VERIFIED' : 'STABLE_AWAITING_THREE_FULL_SMOKE_ROUNDS', deployment_id: d.id, target_sha: d.target_sha});
}
