import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createEvidenceReader, EvidenceGateError} from '../cloud-blog-evidence.mjs';
import {REPOSITORY, CONTENT_CHECKS, sha256, articleContentHash} from '../cloud-blog-execution-plan.mjs';
import {createMutationDispatcher} from '../cloud-blog-dispatcher.mjs';
import {transition} from '../cloud-blog-lease.mjs';

// All evidence and callbacks in this file are synthetic. Even tests of the
// explicit TRUSTED_ADAPTER option do not authenticate a user or execute QA.
const NOW = '2026-10-10T08:00:00.000Z', A = 'a'.repeat(40), B = 'b'.repeat(40), H = 'c'.repeat(64);
const at = n => new Date(Date.parse(NOW) + n * 1000).toISOString();
const clone = value => structuredClone(value);
const request = () => ({run_id: 'mock-run', window: {start: '2026-09-10', end: '2026-10-09'}, main_sha: B, head_sha: A});
function qaFixture(files, mode, completed_at) {
  const byte = articleContentHash(files), content = sha256('MOCK independent skill content hash');
  const document = {content_sha256: content, status: 'review_ready'}, reportHash = sha256(JSON.stringify(document));
  const raw = JSON.stringify({...document, qa_report_sha256: reportHash}, null, 2);
  return {skill: 'fichil-content-qa', package_sha256: H, package_selftests: {status: 'passed', evidence_sha256: H}, status: 'review_ready',
    execution: {kind: mode === 'MOCK' ? 'MOCK' : 'REAL_SKILL_EXECUTION', operation: 'full-qa', invocation_id: 'mock-full-qa', completed_at,
      verified_report: {status: 'review_ready', content_sha256: content, qa_report_sha256: reportHash, report_bytes_sha256: sha256(raw)}},
    byte_bundle_sha256: byte, content_sha256: content, assets_sha256: H, qa_report_sha256: reportHash,
    report: {content: raw, sha256: sha256(raw)}, checks: Object.fromEntries(CONTENT_CHECKS.map(n => [n, {status: 'passed', evidence_sha256: H}])),
    screenshots: ['en', 'zh-cn'].flatMap(locale => [[360, 800], [390, 844]].map(([width, height]) => ({locale, width, height,
      image_sha256: sha256(`MOCK ${locale} ${width}`), content_sha256: content, assets_sha256: H,
      captured_at: at(-90), inspected_at: at(-80), inspection: 'passed', inspection_sha256: H}))),
  };
}
function fixture(mode = 'MOCK') {
  const calls = [], state = {now: NOW, head: A, main: B};
  const files = ['en', 'zh-cn'].map(locale => ({path: `content/${locale}/blog/topic/index.md`, status: 'added', content: `MOCK ${locale}`, sha256: sha256(`MOCK ${locale}`), written_at: at(-120)}));
  const qa = qaFixture(files, mode, at(-60));
  const article = {repository: REPOSITORY, slug: 'topic', files, issues: {complete: true, slug: 'topic', matches: [{number: 4, slug: 'topic', state: 'open', created_at: at(-200), confirmed_at: at(-190)}]}};
  const ancestry = {main_sha: B, head_sha: A, status: 'ahead', behind_by: 0};
  const envelope = evidence => ({schema_version: 1, mode, run_id: 'mock-run', observed_at: NOW, evidence});
  const commitInput = () => envelope({...clone(article), main_sha: B, branch_head_sha: A, ancestry: clone(ancestry), branch_diff: [], open_blog_prs: [], reconstruction_complete: true});
  const mergeInput = () => envelope({...clone(article), main_sha: B, ancestry: clone(ancestry),
    pr: {number: 5, state: 'open', merged: false, draft: false, auto_merge: null, base_repository: REPOSITORY, head_repository: REPOSITORY,
      base_ref: 'main', head_ref: 'chatgpt', head_sha: A, read_at: at(-5), ready_at: at(-10), mergeable: true,
      body: `<!-- codex-workday-bilingual-blog -->\n<!-- fichil-content-qa-approval:v1 status=approved head_sha=${A} content_sha256=${qa.content_sha256} qa_report_sha256=${qa.qa_report_sha256} -->\nCloses #4`},
    full_diff: {complete: true, files: files.map(f => ({path: f.path, status: f.status, sha256: f.sha256}))},
    checks: {complete: true, items: ['build', 'sites'].map((name, i) => ({id: i + 1, name, app_id: 15368, head_sha: A, status: 'completed', conclusion: 'success'}))},
    reviews: {complete: true, items: []},
  });
  const records = [{source_id: 'mock-work-1', topic_id: 'topic', family: 'cloud_work', completed_at: at(-86400), content: 'PRIVATE_MOCK_SOURCE_TEXT', sha256: sha256('PRIVATE_MOCK_SOURCE_TEXT')}];
  const candidates = records.map(r => ({source_id: r.source_id, topic_id: r.topic_id, completed_at: r.completed_at, completed: true, evidence_complete: true, public_safe: true, reusable: true, dedup_passed: true, scores: [30, 25, 20, 15, 10]}));
  const wrap = result => ({mode, complete: true, observed_at: state.now, invocation_id: 'mock-callback', result});
  const methods = {
    readCurrentHead: () => ({repository: REPOSITORY, main_sha: state.main, head_sha: state.head}),
    readSources: ({window}) => ({window, families: ['cloud_work', 'github'], records: clone(records)}),
    readHistory: () => ({main_sha: B, head_sha: A, records: [{content: 'PRIVATE_MOCK_ARTICLE_HISTORY'}]}),
    semanticReview: ({binding, selected}) => ({binding, candidates: clone(selected ? [selected] : candidates)}),
    readQaEvidence: ({binding}) => ({binding, integrity_verified: true, qa: clone(qa)}),
    readOwnerMessage: ({message_id}) => ({message_id, user_id: 'mock-owner', sent_at: at(-30), text: 'PRIVATE_MOCK_APPROVAL_TEXT', revision: 'mock-revision-1', revoked: false}),
    verifyOwnerApproval: ({binding, message, message_sha256}) => ({binding, message_sha256, authenticated_owner: true, explicit_approval: true,
      authorized_intents: ['MARK_READY_FOR_REVIEW', 'NORMAL_SERVER_PROTECTED_MERGE'], approval: {kind: 'EXPLICIT_CURRENT_HEAD_CONTENT_APPROVAL', user_id: message.user_id,
        message_id: message.message_id, head_sha: binding.head_sha, content_sha256: binding.content_sha256, assets_sha256: binding.assets_sha256,
        qa_report_sha256: binding.qa_report_sha256, granted_at: message.sent_at}}),
    verifyReview: ({binding}) => ({binding, verify_review: {skill: 'fichil-content-qa', package_sha256: H, status: 'approved',
      execution: {kind: mode === 'MOCK' ? 'MOCK' : 'REAL_SKILL_EXECUTION', operation: 'verify-review', invocation_id: 'mock-verify-review', completed_at: state.now},
      head_sha: binding.head_sha, byte_bundle_sha256: binding.byte_bundle_sha256, content_sha256: binding.content_sha256, assets_sha256: binding.assets_sha256,
      qa_report_sha256: binding.qa_report_sha256, evidence_sha256: H}}),
  };
  const ports = Object.fromEntries(Object.entries(methods).map(([name]) => [name, async args => { calls.push({name, args}); return wrap(await methods[name](args)); }]));
  const options = {enabled: true, evidenceMode: mode, now: () => state.now};
  return {calls, state, methods, ports, options, wrap, commitInput, mergeInput, records, candidates};
}
const operation = receipt => {
  const p = receipt.result.plan, target_sha = receipt.binding.head_sha, intent = p.intents[0];
  const plan_sha256 = sha256(JSON.stringify({run_id: p.run_id, phase: p.phase, target_sha, intent}));
  return {operation_id: `op_${plan_sha256}`, kind: intent.kind === 'MARK_READY_FOR_REVIEW' ? 'pr_ready' : 'merge', target_sha, intent, plan_sha256, observed_at: p.observed_at};
};

