/**
 * Default-disabled, bounded READ-ONLY release binding. No Sites/source writer is
 * bound here. A caller may hand {plan, target_sha} to the separately authorized,
 * fenced mutation dispatcher; these results are not execution capabilities.
 *
 * TRUST BOUNDARY: release/deployment evidence, persisted checkpoints and the HTTP
 * port must come from trusted runtime adapters, never PR text or user JSON. A
 * TRUSTED_ADAPTER label or checkpoint hash does not authenticate that provenance.
 * The port must actually perform uncached GETs with manual redirects and honor
 * cancellation/response limits. This module has no built-in HTTP/network adapter.
 * RUN_COMPLETE_LOCAL_RELEASE_QA stays a separate local action. Source pushes,
 * deployment and rollback require the dispatcher; rollback is an intent only.
 */
import {randomUUID} from 'node:crypto';
import {CORE_SMOKE_PATHS, REPOSITORY, planRelease, planSmoke, sha256} from './cloud-blog-execution-plan.mjs';

export class ReleaseRuntimeError extends Error {}
const SHA = /^[a-f0-9]{40}$/;
const ORIGIN = 'https://fichil.com';
const need = (ok, message) => { if (!ok) throw new ReleaseRuntimeError(message); };
const freeze = v => { if (v && typeof v === 'object') { Object.values(v).forEach(freeze); Object.freeze(v); } return v; };
function json(v, depth = 0) {
  need(depth <= 30, 'Evidence nesting limit exceeded');
  if (v === null || ['string', 'boolean'].includes(typeof v)) return;
  if (typeof v === 'number') { need(Number.isFinite(v), 'Non-finite evidence'); return; }
  need(v && typeof v === 'object' && (Array.isArray(v) || Object.getPrototypeOf(v) === Object.prototype), 'Plain JSON evidence required');
  need(Object.getOwnPropertySymbols(v).length === 0, 'Symbol evidence forbidden');
  if (Array.isArray(v)) need(Object.keys(v).length === v.length && Object.keys(v).every((k, i) => k === String(i)), 'Sparse evidence forbidden');
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(v))) {
    if (Array.isArray(v) && key === 'length') continue;
    need(descriptor.enumerable && 'value' in descriptor, 'Accessor/non-JSON evidence forbidden');
    json(descriptor.value, depth + 1);
  }
}
function copy(v) { json(v); return structuredClone(v); }
function record(v, keys, label) {
  need(v && Object.getPrototypeOf(v) === Object.prototype && Object.keys(v).sort().join('\0') === [...keys].sort().join('\0'), `${label}: missing or unexpected fields`);
}
function timestamp(v) {
  need(typeof v === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(v), 'UTC timestamp required');
  const n = Date.parse(v);
  need(Number.isFinite(n) && new Date(n).toISOString().replace('.000Z', 'Z') === v.replace('.000Z', 'Z'), 'Invalid timestamp');
  return n;
}
function exactDeployment(actual, persisted) {
  need(JSON.stringify(actual) === JSON.stringify(persisted), 'Deployment identity/completion changed; reconcile independently');
}

/**
 * http.request(request, {signal}) returns complete plain JSON:
 * {method, requested_url, response_url, request_headers, status, headers, body,
 *  complete, from_cache, observed_at}. Headers use lowercase names. Failures throw;
 * no missing/partial/unknown response is converted into a successful observation.
 * A real port must declare kind TRUSTED_READ_ONLY_HTTP; test ports declare MOCK.
 */
