import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createReleaseRuntime, ReleaseRuntimeError} from '../cloud-blog-release-runtime.mjs';
import {CORE_SMOKE_PATHS, RELEASE_CHECKS, REPOSITORY, sha256} from '../cloud-blog-execution-plan.mjs';

const A = 'a'.repeat(40), B = 'b'.repeat(40), C = 'c'.repeat(40), H = 'd'.repeat(64);
const EPOCH = Date.parse('2026-10-10T08:00:00Z');
const at = seconds => new Date(EPOCH + seconds * 1000).toISOString();
const clone = structuredClone;
const routes = {en: '/blog/topic/', 'zh-cn': '/zh-cn/blog/topic/'};
const deployment = () => ({id: 'actual-deployment', version_id: 'target-version', target_sha: B, status: 'succeeded', completed_at: at(0), persisted_completed_at: at(0)});
function releaseEvidence(mode = 'MOCK') {
  const run = {id: 12, name: 'Site Build Check', path: '.github/workflows/hugo-check.yml', event: 'push', head_branch: 'main', head_sha: B, run_number: 9, run_attempt: 2, status: 'completed', conclusion: 'success'};
  return {schema_version: 1, mode, run_id: 'mock-release-test', observed_at: at(-10), evidence: {
    repository: REPOSITORY, main_sha: B, checkout: {sha: B, clean: true, submodules_pinned: true, tracked_unchanged: true},
    ci: {complete: true, runs: [run], selected_run: clone(run), selected_read_at: at(-11)},
    live: {commit_sha: A, version_id: 'known-good'}, known_good: {version_id: 'known-good', commit_sha: A, verified_at: at(-300), smoke_sha256: H},
    build: {commit_sha: B, hugo_version: '0.160.1', node_version: '22.13.0', workspace_local_npm_cache: true, clean_after: true, submodules_pinned: true, artifact_sha256: H,
      checks: Object.fromEntries(RELEASE_CHECKS.map(name => [name, {status: 'passed', evidence_sha256: H}]))},
    source: {commit_sha: B, confirmed_at: at(-12)}, archive: {commit_sha: B, build_sha256: H, archive_sha256: H},
    versions: {complete: true, items: [
      {version_id: 'target-version', commit_sha: B, source_commit_sha: B, build_sha256: H, archive_sha256: H},
      {version_id: 'known-good', commit_sha: A, source_commit_sha: A, build_sha256: H, archive_sha256: H},
    ]},
  }};
}
function harness({mode = 'MOCK', mutateResponse = () => {}, ...options} = {}) {
  let seconds = 0, sequence = 0;
  const calls = [];
  const http = {kind: mode === 'MOCK' ? 'MOCK' : 'TRUSTED_READ_ONLY_HTTP', request: async (request, {signal}) => {
    calls.push(request);
    assert.equal(signal.aborted, false);
    const url = new URL(request.url), www = url.hostname === 'www.fichil.com', version = url.pathname === '/version.json';
    const canonical = new URL(request.url); canonical.hostname = 'fichil.com';
    const response = {method: 'GET', requested_url: request.url, response_url: request.url, request_headers: clone(request.headers),
      status: www ? 308 : 200, headers: www ? {location: canonical.href} : version ? {'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store'} : {},
      body: version ? JSON.stringify({commit: B, builtAt: at(-20)}) : '<html>MOCK complete body</html>', complete: true, from_cache: false, observed_at: at(seconds)};
    mutateResponse(response, request, calls.length);
    return response;
  }};
  const runtime = createReleaseRuntime({enabled: true, mode, http, clock: () => at(seconds), queryToken: () => `mock_${sequence++}`, ...options});
  return {runtime, calls, setTime: n => { seconds = n; }, start: () => runtime.startSmoke({releaseEvidence: releaseEvidence(mode), deployment: deployment(), routes})};
}
async function stabilize(h) {
  let state = h.start();
  for (const n of [0, 10, 20]) { h.setTime(n); state = await h.runtime.advanceSmoke(state); }
  assert.equal(state.plan.outcome, 'STABLE_AWAITING_THREE_FULL_SMOKE_ROUNDS');
  return state;
}
function rehash(checkpoint) { const {sha256: ignored, ...data} = checkpoint; checkpoint.sha256 = sha256(JSON.stringify(data)); return checkpoint; }