test('disabled by default without invoking a callback', async () => {
  const f = fixture(), reader = createEvidenceReader(f.ports);
  await assert.rejects(reader.collectSources(request()), /EVIDENCE_DISABLED/);
  await assert.rejects(reader.collectQa(f.commitInput()), /EVIDENCE_DISABLED/);
  await assert.rejects(reader.collectApproval(f.mergeInput(), {message_id: 'mock-message'}), /EVIDENCE_DISABLED/);
  assert.equal(f.calls.length, 0);
});
test('no network, process, filesystem or mutation provider binding', () => {
  const source = readFileSync(new URL('../cloud-blog-evidence.mjs', import.meta.url), 'utf8');
  assert.deepEqual([...source.matchAll(/from ['"]([^'"]+)['"]/g)].map(m => m[1]), ['./cloud-blog-execution-plan.mjs']);
  assert.equal(/\b(?:fetch|eval|require|spawn)\s*\(|\bimport\s*\(/.test(source), false);
  assert.throws(() => createEvidenceReader({deploy() {}}), /EVIDENCE_PORTS/);
  assert.throws(() => createEvidenceReader({}, {execute: true}), /EVIDENCE_OPTIONS/);
});
test('source callbacks actually run, while receipts omit private text and are immutable', async () => {
  const f = fixture(), reader = createEvidenceReader(f.ports, f.options), r = await reader.collectSources(request());
  assert.deepEqual(f.calls.map(c => c.name), ['readCurrentHead', 'readSources', 'readHistory', 'semanticReview', 'readSources', 'readHistory', 'readCurrentHead']);
  assert.equal(r.evidence_mode, 'MOCK'); assert.equal(r.external_mutations, false); assert.equal(r.result.phase, 'before_scoring');
  assert.equal(JSON.stringify(r).includes('PRIVATE_'), false); assert.equal(r.binding.window.start, '2026-09-10');
  assert.equal(reader.assertCurrent(r, r.binding), r); assert.ok(Object.isFrozen(r.result.candidates[0]));
  assert.throws(() => { r.result.candidates[0].scores[0] = 99; }, TypeError);
  assert.ok(f.calls.every(c => Object.isFrozen(c.args)));
  assert.throws(() => reader.assertCurrent(clone(r), r.binding), /EVIDENCE_FOREIGN_RECEIPT/);
  assert.throws(() => reader.assertCurrent(r, {...r.binding, head_sha: B}), /EVIDENCE_BINDING_CHANGED/);
  assert.throws(() => createEvidenceReader(f.ports, f.options).assertCurrent(r, r.binding), /EVIDENCE_FOREIGN_RECEIPT/);
});
test('pre-write review rereads full sources/history and preserves exact selected candidate', async () => {
  const f = fixture(), reader = createEvidenceReader(f.ports, f.options), first = await reader.collectSources(request());
  const second = await reader.beforeWriting(first, {source_id: 'mock-work-1', topic_id: 'topic'});
  assert.equal(second.kind, 'PREWRITE_SOURCE_REVIEW'); assert.deepEqual(second.binding, first.binding);
  assert.equal(f.calls.filter(c => c.name === 'semanticReview').at(-1).args.phase, 'before_writing');
  f.records[0].content += ' changed'; f.records[0].sha256 = sha256(f.records[0].content);
  await assert.rejects(reader.beforeWriting(first, {source_id: 'mock-work-1', topic_id: 'topic'}), /EVIDENCE_SOURCE_OR_HISTORY_CHANGED/);
});
for (const [name, mutate, pattern] of [
  ['incomplete read', f => { const old = f.ports.readSources; f.ports.readSources = async a => ({...await old(a), complete: false}); }, /EVIDENCE_UNVERIFIED/],
  ['wrong provenance', f => { const old = f.ports.readSources; f.ports.readSources = async a => ({...await old(a), mode: 'TRUSTED_ADAPTER'}); }, /EVIDENCE_UNVERIFIED/],
  ['cached callback', f => { const old = f.ports.readSources; f.ports.readSources = async a => ({...await old(a), observed_at: at(-1)}); }, /EVIDENCE_CACHED_CALLBACK/],
  ['missing family', f => { f.methods.readSources = a => ({window: a.window, families: ['github'], records: []}); }, /EVIDENCE_SOURCE_FAMILIES/],
  ['source hash mismatch', f => { f.records[0].content += ' changed'; }, /EVIDENCE_SOURCE_BYTES_CHANGED/],
  ['outside collection window', f => { f.records[0].completed_at = NOW; }, /EVIDENCE_SOURCE_OUTSIDE_WINDOW/],
  ['missing full history', f => { delete f.ports.readHistory; }, /EVIDENCE_PORT_MISSING/],
  ['head changed', f => { f.state.head = B; }, /EVIDENCE_HEAD_CHANGED/],
  ['semantic skipped candidates', f => { f.candidates.length = 0; }, /EVIDENCE_SEMANTIC_INCOMPLETE/],
  ['semantic changed source', f => { f.candidates[0].source_id = 'other'; }, /EVIDENCE_CANDIDATE_CHANGED/],
  ['semantic missing decision', f => { delete f.candidates[0].public_safe; }, /EVIDENCE_SCHEMA/],
  ['semantic extra private field', f => { f.candidates[0].private_note = 'SECRET'; }, /EVIDENCE_SCHEMA/],
  ['semantic private text in score', f => { f.candidates[0].scores[0] = 'SECRET'; }, /EVIDENCE_SEMANTIC_INCOMPLETE/],
  ['semantic foreign binding', f => { const old = f.methods.semanticReview; f.methods.semanticReview = a => ({...old(a), binding: {...a.binding, head_sha: B}}); }, /EVIDENCE_SEMANTIC_BINDING/],
]) test(`sources fail closed: ${name}`, async () => {
  const f = fixture(); mutate(f); await assert.rejects(createEvidenceReader(f.ports, f.options).collectSources(request()), pattern);
});
test('history changing within collection invalidates semantic decision', async () => {
  const f = fixture(); let reads = 0;
  f.methods.readHistory = () => ({main_sha: B, head_sha: A, records: [{revision: ++reads}]});
  await assert.rejects(createEvidenceReader(f.ports, f.options).collectSources(request()), /EVIDENCE_HISTORY_CHANGED/);
});
test('source changing during semantic review invalidates collection and pre-write review', async () => {
  for (const prewrite of [false, true]) {
    const f = fixture(), reader = createEvidenceReader(f.ports, f.options), first = prewrite ? await reader.collectSources(request()) : null;
    const old = f.methods.semanticReview;
    f.methods.semanticReview = args => { f.records[0].content += ' changed'; f.records[0].sha256 = sha256(f.records[0].content); return old(args); };
    await assert.rejects(prewrite ? reader.beforeWriting(first, {source_id: 'mock-work-1', topic_id: 'topic'}) : reader.collectSources(request()), /EVIDENCE_SOURCE_CHANGED/);
  }
});
test('pre-write semantic review cannot silently change the selected decision', async () => {
  const f = fixture(), reader = createEvidenceReader(f.ports, f.options), first = await reader.collectSources(request()), old = f.methods.semanticReview;
  f.methods.semanticReview = args => { const result = old(args); result.candidates[0].dedup_passed = false; return result; };
  await assert.rejects(reader.beforeWriting(first, {source_id: 'mock-work-1', topic_id: 'topic'}), /EVIDENCE_SELECTION_CHANGED/);
});
test('stale window and evidence are rejected', async () => {
  const f = fixture(), reader = createEvidenceReader(f.ports, f.options);
  await assert.rejects(reader.collectSources({...request(), window: {start: '2026-09-09', end: '2026-10-08'}}), /EVIDENCE_STALE_WINDOW/);
  const r = await reader.collectSources(request()); f.state.now = at(61);
  assert.throws(() => reader.assertCurrent(r, r.binding), /EVIDENCE_STALE/);
  await assert.rejects(reader.beforeWriting(r, {source_id: 'mock-work-1', topic_id: 'topic'}), /EVIDENCE_STALE/);
});
test('callback errors and timeout do not expose private diagnostics', async () => {
  const f = fixture(); f.ports.readSources = async () => { throw new EvidenceGateError('SECRET_AUTH_TOKEN'); };
  await assert.rejects(createEvidenceReader(f.ports, f.options).collectSources(request()), error => error.message === 'EVIDENCE_PORT_FAILED');
  f.ports.readSources = async () => new Promise(() => {});
  await assert.rejects(createEvidenceReader(f.ports, {...f.options, timeoutMs: 5}).collectSources(request()), /EVIDENCE_PORT_TIMEOUT/);
});
test('getter/function/cyclic/oversized data never becomes a receipt', async () => {
  const f = fixture(); let called = false;
  const evil = Object.defineProperty(request(), 'tool', {enumerable: true, get() { called = true; return true; }});
  await assert.rejects(createEvidenceReader(f.ports, f.options).collectSources(evil), /EVIDENCE_NOT_JSON/); assert.equal(called, false);
  const cyclic = {}; cyclic.self = cyclic;
  for (const bad of [{tool() {}}, cyclic, {private_text: 'a'.repeat(2 * 1024 * 1024 + 1)}]) {
    f.ports.readSources = async () => f.wrap(bad);
    await assert.rejects(createEvidenceReader(f.ports, f.options).collectSources(request()), /EVIDENCE_NOT_JSON|EVIDENCE_LIMIT/);
  }
});
test('completed full QA packet is freshly verified using the existing article validator', async () => {
  const f = fixture(), reader = createEvidenceReader(f.ports, f.options), r = await reader.collectQa(f.commitInput());
  assert.equal(r.kind, 'FULL_QA'); assert.equal(r.result.plan.intents[0].kind, 'CREATE_ATOMIC_TWO_FILE_COMMIT');
  assert.notEqual(r.binding.byte_bundle_sha256, r.binding.content_sha256);
  assert.notEqual(r.binding.report_bytes_sha256, r.binding.qa_report_sha256);
  assert.equal(f.calls.filter(c => c.name === 'readQaEvidence').length, 1);
  assert.equal(JSON.stringify(r).includes('MOCK en'), false);
  assert.throws(() => reader.authorize(r, operation(r)), /EVIDENCE_NOT_AUTHORITY/);
});
test('QA report and pixel checks remain required by existing execution-plan validator', async () => {
  for (const mutate of [q => { q.screenshots.pop(); }, q => { q.execution.verified_report.report_bytes_sha256 = H; }, q => { q.checks.privacy.status = 'failed'; }]) {
    const f = fixture(), old = f.methods.readQaEvidence;
    f.methods.readQaEvidence = a => { const out = old(a); mutate(out.qa); return out; };
    await assert.rejects(createEvidenceReader(f.ports, f.options).collectQa(f.commitInput()), /EVIDENCE_PLAN_REJECTED/);
  }
});
test('exact-head approval reads source message twice and executes fresh verify-review', async () => {
  const f = fixture(), reader = createEvidenceReader(f.ports, f.options), r = await reader.collectApproval(f.mergeInput(), {message_id: 'mock-message'});
  assert.equal(r.kind, 'EXACT_HEAD_APPROVAL'); assert.equal(r.result.plan.intents[0].kind, 'NORMAL_SERVER_PROTECTED_MERGE');
  assert.equal(f.calls.filter(c => c.name === 'readOwnerMessage').length, 2);
  assert.equal(f.calls.filter(c => c.name === 'runFullQa').length, 0);
  assert.equal(f.calls.filter(c => c.name === 'readQaEvidence').length, 1);
  assert.equal(f.calls.filter(c => c.name === 'verifyReview').length, 1);
  assert.equal(JSON.stringify(r).includes('PRIVATE_'), false);
  assert.throws(() => reader.authorize(r, operation(r)), /EVIDENCE_NOT_AUTHORITY/);
});
for (const [name, port, mutate, pattern] of [
  ['unauthenticated message', 'verifyOwnerApproval', r => { r.authenticated_owner = false; }, /EVIDENCE_APPROVAL_UNVERIFIED/],
  ['ordinary yes', 'verifyOwnerApproval', r => { r.explicit_approval = false; }, /EVIDENCE_APPROVAL_UNVERIFIED/],
  ['different verified message', 'verifyOwnerApproval', r => { r.message_sha256 = H; }, /EVIDENCE_APPROVAL_UNVERIFIED/],
  ['stale approval head', 'verifyOwnerApproval', r => { r.approval.head_sha = B; }, /EVIDENCE_PLAN_REJECTED/],
  ['different message author', 'verifyOwnerApproval', r => { r.approval.user_id = 'other-owner'; }, /EVIDENCE_APPROVAL_MESSAGE_CHANGED/],
  ['unverified packet', 'readQaEvidence', r => { r.integrity_verified = false; }, /EVIDENCE_QA_UNVERIFIED/],
  ['uninspected screenshot', 'readQaEvidence', r => { r.qa.screenshots[0].inspection = 'pending'; }, /EVIDENCE_PLAN_REJECTED/],
  ['changed QA report', 'readQaEvidence', r => { r.qa.report.content += ' changed'; }, /EVIDENCE_PLAN_REJECTED/],
  ['stale verify invocation', 'verifyReview', r => { r.verify_review.execution.completed_at = at(-1); }, /EVIDENCE_REVIEW_CACHED/],
  ['verify different bytes', 'verifyReview', r => { r.verify_review.byte_bundle_sha256 = H; }, /EVIDENCE_PLAN_REJECTED/],
]) test(`approval fails closed: ${name}`, async () => {
  const f = fixture(), old = f.methods[port]; f.methods[port] = a => { const result = clone(old(a)); mutate(result); return result; };
  await assert.rejects(createEvidenceReader(f.ports, f.options).collectApproval(f.mergeInput(), {message_id: 'mock-message'}), pattern);
});
test('changed or revoked owner message invalidates approval', async () => {
  for (const change of ['text', 'revision', 'revoked']) {
    const f = fixture(), old = f.methods.readOwnerMessage; let reads = 0;
    f.methods.readOwnerMessage = a => { const r = old(a); if (++reads > 1) r[change] = change === 'revoked' ? true : 'changed'; return r; };
    await assert.rejects(createEvidenceReader(f.ports, f.options).collectApproval(f.mergeInput(), {message_id: 'mock-message'}), /EVIDENCE_MESSAGE_CHANGED|EVIDENCE_MESSAGE_UNAVAILABLE/);
  }
});
test('remote head changing during verification invalidates approval', async () => {
  const f = fixture(), old = f.methods.verifyReview;
  f.methods.verifyReview = a => { f.state.head = B; return old(a); };
  await assert.rejects(createEvidenceReader(f.ports, f.options).collectApproval(f.mergeInput(), {message_id: 'mock-message'}), /EVIDENCE_HEAD_CHANGED/);
});
test('synthetic trusted-mode bridge binds authorization to one full dispatcher operation', async () => {
  const f = fixture('TRUSTED_ADAPTER'), reader = createEvidenceReader(f.ports, f.options), r = await reader.collectApproval(f.mergeInput(), {message_id: 'mock-message'}), op = operation(r);
  assert.deepEqual(reader.authorize(r, op), {authorized: true, operation_id: op.operation_id, target_sha: A, plan_sha256: op.plan_sha256, expires_at: at(60)});
  for (const change of [o => { o.target_sha = B; }, o => { o.intent.expected_head_sha = B; }, o => { o.plan_sha256 = H; }, o => { o.kind = 'deploy'; }, o => { o.operation_id = 'other'; }, o => { o.observed_at = at(-1); }]) {
    const wrong = clone(op); change(wrong); assert.throws(() => reader.authorize(r, wrong), /EVIDENCE_OPERATION_CHANGED/);
  }
  assert.throws(() => reader.authorize(clone(r), op), /EVIDENCE_FOREIGN_RECEIPT/);
  f.state.now = at(61); assert.throws(() => reader.authorize(r, op), /EVIDENCE_STALE/);
});
test('verified content approval without operation authority cannot authorize a merge', async () => {
  const f = fixture('TRUSTED_ADAPTER'), old = f.methods.verifyOwnerApproval;
  f.methods.verifyOwnerApproval = a => ({...old(a), authorized_intents: []});
  const reader = createEvidenceReader(f.ports, f.options), r = await reader.collectApproval(f.mergeInput(), {message_id: 'mock-message'});
  assert.throws(() => reader.authorize(r, operation(r)), /EVIDENCE_OPERATION_NOT_APPROVED/);
});
test('dispatcher composes with branded receipt authorization and recollects after journal', async () => {
  const f = fixture('TRUSTED_ADAPTER'), reader = createEvidenceReader(f.ports, f.options), seen = [];
  let receipt, applied = false, serial = 1;
  let state = transition({schema: 1, epoch: 0, status: 'idle', owner: null, until: null, pending: null}, {action: 'acquire', owner: 'mock-worker', ttl_seconds: 60}, NOW);
  const dispatcher = createMutationDispatcher({
    clock: () => f.state.now,
    prepare: async () => { receipt = await reader.collectApproval(f.mergeInput(), {message_id: 'mock-message'}); return {plan: receipt.result.plan, target_sha: receipt.binding.head_sha}; },
    authorize: async op => { seen.push(op); return reader.authorize(receipt, op); },
    reconcile: async op => ({complete: true, operation_id: op.operation_id, kind: op.kind, target_sha: op.target_sha, observed_at: f.state.now,
      state: applied ? 'APPLIED' : 'ABSENT', matches: applied ? 1 : 0, result_id: applied ? 'mock-merge' : null}),
    invoke: async op => { assert.equal(op.observed_at, at(1)); applied = true; },
    lease: {
      read: async () => ({sha: String(serial), state: clone(state)}),
      change: async (command, time) => { state = transition(state, command, time); serial++; if (command.action === 'begin') f.state.now = at(1); return {status: 'CONFIRMED', sha: String(serial), owner: state.owner, epoch: state.epoch}; },
      assertOperation: async (fence, id) => { assert.equal(fence.sha, String(serial)); assert.equal(state.pending.id, id); return {sha: String(serial), state: clone(state)}; },
    },
  }, {execute: true, mode: 'TRUSTED_ADAPTER'});
  const result = await dispatcher.dispatch({}, {owner: 'mock-worker', epoch: 1});
  assert.equal(result.status, 'APPLIED_VERIFIED'); assert.equal(state.pending, null); assert.equal(seen.length, 2);
  assert.equal(seen[0].observed_at, NOW); assert.equal(seen[1].observed_at, at(1));
  assert.equal(seen[0].operation_id, seen[1].operation_id);
  assert.equal(f.calls.filter(c => c.name === 'verifyOwnerApproval').length, 2);
  assert.equal(f.calls.filter(c => c.name === 'verifyReview').length, 2);
});
test('near-expiry gate snapshot cannot be refreshed by slow QA or approval callbacks', async () => {
  for (const merge of [false, true]) {
    const f = fixture(), old = f.methods.readQaEvidence;
    f.methods.readQaEvidence = a => { f.state.now = at(2); return old(a); };
    const input = merge ? f.mergeInput() : f.commitInput(); input.observed_at = at(-59);
    const reader = createEvidenceReader(f.ports, f.options);
    await assert.rejects(merge ? reader.collectApproval(input, {message_id: 'mock-message'}) : reader.collectQa(input), /EVIDENCE_STALE/);
  }
});
test('dispatcher refuses inherited gate evidence expiring during its final fence read', async () => {
  const f = fixture('TRUSTED_ADAPTER'), reader = createEvidenceReader(f.ports, f.options);
  let receipt, invoked = 0, fenceReads = 0, serial = 1;
  let state = transition({schema: 1, epoch: 0, status: 'idle', owner: null, until: null, pending: null}, {action: 'acquire', owner: 'mock-worker', ttl_seconds: 60}, NOW);
  const dispatcher = createMutationDispatcher({
    clock: () => f.state.now,
    prepare: async () => { const input = f.mergeInput(); input.observed_at = at(-59); receipt = await reader.collectApproval(input, {message_id: 'mock-message'}); return {plan: receipt.result.plan, target_sha: A}; },
    authorize: async op => { const consent = reader.authorize(receipt, op); assert.equal(consent.expires_at, at(1)); return consent; },
    reconcile: async op => ({complete: true, operation_id: op.operation_id, kind: op.kind, target_sha: op.target_sha, observed_at: f.state.now, state: 'ABSENT', matches: 0}),
    invoke: async () => { invoked++; },
    lease: {
      read: async () => ({sha: String(serial), state: clone(state)}),
      change: async (command, time) => { state = transition(state, command, time); return {status: 'CONFIRMED', sha: String(++serial), owner: state.owner, epoch: state.epoch}; },
      assertOperation: async () => { if (++fenceReads === 2) f.state.now = at(2); return {sha: String(serial), state: clone(state)}; },
    },
  }, {execute: true, mode: 'TRUSTED_ADAPTER'});
  await assert.rejects(dispatcher.dispatch({}, {owner: 'mock-worker', epoch: 1}), /AUTHORIZATION_EXPIRED|CONSENT_EXPIRED/);
  assert.equal(invoked, 0); assert.ok(state.pending);
});
test('gate snapshot lifetime also caps a newly minted approval receipt', async () => {
  const f = fixture('TRUSTED_ADAPTER'), reader = createEvidenceReader(f.ports, f.options), input = f.mergeInput(); input.observed_at = at(-59);
  const r = await reader.collectApproval(input, {message_id: 'mock-message'}); assert.equal(r.observed_at, NOW);
  f.state.now = at(2); assert.throws(() => reader.authorize(r, operation(r)), /EVIDENCE_STALE/);
});
test('long-running QA generation is not accepted through the short verification interface', async () => {
  const f = fixture(); assert.throws(() => createEvidenceReader({...f.ports, runFullQa() {}}, f.options), /EVIDENCE_PORTS/);
  f.ports.readQaEvidence = async () => new Promise(() => {});
  await assert.rejects(createEvidenceReader(f.ports, {...f.options, timeoutMs: 5}).collectQa(f.commitInput()), /EVIDENCE_PORT_TIMEOUT/);
});