export function createReleaseRuntime(options = {}) {
  need(options && Object.getPrototypeOf(options) === Object.prototype, 'Runtime options must be a plain record');
  const allowed = ['enabled', 'mode', 'http', 'clock', 'queryToken', 'requestTimeoutMs'];
  need(Object.keys(options).every(k => allowed.includes(k)), 'Unknown runtime option; mutation switches are not supported');
  const {enabled = false, mode = 'MOCK', http = null, clock = () => new Date().toISOString(), queryToken = randomUUID, requestTimeoutMs = 10_000} = options;
  need(typeof enabled === 'boolean' && ['MOCK', 'TRUSTED_ADAPTER'].includes(mode), 'Explicit valid runtime mode required');
  need(typeof clock === 'function' && typeof queryToken === 'function', 'Clock and token functions required');
  need(Number.isSafeInteger(requestTimeoutMs) && requestTimeoutMs > 0 && requestTimeoutMs <= 10_000, 'HTTP timeout must be bounded at 10 seconds');
  if (http !== null) {
    record(http, ['kind', 'request'], 'read-only HTTP port');
    need(http.kind === (mode === 'MOCK' ? 'MOCK' : 'TRUSTED_READ_ONLY_HTTP') && typeof http.request === 'function', 'HTTP port provenance mismatch');
  }
  const states = new WeakMap(), rollbackStates = new WeakMap(), busy = new WeakSet(), retired = new WeakSet(), usedTokens = new Set();
  const current = () => { const now = clock(); timestamp(now); return now; };
  const gate = () => need(enabled, 'Release runtime is disabled; no read or execution was attempted');
  function release(input, now) {
    const evidence = copy(input);
    need(evidence.mode === mode, 'Release evidence mode mismatch');
    const plan = planRelease(evidence, now);
    return freeze({plan, evidence, target_sha: evidence.evidence.main_sha, external_mutations: false, production_adapter_bound: false});
  }
  function deploymentBinding(releaseEvidence, deployment) {
    // Historical pre-deployment verification is preserved across restart. The
    // dispatcher, not this historical check, enforces freshness before mutation.
    const verified = release(releaseEvidence, releaseEvidence.observed_at);
    const intent = verified.plan.intents[0];
    need(verified.plan.intents.length === 1 && intent.kind === 'DEPLOY_VERIFIED_VERSION', 'A fully verified pre-deployment release plan is required');
    need(intent.target_sha === deployment.target_sha && intent.version_id === deployment.version_id, 'Actual deployment does not match verified release target');
    need(timestamp(releaseEvidence.observed_at) <= timestamp(deployment.completed_at), 'Release verification must precede actual deployment completion');
    need(intent.rollback_version_id === releaseEvidence.evidence.known_good.version_id, 'Preverified rollback identity changed');
    return verified;
  }
  function makeState(releaseEvidence, envelope, tokens) {
    const now = current();
    envelope.observed_at = now;
    need(envelope.mode === mode, 'Smoke evidence mode mismatch');
    const plan = planSmoke(envelope, now);
    const data = {schema_version: 1, release_evidence: copy(releaseEvidence), smoke_evidence: copy(envelope), query_tokens: [...tokens]};
    const checkpoint = {...data, sha256: sha256(JSON.stringify(data))};
    const report = JSON.stringify(envelope);
    const state = freeze({plan, evidence: envelope, target_sha: plan.intents[0]?.target_sha ?? envelope.evidence.deployment.target_sha,
      external_mutations: false, production_adapter_bound: false, checkpoint,
      ...(plan.outcome === 'STABLE_FULL_SMOKE_VERIFIED' ? {verified_smoke_report: {content: report, sha256: sha256(report)}} : {})});
    states.set(state, {releaseEvidence, tokens: [...tokens]});
    return state;
  }
  function prepareRelease(input) { gate(); return release(input, current()); }
  function startSmoke({releaseEvidence: rawRelease, deployment: rawDeployment, routes: rawRoutes}) {
    gate();
    const releaseEvidence = copy(rawRelease), deployment = copy(rawDeployment), routes = copy(rawRoutes);
    deploymentBinding(releaseEvidence, deployment);
    const entries = [...CORE_SMOKE_PATHS];
    return makeState(releaseEvidence, {schema_version: 1, mode, run_id: releaseEvidence.run_id, observed_at: current(), evidence: {
      repository: REPOSITORY, deployment, known_good: copy(releaseEvidence.evidence.known_good), routes, restart_at: null,
      samples: [], core_manifest: {origin: ORIGIN, entries, sha256: sha256(JSON.stringify(entries))}, full_rounds: [],
    }}, []);
  }
  function resumeSmoke({checkpoint: rawCheckpoint, deployment: rawDeployment, restartedAt}) {
    gate();
    const checkpoint = copy(rawCheckpoint), deployment = copy(rawDeployment);
    record(checkpoint, ['schema_version', 'release_evidence', 'smoke_evidence', 'query_tokens', 'sha256'], 'checkpoint');
    const {sha256: digest, ...data} = checkpoint;
    need(checkpoint.schema_version === 1 && digest === sha256(JSON.stringify(data)), 'Checkpoint integrity mismatch');
    need(checkpoint.smoke_evidence.mode === mode, 'Checkpoint provenance mismatch');
    need(Array.isArray(checkpoint.query_tokens) && checkpoint.query_tokens.length <= 128 && new Set(checkpoint.query_tokens).size === checkpoint.query_tokens.length && checkpoint.query_tokens.every(t => typeof t === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(t)), 'Invalid saved query-token history');
    const releaseEvidence = checkpoint.release_evidence, envelope = checkpoint.smoke_evidence;
    deploymentBinding(releaseEvidence, deployment);
    exactDeployment(deployment, envelope.evidence.deployment);
    need(JSON.stringify(envelope.evidence.known_good) === JSON.stringify(releaseEvidence.evidence.known_good), 'Checkpoint changed preverified rollback evidence');
    const savedPlan = planSmoke(envelope, envelope.observed_at);
    need(savedPlan.intents.length === 0 && savedPlan.outcome !== 'STABLE_FULL_SMOKE_VERIFIED', 'Terminal smoke checkpoint requires authoritative reconciliation, never propagation restart');
    need(timestamp(restartedAt) >= timestamp(envelope.observed_at) && timestamp(restartedAt) <= timestamp(current()), 'Restart timestamp must follow saved evidence and not be future');
    // Never reset the original completion/deadline. Pre-restart observations do
    // not establish post-restart stability, and tokens remain unavailable.
    envelope.evidence.restart_at = restartedAt;
    envelope.evidence.samples = [];
    envelope.evidence.full_rounds = [];
    checkpoint.query_tokens.forEach(t => usedTokens.add(t));
    return makeState(releaseEvidence, envelope, checkpoint.query_tokens);
  }
  function nextToken(tokens) {
    const token = queryToken();
    need(typeof token === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(token) && !usedTokens.has(token) && !tokens.includes(token), 'Fresh unique cache-bypass token required');
    usedTokens.add(token);
    return token;
  }
  function validateResponse(raw, request, startedAt, endedAt) {
    const response = copy(raw);
    record(response, ['method', 'requested_url', 'response_url', 'request_headers', 'status', 'headers', 'body', 'complete', 'from_cache', 'observed_at'], 'HTTP response');
    need(response.method === 'GET' && response.requested_url === request.url && response.response_url === request.url, 'GET/manual redirect request identity not established');
    record(response.request_headers, ['cache-control', 'pragma'], 'observed request headers');
    need(response.request_headers['cache-control'] === 'no-cache' && response.request_headers.pragma === 'no-cache', 'Uncached request headers not established');
    need(response.complete === true && response.from_cache === false, 'Partial/uncertain/cached HTTP observation');
    need(Number.isSafeInteger(response.status) && response.status >= 100 && response.status <= 599, 'Unknown HTTP status');
    need(typeof response.body === 'string' && Buffer.byteLength(response.body, 'utf8') <= request.max_response_bytes, 'Missing/oversized response body');
    need(response.headers && Object.getPrototypeOf(response.headers) === Object.prototype && Object.entries(response.headers).every(([k, v]) => k === k.toLowerCase() && typeof v === 'string'), 'Normalized response headers required');
    const age = response.headers.age;
    need(age === undefined || (/^\d+$/.test(age) && Number(age) === 0), 'Aged/ambiguous cached response rejected');
    for (const name of ['x-cache', 'cf-cache-status', 'x-cache-status']) need(!/\b(?:hit|stale|updating)\b/i.test(response.headers[name] ?? ''), 'Cache-hit observation rejected');
    const observed = timestamp(response.observed_at);
    need(observed >= timestamp(startedAt) && observed <= timestamp(endedAt), 'Stale/future HTTP response');
    return response;
  }
  async function batch(paths, token) {
    need(http !== null, 'No trusted read-only HTTP adapter is bound');
    const startedAt = current(), abort = new AbortController();
    const requests = paths.map((path, i) => freeze({method: 'GET', url: `${path.startsWith('https://') ? path : `${ORIGIN}${path}`}?_cloud_blog_smoke=${token}_${i}`,
      headers: {'cache-control': 'no-cache', pragma: 'no-cache'}, redirect: 'manual', cache: 'no-store',
      timeout_ms: requestTimeoutMs, max_response_bytes: 1_048_576}));
    let timer;
    try {
      const responses = await Promise.race([
        Promise.all(requests.map(request => Promise.resolve().then(() => http.request(request, {signal: abort.signal})).catch(() => {
          // Sanitize at the adapter boundary, even when it throws our own error
          // class. Never carry its message, stack or cause into the result.
          throw new ReleaseRuntimeError('HTTP evidence unavailable or uncertain; no automatic retry');
        }))),
        new Promise((_, reject) => { timer = setTimeout(() => { abort.abort(); reject(new ReleaseRuntimeError('HTTP observation timed out; no automatic retry')); }, requestTimeoutMs); }),
      ]);
      const endedAt = current();
      need(timestamp(endedAt) - timestamp(startedAt) <= requestTimeoutMs, 'HTTP batch exceeded its observation window');
      return {at: endedAt, responses: responses.map((r, i) => validateResponse(r, requests[i], startedAt, endedAt))};
    } catch (error) {
      abort.abort();
      if (error instanceof ReleaseRuntimeError) throw error;
      // Adapter errors can contain URLs/credentials; do not echo them into plans.
      throw new ReleaseRuntimeError('HTTP evidence unavailable or uncertain; no automatic retry');
    } finally { clearTimeout(timer); }
  }
  function observedCommit(response) {
    if (response.status !== 200) return null;
    if (!/^application\/json(?:\s*;|$)/i.test(response.headers['content-type'] ?? '') || !/(?:^|,)\s*no-store\s*(?:,|$)/i.test(response.headers['cache-control'] ?? '')) return null;
    try { const body = JSON.parse(response.body); return body && typeof body.commit === 'string' && SHA.test(body.commit) ? body.commit : null; }
    catch { return null; }
  }
  function canonicalRedirect(response) {
    const raw = response.headers.location ?? null;
    // The actual worker preserves the cache-bypass query on www -> apex. Accept
    // only that exact generated query or the bare canonical root, never another
    // host/path/query. The plan validator receives the verified canonical root.
    const expected = new URL(response.requested_url);
    expected.hostname = 'fichil.com';
    return raw === ORIGIN + '/' || raw === expected.href ? ORIGIN + '/' : raw;
  }
  async function advanceSmoke(state) {
    gate();
    need(states.has(state) && !retired.has(state), 'Smoke state must be a current state from this runtime');
    need(!busy.has(state), 'Smoke observation already in progress');
    busy.add(state);
    try {
      const {releaseEvidence, tokens} = states.get(state), envelope = copy(state.evidence), e = envelope.evidence;
      envelope.observed_at = current();
      const before = planSmoke(envelope, envelope.observed_at);
      if (before.intents.length || before.outcome === 'STABLE_FULL_SMOKE_VERIFIED') {
        // Re-reading a terminal local decision is not fresh remote evidence.
        if (state.plan.intents.length || state.plan.outcome === 'STABLE_FULL_SMOKE_VERIFIED') return state;
        const next = makeState(releaseEvidence, envelope, tokens);
        retired.add(state);
        return next;
      }
      if (before.outcome === 'PROPAGATING' && e.samples.length && timestamp(envelope.observed_at) - timestamp(e.samples.at(-1).at) < 10_000) {
        return freeze({state, outcome: 'WAIT_FOR_SAMPLE_INTERVAL', next_sample_at: new Date(timestamp(e.samples.at(-1).at) + 10_000).toISOString(), external_mutations: false});
      }
      const token = nextToken(tokens), uncached = {query_token: token, cache_control: 'no-cache', pragma: 'no-cache'};
      if (before.outcome === 'PROPAGATING') {
        need(e.samples.length < 19, 'Stabilization sample bound exceeded');
        const observation = await batch(['/version.json', e.routes.en, e.routes['zh-cn']], token);
        const [version, en, zh] = observation.responses;
        e.samples.push({at: observation.at, ...uncached, commit_sha: observedCommit(version), en_status: en.status, zh_cn_status: zh.status});
      } else {
        need(before.outcome === 'STABLE_AWAITING_THREE_FULL_SMOKE_ROUNDS' && e.full_rounds.length < 3, 'Unexpected smoke phase');
        const latest = e.full_rounds.at(-1)?.at ?? e.samples.at(-1).at;
        need(timestamp(envelope.observed_at) - timestamp(latest) <= 60_000, 'Smoke continuity is stale; fresh authoritative reconciliation required');
        const paths = [...CORE_SMOKE_PATHS, e.routes.en, e.routes['zh-cn'], 'https://www.fichil.com/'];
        const observation = await batch(paths, token), responses = observation.responses;
        need(timestamp(current()) - timestamp(latest) <= 60_000, 'Inherited smoke continuity expired during HTTP observation');
        const version = responses[CORE_SMOKE_PATHS.indexOf('/version.json')], www = responses.at(-1);
        e.full_rounds.push({at: observation.at, ...uncached,
          core_status: Object.fromEntries(CORE_SMOKE_PATHS.map((p, i) => [p, responses[i].status])),
          article_status: {[e.routes.en]: responses[9].status, [e.routes['zh-cn']]: responses[10].status},
          commit_sha: observedCommit(version), version_status: version.status, www_status: www.status, www_location: canonicalRedirect(www)});
      }
      const next = makeState(releaseEvidence, envelope, [...tokens, token]);
      retired.add(state);
      return next;
    } finally { busy.delete(state); }
  }
  function rollbackResult(evidence, outcome, reason = null) {
    const result = freeze({schema_version: 1, mode, outcome, reason, observed_at: current(), evidence,
      external_mutations: false, production_adapter_bound: false, mutations_permitted: false,
      next_gate: outcome === 'ROLLBACK_FULL_SMOKE_VERIFIED' ? 'RECORD_VERIFIED_ROLLBACK_AND_REPORT_RELEASE_FAILURE' : outcome === 'URGENT_HUMAN_ATTENTION' ? 'HUMAN_RECONCILIATION_REQUIRED_NO_FURTHER_DEPLOY_INTENT' : 'OBSERVE_NEXT_BOUNDED_ROLLBACK_ROUND'});
    rollbackStates.set(result, true);
    return result;
  }
  /**
   * The prior manifest is taken ONLY from the exact hash-bound, previously
   * successful smoke report. The failed target's article pair is never reused.
   * version/deploymentReadAt are fresh independent runtime readbacks after the
   * fenced dispatcher completes rollback. There is no mutation in this API.
   */
  function startRollback({failedSmoke, deployment: rawDeployment, deploymentReadAt, version: rawVersion, knownGoodReport: rawReport}) {
    gate();
    need(states.has(failedSmoke) && !retired.has(failedSmoke) && failedSmoke.plan.intents.length === 1 && failedSmoke.plan.intents[0].kind === 'ROLLBACK_KNOWN_GOOD', 'A current failed-smoke rollback intent is required');
    const deployment = copy(rawDeployment), version = copy(rawVersion), report = copy(rawReport), now = current();
    const known = failedSmoke.evidence.evidence.known_good;
    record(deployment, ['id', 'version_id', 'target_sha', 'status', 'completed_at', 'persisted_completed_at'], 'actual rollback deployment');
    need(typeof deployment.id === 'string' && deployment.id.length > 0 && deployment.id !== failedSmoke.evidence.evidence.deployment.id, 'Distinct actual rollback deployment id required');
    need(deployment.version_id === known.version_id && deployment.target_sha === known.commit_sha, 'Rollback deployment differs from preverified prior version');
    record(version, ['complete', 'version_id', 'commit_sha', 'source_commit_sha', 'read_at'], 'rollback version readback');
    need(version.complete === true && version.version_id === known.version_id && version.commit_sha === known.commit_sha && version.source_commit_sha === known.commit_sha, 'Rollback version/source readback incomplete or changed');
    for (const readAt of [deploymentReadAt, version.read_at]) need(timestamp(readAt) <= timestamp(now) && timestamp(now) - timestamp(readAt) <= 60_000, 'Fresh rollback deployment and version readback required');
    record(report, ['content', 'sha256'], 'known-good smoke report');
    need(typeof report.content === 'string' && report.sha256 === known.smoke_sha256 && sha256(report.content) === known.smoke_sha256, 'Prior smoke report bytes/hash do not match preverified known-good version');
    let prior;
    try { prior = JSON.parse(report.content); } catch { throw new ReleaseRuntimeError('Known-good smoke report is not JSON'); }
    json(prior);
    need(prior.mode === mode, 'Prior smoke report provenance mismatch');
    const priorPlan = planSmoke(prior, prior.observed_at);
    need(priorPlan.outcome === 'STABLE_FULL_SMOKE_VERIFIED' && prior.evidence.deployment.version_id === known.version_id && prior.evidence.deployment.target_sha === known.commit_sha && prior.observed_at === known.verified_at, 'Prior smoke report does not verify exact known-good version/time');
    const evidence = {repository: REPOSITORY, failed_deployment_id: failedSmoke.evidence.evidence.deployment.id, known_good: copy(known),
      deployment, deployment_read_at: deploymentReadAt, version, routes: copy(prior.evidence.routes), core_manifest: copy(prior.evidence.core_manifest), full_rounds: []};
    if (deployment.status !== 'succeeded') return rollbackResult(evidence, 'URGENT_HUMAN_ATTENTION', 'ROLLBACK_COMPLETION_UNVERIFIED');
    need(deployment.persisted_completed_at === deployment.completed_at, 'Rollback must preserve actual completion time');
    need(timestamp(deployment.completed_at) >= timestamp(failedSmoke.plan.observed_at) && timestamp(deployment.completed_at) <= timestamp(deploymentReadAt), 'Rollback completion must follow failure and precede confirmed readback');
    return rollbackResult(evidence, 'ROLLBACK_AWAITING_THREE_FULL_SMOKE_ROUNDS');
  }
  async function observeRollback(state) {
    gate();
    need(rollbackStates.has(state) && !retired.has(state), 'Current runtime rollback state required');
    need(!busy.has(state), 'Rollback observation already in progress');
    if (['URGENT_HUMAN_ATTENTION', 'ROLLBACK_FULL_SMOKE_VERIFIED'].includes(state.outcome)) return state;
    busy.add(state);
    try {
      const evidence = copy(state.evidence), now = current();
      if (timestamp(now) - timestamp(evidence.deployment.completed_at) >= 180_000) {
        retired.add(state);
        return rollbackResult(evidence, 'URGENT_HUMAN_ATTENTION', 'ROLLBACK_VERIFICATION_WINDOW_EXPIRED');
      }
      need(evidence.full_rounds.length < 3, 'Rollback full-round bound exceeded');
      const token = nextToken([]), paths = [...CORE_SMOKE_PATHS, evidence.routes.en, evidence.routes['zh-cn'], 'https://www.fichil.com/'];
      let observation;
      try { observation = await batch(paths, token); }
      catch (error) {
        if (!(error instanceof ReleaseRuntimeError)) throw error;
        retired.add(state);
        return rollbackResult(evidence, 'URGENT_HUMAN_ATTENTION', 'ROLLBACK_HTTP_EVIDENCE_UNCERTAIN');
      }
      const responses = observation.responses, version = responses[CORE_SMOKE_PATHS.indexOf('/version.json')], www = responses.at(-1);
      const round = {at: observation.at, query_token: token, cache_control: 'no-cache', pragma: 'no-cache',
        core_status: Object.fromEntries(CORE_SMOKE_PATHS.map((p, i) => [p, responses[i].status])),
        article_status: {[evidence.routes.en]: responses[9].status, [evidence.routes['zh-cn']]: responses[10].status},
        commit_sha: observedCommit(version), version_status: version.status, www_status: www.status, www_location: canonicalRedirect(www)};
      need(timestamp(round.at) >= timestamp(evidence.deployment.completed_at) && (!evidence.full_rounds.length || timestamp(round.at) >= timestamp(evidence.full_rounds.at(-1).at)), 'Rollback observation predates completion or prior round');
      evidence.full_rounds.push(round);
      retired.add(state);
      if (timestamp(round.at) - timestamp(evidence.deployment.completed_at) > 180_000 || round.commit_sha !== evidence.known_good.commit_sha || round.version_status !== 200 || ![301, 308].includes(round.www_status) || round.www_location !== ORIGIN + '/' || [...Object.values(round.core_status), ...Object.values(round.article_status)].some(s => s !== 200)) {
        return rollbackResult(evidence, 'URGENT_HUMAN_ATTENTION', 'ROLLBACK_FULL_SMOKE_FAILED');
      }
      return rollbackResult(evidence, evidence.full_rounds.length === 3 ? 'ROLLBACK_FULL_SMOKE_VERIFIED' : 'ROLLBACK_AWAITING_THREE_FULL_SMOKE_ROUNDS');
    } finally { busy.delete(state); }
  }
  return Object.freeze({enabled, mode, external_mutations: false, production_adapter_bound: false, prepareRelease, startSmoke, resumeSmoke, advanceSmoke, startRollback, observeRollback});
}