test('default is disabled and no mutation switch or production adapter is available', async () => {
  let calls = 0;
  const runtime = createReleaseRuntime({http: {kind: 'MOCK', request: () => { calls++; }}});
  assert.equal(runtime.enabled, false);
  assert.equal(runtime.external_mutations, false);
  assert.equal(runtime.production_adapter_bound, false);
  assert.throws(() => runtime.prepareRelease(releaseEvidence()), /disabled/);
  assert.throws(() => runtime.startSmoke({releaseEvidence: releaseEvidence(), deployment: deployment(), routes}), /disabled/);
  await assert.rejects(runtime.advanceSmoke({}), /disabled/);
  assert.equal(calls, 0);
  assert.throws(() => createReleaseRuntime({enabled: true, execute: true}), /Unknown runtime option/);
  const source = readFileSync(new URL('../cloud-blog-release-runtime.mjs', import.meta.url), 'utf8');
  assert.equal(/\b(?:fetch|spawn|exec|eval)\s*\(|\bimport\s*\(/.test(source), false);
  assert.equal(/from ['"].*(?:sites|github|dispatcher)/.test(source), false);
});

test('fresh release binding passes validator output to dispatcher without executing any stage', () => {
  const h = harness(), input = releaseEvidence(), before = clone(input);
  const result = h.runtime.prepareRelease(input);
  assert.equal(result.target_sha, B);
  assert.equal(result.plan.status, 'PLAN_ONLY');
  assert.equal(result.plan.intents[0].kind, 'DEPLOY_VERIFIED_VERSION');
  assert.equal(result.plan.intents[0].rollback_version_id, 'known-good');
  assert.equal(result.production_adapter_bound, false);
  assert.ok(Object.isFrozen(result.plan.intents[0]) && Object.isFrozen(result.evidence));
  assert.deepEqual(input, before);
  assert.equal(h.calls.length, 0);
  for (const [kind, change] of [
    ['RUN_COMPLETE_LOCAL_RELEASE_QA', e => { e.build = null; e.source = null; e.archive = null; }],
    ['PUSH_EXACT_MAIN_SOURCE', e => { e.source = null; }],
    ['SAVE_EXACT_MAIN_VERSION', e => { e.versions.items.shift(); }],
  ]) {
    const changed = releaseEvidence(); change(changed.evidence);
    assert.equal(h.runtime.prepareRelease(changed).plan.intents[0].kind, kind);
  }
});

for (const [label, change] of [
  ['changed current main', e => { e.main_sha = C; }],
  ['partial saved versions', e => { e.versions.complete = false; }],
  ['head mismatch in pushed source', e => { e.source.commit_sha = C; }],
  ['partial CI', e => { e.ci.complete = false; }],
  ['uncertain CI status', e => { e.ci.selected_run.status = 'queued'; }],
  ['rollback absent from saved versions', e => { e.versions.items.pop(); }],
  ['rollback changed from previously live', e => { e.known_good.version_id = 'other'; }],
  ['target source/archive mismatch', e => { e.versions.items[0].archive_sha256 = 'e'.repeat(64); }],
]) test(`release rejects ${label}`, () => {
  const h = harness(), input = releaseEvidence(); change(input.evidence);
  assert.throws(() => h.runtime.prepareRelease(input));
  assert.equal(h.calls.length, 0);
});

test('release freshness and provenance are not laundered', () => {
  const h = harness(); h.setTime(51);
  assert.throws(() => h.runtime.prepareRelease(releaseEvidence()), /stale/);
  h.setTime(0);
  assert.throws(() => h.runtime.prepareRelease(releaseEvidence('TRUSTED_ADAPTER')), /mode mismatch/);
  assert.throws(() => createReleaseRuntime({enabled: true, mode: 'TRUSTED_ADAPTER', http: {kind: 'MOCK', request() {}}}), /provenance mismatch/);
  const trusted = harness({mode: 'TRUSTED_ADAPTER'});
  assert.equal(trusted.runtime.prepareRelease(releaseEvidence('TRUSTED_ADAPTER')).plan.evidence_mode, 'TRUSTED_ADAPTER');
  assert.equal(trusted.runtime.production_adapter_bound, false);
});

test('canonical nine routes, article pair, version and www are fetched in exactly three full rounds', async () => {
  const h = harness(); let state = await stabilize(h);
  for (let i = 0; i < 3; i++) state = await h.runtime.advanceSmoke(state);
  assert.equal(state.plan.outcome, 'STABLE_FULL_SMOKE_VERIFIED');
  assert.deepEqual(state.evidence.evidence.core_manifest.entries, CORE_SMOKE_PATHS);
  assert.equal(state.evidence.evidence.full_rounds.length, 3);
  assert.equal(h.calls.length, 45);
  for (const request of h.calls) {
    assert.equal(request.method, 'GET');
    assert.equal(request.redirect, 'manual');
    assert.equal(request.cache, 'no-store');
    assert.deepEqual(request.headers, {'cache-control': 'no-cache', pragma: 'no-cache'});
    assert.ok(request.timeout_ms <= 10_000 && request.max_response_bytes <= 1_048_576);
    assert.ok(Object.isFrozen(request) && Object.isFrozen(request.headers));
  }
  assert.equal(new Set(h.calls.map(c => c.url)).size, h.calls.length);
  for (let i = 9; i < h.calls.length; i += 12) {
    const paths = h.calls.slice(i, i + 12).map(c => new URL(c.url).pathname);
    assert.deepEqual(paths, [...CORE_SMOKE_PATHS, routes.en, routes['zh-cn'], '/']);
    assert.equal(new URL(h.calls[i + 11].url).hostname, 'www.fichil.com');
  }
  state = await h.runtime.advanceSmoke(state);
  assert.equal(h.calls.length, 45);
  assert.equal(state.plan.outcome, 'STABLE_FULL_SMOKE_VERIFIED');
});

test('sample cadence returns a wait without sleeping, polling or external reads', async () => {
  const h = harness(); const state = await h.runtime.advanceSmoke(h.start());
  h.setTime(9);
  const wait = await h.runtime.advanceSmoke(state);
  assert.equal(wait.outcome, 'WAIT_FOR_SAMPLE_INTERVAL');
  assert.equal(wait.next_sample_at, at(10));
  assert.equal(wait.state, state);
  assert.equal(h.calls.length, 3);
});

test('deadline expiry emits only the preverified prior-version rollback intent', async () => {
  const h = harness(); const state = h.start(); h.setTime(180);
  const result = await h.runtime.advanceSmoke(state);
  assert.equal(result.plan.reason, 'ORIGINAL_STABILIZATION_WINDOW_EXPIRED');
  assert.deepEqual(result.plan.intents, [{kind: 'ROLLBACK_KNOWN_GOOD', version_id: 'known-good', target_sha: A}]);
  assert.equal(result.target_sha, A);
  assert.equal(result.external_mutations, false);
  assert.equal(h.calls.length, 0);
});

test('three consecutive same-route failures trigger a plan, never a deployment call', async () => {
  const h = harness({mutateResponse: (r, request) => { if (new URL(request.url).pathname === routes.en) r.status = 503; }});
  let state = h.start();
  for (const n of [0, 10, 20]) { h.setTime(n); state = await h.runtime.advanceSmoke(state); }
  assert.equal(state.plan.reason, 'THREE_CONSECUTIVE_SAME_ROUTE_FAILURES');
  assert.equal(state.plan.intents[0].version_id, 'known-good');
  assert.equal(h.calls.length, 9);
});

for (const [label, change] of [
  ['one core route fails', (r, url) => { if (url.pathname === '/sitemap.xml') r.status = 500; }],
  ['article redirects', (r, url) => { if (url.pathname === routes.en) r.status = 301; }],
  ['version differs', (r, url) => { if (url.pathname === '/version.json') r.body = JSON.stringify({commit: C}); }],
  ['www is temporary redirect', (r, url) => { if (url.hostname.startsWith('www.')) r.status = 302; }],
  ['www points elsewhere', (r, url) => { if (url.hostname.startsWith('www.')) r.headers.location = 'https://other.example/'; }],
  ['version JSON incomplete', (r, url) => { if (url.pathname === '/version.json') r.body = '{'; }],
  ['version cache contract missing', (r, url) => { if (url.pathname === '/version.json') delete r.headers['cache-control']; }],
]) test(`full round rolls back when ${label}`, async () => {
  const h = harness({mutateResponse: (r, request, number) => { if (number > 9) change(r, new URL(request.url)); }});
  const stable = await stabilize(h), result = await h.runtime.advanceSmoke(stable);
  assert.equal(result.plan.reason, 'FULL_SMOKE_FAILED');
  assert.equal(result.plan.intents[0].target_sha, A);
  assert.equal(h.calls.length, 21);
});

for (const [label, change] of [
  ['partial body', r => { r.complete = false; }],
  ['cached response', r => { r.from_cache = true; }],
  ['uncertain cache provenance', r => { r.from_cache = null; }],
  ['cached positive age', r => { r.headers.age = '1'; }],
  ['cache hit', r => { r.headers['cf-cache-status'] = 'HIT'; }],
  ['cache stale', r => { r.headers['x-cache'] = 'STALE'; }],
  ['HEAD instead of GET', r => { r.method = 'HEAD'; }],
  ['missing body', r => { r.body = null; }],
  ['unknown status', r => { r.status = null; }],
  ['automatic redirect following', r => { r.response_url = 'https://fichil.com/'; }],
  ['missing request cache bypass', r => { r.request_headers.pragma = ''; }],
  ['old observation', r => { r.observed_at = at(-1); }],
  ['future observation', r => { r.observed_at = at(1); }],
]) test(`smoke rejects ${label} without making a healthy or rollback claim`, async () => {
  const h = harness({mutateResponse: change}), state = h.start();
  await assert.rejects(h.runtime.advanceSmoke(state), ReleaseRuntimeError);
  assert.equal(h.calls.length, 3);
  assert.equal(state.plan.outcome, 'PROPAGATING');
  assert.equal(state.evidence.evidence.samples.length, 0);
});

test('HTTP timeout cancels one bounded batch without an automatic retry', async () => {
  let count = 0; const signals = [];
  const h = harness({requestTimeoutMs: 5, http: {kind: 'MOCK', request: (_request, {signal}) => { count++; signals.push(signal); return new Promise(() => {}); }}});
  await assert.rejects(h.runtime.advanceSmoke(h.start()), /timed out/);
  assert.equal(count, 3);
  assert.ok(signals.every(s => s.aborted));
});

test('adapter errors remain uncertain and are sanitized', async () => {
  let calls = 0;
  const h = harness({http: {kind: 'MOCK', request: async () => { calls++; throw new Error('SECRET_CREDENTIAL from connector'); }}});
  await assert.rejects(h.runtime.advanceSmoke(h.start()), error => /uncertain/.test(error.message) && !/SECRET/.test(error.message));
  assert.equal(calls, 3);
});

test('restarts preserve actual completion and deadline, discard earlier samples and preserve used tokens', async () => {
  const h = harness(); let state = await h.runtime.advanceSmoke(h.start());
  const checkpoint = clone(state.checkpoint), h2 = harness(); h2.setTime(175);
  state = h2.runtime.resumeSmoke({checkpoint, deployment: deployment(), restartedAt: at(175)});
  assert.equal(state.evidence.evidence.deployment.completed_at, at(0));
  assert.equal(state.evidence.evidence.deployment.persisted_completed_at, at(0));
  assert.equal(state.plan.original_deadline, at(180));
  assert.deepEqual(state.evidence.evidence.samples, []);
  await assert.rejects(h2.runtime.advanceSmoke(state), /Fresh unique/);
  assert.equal(h2.calls.length, 0);
  h2.setTime(180);
  state = await h2.runtime.advanceSmoke(state);
  assert.equal(state.plan.reason, 'ORIGINAL_STABILIZATION_WINDOW_EXPIRED');
  assert.equal(h2.calls.length, 0);
});

test('checkpoint is integrity checked, and separately read deployment identity cannot reset completion', () => {
  const h = harness(), checkpoint = clone(h.start().checkpoint);
  checkpoint.smoke_evidence.evidence.deployment.completed_at = at(1);
  assert.throws(() => h.runtime.resumeSmoke({checkpoint, deployment: deployment(), restartedAt: at(1)}), /integrity/);
  rehash(checkpoint); h.setTime(1);
  assert.throws(() => h.runtime.resumeSmoke({checkpoint, deployment: deployment(), restartedAt: at(1)}), /identity\/completion changed/);
});

test('rehashed snapshot cannot swap rollback evidence away from preverified release record', () => {
  const h = harness(), checkpoint = clone(h.start().checkpoint);
  checkpoint.smoke_evidence.evidence.known_good.version_id = 'unverified-rollback';
  rehash(checkpoint);
  assert.throws(() => h.runtime.resumeSmoke({checkpoint, deployment: deployment(), restartedAt: at(0)}), /preverified rollback/);
});

for (const [label, change] of [
  ['uncertain deployment', d => { d.status = 'unknown'; }],
  ['changed actual target', d => { d.target_sha = C; }],
  ['changed actual version', d => { d.version_id = 'other'; }],
  ['reset persisted timestamp', d => { d.persisted_completed_at = at(1); }],
]) test(`cannot start with ${label}`, () => {
  const h = harness(), d = deployment(); change(d);
  assert.throws(() => h.runtime.startSmoke({releaseEvidence: releaseEvidence(), deployment: d, routes}));
  assert.equal(h.calls.length, 0);
});

test('canonical routes reject off-origin paths and unpaired slugs before requests', () => {
  const h = harness();
  for (const bad of [{en: 'https://evil.example/', 'zh-cn': routes['zh-cn']}, {en: routes.en, 'zh-cn': '/zh-cn/blog/other/'}]) {
    assert.throws(() => h.runtime.startSmoke({releaseEvidence: releaseEvidence(), deployment: deployment(), routes: bad}), /canonical/);
  }
  assert.equal(h.calls.length, 0);
});

test('state cannot be modified, forged, reused after advancement or observed concurrently', async () => {
  const h = harness(), state = h.start();
  assert.throws(() => { state.evidence.evidence.known_good.version_id = 'other'; }, TypeError);
  await assert.rejects(h.runtime.advanceSmoke(clone(state)), /current state/);
  const pending = h.runtime.advanceSmoke(state);
  await assert.rejects(h.runtime.advanceSmoke(state), /already in progress/);
  await pending;
  await assert.rejects(h.runtime.advanceSmoke(state), /current state/);
});

test('accessor evidence is rejected without executing it', () => {
  const h = harness(), input = releaseEvidence(); let called = false;
  Object.defineProperty(input.evidence, 'execute', {enumerable: true, get() { called = true; return true; }});
  assert.throws(() => h.runtime.prepareRelease(input), /Accessor/);
  assert.equal(called, false);
});

test('a missing HTTP adapter is reported honestly without promoting propagation', async () => {
  const h = harness({http: null}), state = h.start();
  await assert.rejects(h.runtime.advanceSmoke(state), /No trusted read-only HTTP adapter/);
  assert.equal(state.plan.outcome, 'PROPAGATING');
});

test('adapter ReleaseRuntimeError messages/stacks are sanitized too', async () => {
  const h = harness({http: {kind: 'MOCK', request: async () => { throw new ReleaseRuntimeError('SECRET_TOKEN'); }}});
  await assert.rejects(h.runtime.advanceSmoke(h.start()), error => !String(error).includes('SECRET_TOKEN') && !error.stack.includes('SECRET_TOKEN') && error.cause === undefined);
});

test('terminal healthy and rollback checkpoints cannot resume as propagation', async () => {
  const healthy = harness(); let state = await stabilize(healthy);
  for (let i = 0; i < 3; i++) state = await healthy.runtime.advanceSmoke(state);
  healthy.setTime(240);
  assert.throws(() => healthy.runtime.resumeSmoke({checkpoint: state.checkpoint, deployment: deployment(), restartedAt: at(240)}), /Terminal smoke/);
  const failed = harness(); const initial = failed.start(); failed.setTime(180);
  const terminal = await failed.runtime.advanceSmoke(initial);
  assert.throws(() => failed.runtime.resumeSmoke({checkpoint: terminal.checkpoint, deployment: deployment(), restartedAt: at(180)}), /Terminal smoke/);
  assert.equal(await healthy.runtime.advanceSmoke(state), state);
  assert.equal(state.plan.observed_at, at(20));
});

test('stale stabilization/full-round evidence is not refreshed by stamping a new envelope', async () => {
  const h = harness(), state = await stabilize(h); h.setTime(81);
  await assert.rejects(h.runtime.advanceSmoke(state), /continuity is stale/);
  assert.equal(h.calls.length, 9);
});

for (const location of ['https://evil.example/', 'https://fichil.com/elsewhere/', 'https://fichil.com/?extra=1', 'https://fichil.com/?_cloud_blog_smoke=wrong']) {
  test(`www refuses unverified location ${location}`, async () => {
    const h = harness({mutateResponse: (r, request) => { if (new URL(request.url).hostname === 'www.fichil.com') r.headers.location = location; }});
    const state = await h.runtime.advanceSmoke(await stabilize(h));
    assert.equal(state.plan.reason, 'FULL_SMOKE_FAILED');
  });
}

function priorSmokeReport() {
  const priorRoutes = {en: '/blog/prior-topic/', 'zh-cn': '/zh-cn/blog/prior-topic/'};
  const entries = [...CORE_SMOKE_PATHS], uncached = n => ({at: at(n), query_token: `prior_${-n}`, cache_control: 'no-cache', pragma: 'no-cache'});
  const evidence = {schema_version: 1, mode: 'MOCK', run_id: 'prior-verified-release', observed_at: at(-300), evidence: {
    repository: REPOSITORY, deployment: {id: 'prior-deployment', version_id: 'known-good', target_sha: A, status: 'succeeded', completed_at: at(-350), persisted_completed_at: at(-350)},
    known_good: {version_id: 'older-good', commit_sha: C, verified_at: at(-600), smoke_sha256: H}, routes: priorRoutes, restart_at: null,
    samples: [-330, -320, -310].map(n => ({...uncached(n), commit_sha: A, en_status: 200, zh_cn_status: 200})),
    core_manifest: {origin: 'https://fichil.com', entries, sha256: sha256(JSON.stringify(entries))},
    full_rounds: [-305, -303, -300].map(n => ({...uncached(n), core_status: Object.fromEntries(entries.map(p => [p, 200])), article_status: Object.fromEntries(Object.values(priorRoutes).map(p => [p, 200])), commit_sha: A, version_status: 200, www_status: 308, www_location: 'https://fichil.com/'})),
  }};
  const content = JSON.stringify(evidence);
  return {content, sha256: sha256(content)};
}
async function rollbackHarness(mutateResponse = () => {}) {
  const h = harness({mutateResponse: (r, request, count) => {
    if (new URL(request.url).pathname === '/version.json') r.body = JSON.stringify({commit: A});
    mutateResponse(r, request, count);
  }});
  const knownGoodReport = priorSmokeReport(), input = releaseEvidence(); input.evidence.known_good.smoke_sha256 = knownGoodReport.sha256;
  const initial = h.runtime.startSmoke({releaseEvidence: input, deployment: deployment(), routes});
  h.setTime(180); const failedSmoke = await h.runtime.advanceSmoke(initial); h.setTime(181);
  const args = {failedSmoke, deployment: {id: 'actual-rollback', version_id: 'known-good', target_sha: A, status: 'succeeded', completed_at: at(181), persisted_completed_at: at(181)},
    deploymentReadAt: at(181), version: {complete: true, version_id: 'known-good', commit_sha: A, source_commit_sha: A, read_at: at(181)}, knownGoodReport};
  return {...h, args, begin: () => h.runtime.startRollback(args)};
}

test('rollback completion plus three full rounds verifies exact prior source and prior article manifest', async () => {
  const h = await rollbackHarness(); let state = h.begin();
  assert.equal(state.outcome, 'ROLLBACK_AWAITING_THREE_FULL_SMOKE_ROUNDS');
  for (let i = 0; i < 3; i++) state = await h.runtime.observeRollback(state);
  assert.equal(state.outcome, 'ROLLBACK_FULL_SMOKE_VERIFIED');
  assert.equal(state.evidence.deployment.completed_at, at(181));
  assert.equal(state.evidence.deployment.persisted_completed_at, at(181));
  assert.equal(state.evidence.version.source_commit_sha, A);
  assert.equal(state.evidence.routes.en, '/blog/prior-topic/');
  assert.equal(h.calls.length, 36);
  assert.equal(state.mutations_permitted, false);
  assert.equal(state.plan, undefined);
  assert.equal(state.intents, undefined);
  assert.equal(state.production_adapter_bound, false);
  assert.ok(h.calls.every(c => !new URL(c.url).pathname.includes('/topic/')));
  for (let i = 0; i < 36; i += 12) assert.deepEqual(h.calls.slice(i, i + 12).map(c => new URL(c.url).pathname), [...CORE_SMOKE_PATHS, '/blog/prior-topic/', '/zh-cn/blog/prior-topic/', '/']);
  assert.equal(await h.runtime.observeRollback(state), state);
  assert.equal(h.calls.length, 36);
});

for (const [label, change] of [
  ['unknown deployment completion', args => { args.deployment.status = 'unknown'; }],
  ['failed deployment completion', args => { args.deployment.status = 'failed'; }],
]) test(`rollback ${label} needs human attention before reads`, async () => {
  const h = await rollbackHarness(); change(h.args);
  const state = h.begin();
  assert.equal(state.outcome, 'URGENT_HUMAN_ATTENTION');
  assert.equal(state.reason, 'ROLLBACK_COMPLETION_UNVERIFIED');
  assert.equal(h.calls.length, 0);
});

for (const [label, change] of [
  ['different version', args => { args.deployment.version_id = 'not-known-good'; }],
  ['different source', args => { args.version.source_commit_sha = C; }],
  ['partial source readback', args => { args.version.complete = false; }],
  ['stale readback', args => { args.version.read_at = at(120); }],
  ['reset completion', args => { args.deployment.persisted_completed_at = at(182); }],
  ['deployment completion predates failed smoke', args => { args.deployment.completed_at = at(179); args.deployment.persisted_completed_at = at(179); }],
  ['unbound prior report', args => { args.knownGoodReport.content += ' '; }],
]) test(`rollback rejects ${label}`, async () => {
  const h = await rollbackHarness(); change(h.args);
  assert.throws(() => h.begin());
  assert.equal(h.calls.length, 0);
});

for (const [label, change, reason] of [
  ['wrong live version', (r, url) => { if (url.pathname === '/version.json') r.body = JSON.stringify({commit: B}); }, 'ROLLBACK_FULL_SMOKE_FAILED'],
  ['failed prior article', (r, url) => { if (url.pathname === '/blog/prior-topic/') r.status = 404; }, 'ROLLBACK_FULL_SMOKE_FAILED'],
  ['failed core route', (r, url) => { if (url.pathname === '/sitemap.xml') r.status = 503; }, 'ROLLBACK_FULL_SMOKE_FAILED'],
  ['wrong www redirect', (r, url) => { if (url.hostname.startsWith('www.')) r.headers.location = 'https://wrong.example/'; }, 'ROLLBACK_FULL_SMOKE_FAILED'],
  ['cached observation', r => { r.from_cache = true; }, 'ROLLBACK_HTTP_EVIDENCE_UNCERTAIN'],
  ['partial observation', r => { r.complete = false; }, 'ROLLBACK_HTTP_EVIDENCE_UNCERTAIN'],
]) test(`rollback ${label} stops for human attention without recursive rollback intent`, async () => {
  const h = await rollbackHarness((r, request) => change(r, new URL(request.url)));
  const state = await h.runtime.observeRollback(h.begin());
  assert.equal(state.outcome, 'URGENT_HUMAN_ATTENTION');
  assert.equal(state.reason, reason);
  assert.equal(state.plan, undefined);
  assert.equal(state.intents, undefined);
  assert.equal(state.mutations_permitted, false);
  assert.equal(h.calls.length, 12);
  await h.runtime.observeRollback(state);
  assert.equal(h.calls.length, 12);
});

test('rollback verification window stays bound to actual completion', async () => {
  const h = await rollbackHarness(), state = h.begin(); h.setTime(361);
  const result = await h.runtime.observeRollback(state);
  assert.equal(result.reason, 'ROLLBACK_VERIFICATION_WINDOW_EXPIRED');
  assert.equal(result.evidence.deployment.completed_at, at(181));
  assert.equal(h.calls.length, 0);
});

test('rollback cannot begin without a current failed-smoke intent', async () => {
  const h = await rollbackHarness(); h.setTime(0); h.args.failedSmoke = h.start(); h.setTime(181);
  assert.throws(() => h.begin(), /failed-smoke rollback intent/);
});
