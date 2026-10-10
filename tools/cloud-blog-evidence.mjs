/**
 * Default-disabled, read/verification-only evidence ports. No provider binding,
 * network client, shell, credential, mutation adapter or automatic enablement.
 *
 * The runtime, never repository prose or a request JSON object, supplies these
 * callbacks. A callback must perform the named read/registered-skill operation.
 * Invocation, byte binding and freshness are checked here; semantic accuracy,
 * actual screenshot inspection and authenticated owner identity remain the
 * runtime's trust boundary. TRUSTED_ADAPTER is not cryptographic certification.
 * In particular, verifyOwnerApproval must authenticate the account and interpret
 * an explicit exact-head approval using authoritative message context; this
 * module does not infer authorization from text, a PR marker or a boolean flag.
 *
 * Every callback returns {mode, complete, observed_at, invocation_id, result}.
 * Source/history bodies and owner-message text stay inside the reader. Receipts
 * contain only bounded identifiers, digests, candidate decisions and plans.
 * Receipts are process-local attestations, not publication capabilities. They
 * cannot survive JSON serialization; a restart requires all reads/verifiers anew.
 * Existing execution-plan validators remain the only article/QA/merge validators.
 *
 * This is a short evidence-collection interface (30 s per callback, 60 s total),
 * not a full QA generator. The runtime must finish the registered full QA run,
 * including screenshot inspection, separately, then freshly collect all gate
 * inputs. readQaEvidence must actually re-read the pinned packet and verify its
 * integrity with the registered skill; it returns the original execution time,
 * never a relabeled new execution. Receipt lifetime is additionally capped by
 * the original gate snapshot timestamp, even if later callbacks are fresh.
 */
import {REPOSITORY, sha256, articleContentHash, planArticleCommit, planMerge} from './cloud-blog-execution-plan.mjs';

export class EvidenceGateError extends Error {}
const SHA = /^[a-f0-9]{40}$/, HASH = /^[a-f0-9]{64}$/, ID = /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/;
const MAX_AGE = 60_000, MAX_BYTES = 2 * 1024 * 1024, MAX_NODES = 50_000;
const PORTS = ['readSources', 'readHistory', 'semanticReview', 'readCurrentHead', 'readOwnerMessage', 'verifyOwnerApproval', 'readQaEvidence', 'verifyReview'];
const need = (condition, code) => { if (!condition) throw new EvidenceGateError(code); };
const exact = (v, keys, code = 'EVIDENCE_SCHEMA') => need(v && !Array.isArray(v) && Object.keys(v).sort().join('\0') === [...keys].sort().join('\0'), code);
const same = (a, b) => canonical(a) === canonical(b);
const canonical = value => JSON.stringify(value, (_, v) => v && !Array.isArray(v) && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
const digest = value => sha256(canonical(value));
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };

// Clone only data descriptors. No getters, toJSON methods, functions, symbols,
// exotic objects, cycles or unbounded payloads are evaluated as evidence.
function snapshot(value) {
  let nodes = 0, bytes = 0; const parents = new Set();
  function copy(v, depth = 0) {
    need(++nodes <= MAX_NODES && depth <= 24, 'EVIDENCE_LIMIT');
    if (v === null || typeof v === 'boolean') return v;
    if (typeof v === 'string') { bytes += Buffer.byteLength(v); need(bytes <= MAX_BYTES, 'EVIDENCE_LIMIT'); return v; }
    if (typeof v === 'number') { need(Number.isFinite(v), 'EVIDENCE_NOT_JSON'); return v; }
    need(v && typeof v === 'object' && !parents.has(v), 'EVIDENCE_NOT_JSON');
    const array = Array.isArray(v);
    need(array || Object.getPrototypeOf(v) === Object.prototype, 'EVIDENCE_NOT_JSON');
    need(Object.getOwnPropertySymbols(v).length === 0, 'EVIDENCE_NOT_JSON');
    const descriptors = Object.getOwnPropertyDescriptors(v), out = array ? [] : {};
    if (array) need(v.length <= 10000 && Object.keys(descriptors).length === v.length + 1, 'EVIDENCE_NOT_JSON');
    parents.add(v);
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (array && key === 'length') continue;
      need(descriptor.enumerable && 'value' in descriptor && key !== '__proto__', 'EVIDENCE_NOT_JSON');
      if (array) need(key === String(out.length), 'EVIDENCE_NOT_JSON');
      bytes += Buffer.byteLength(key); need(bytes <= MAX_BYTES, 'EVIDENCE_LIMIT');
      Object.defineProperty(out, key, {value: copy(descriptor.value, depth + 1), enumerable: true, writable: true, configurable: true});
    }
    parents.delete(v); return out;
  }
  return freeze(copy(value));
}
function timestamp(value) {
  need(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value), 'EVIDENCE_TIME');
  const n = Date.parse(value);
  need(Number.isFinite(n) && new Date(n).toISOString().replace('.000Z', 'Z') === value.replace('.000Z', 'Z'), 'EVIDENCE_TIME');
  return n;
}
function date(value) { need(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value, 'EVIDENCE_WINDOW'); }
function validWindow(value) {
  exact(value, ['start', 'end'], 'EVIDENCE_WINDOW'); date(value.start); date(value.end);
  need(Date.parse(value.end) - Date.parse(value.start) === 29 * 86400_000, 'EVIDENCE_WINDOW');
}
function validRefs(value) { need(SHA.test(value.main_sha || '') && SHA.test(value.head_sha || ''), 'EVIDENCE_REFS'); }
function id(value) { need(typeof value === 'string' && ID.test(value), 'EVIDENCE_ID'); }

export function createEvidenceReader(ports = {}, options = {}) {
  // Capabilities are not data, but their container must not execute accessors.
  need(ports && Object.getPrototypeOf(ports) === Object.prototype && Object.getOwnPropertySymbols(ports).length === 0, 'EVIDENCE_PORTS');
  const callbacks = {};
  for (const [name, d] of Object.entries(Object.getOwnPropertyDescriptors(ports))) {
    need(PORTS.includes(name) && d.enumerable && 'value' in d && typeof d.value === 'function', 'EVIDENCE_PORTS'); callbacks[name] = d.value;
  }
  const {enabled = false, evidenceMode = 'MOCK', now = () => new Date().toISOString(), timeoutMs = 30_000} = options;
  need(Object.keys(options).every(k => ['enabled', 'evidenceMode', 'now', 'timeoutMs'].includes(k)), 'EVIDENCE_OPTIONS');
  need(typeof enabled === 'boolean' && ['MOCK', 'TRUSTED_ADAPTER'].includes(evidenceMode) && typeof now === 'function', 'EVIDENCE_OPTIONS');
  need(Number.isInteger(timeoutMs) && timeoutMs >= 1 && timeoutMs <= 30_000, 'EVIDENCE_OPTIONS');
  const issued = new WeakMap();
  const clock = () => timestamp(now());
  const active = () => need(enabled, 'EVIDENCE_DISABLED');
  function fresh(at, end = clock()) { need(end >= timestamp(at) && end - timestamp(at) <= MAX_AGE, 'EVIDENCE_STALE'); }
  function start() { active(); return clock(); }
  function bounded(started) { const end = clock(); need(end >= started && end - started <= MAX_AGE, 'EVIDENCE_STALE'); return new Date(end).toISOString(); }
  async function invoke(name, args) {
    need(typeof callbacks[name] === 'function', 'EVIDENCE_PORT_MISSING');
    const began = clock(), request = snapshot(args); let timer;
    try {
      const output = await Promise.race([
        Promise.resolve().then(() => callbacks[name](request)).catch(() => { throw new EvidenceGateError('EVIDENCE_PORT_FAILED'); }),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new EvidenceGateError('EVIDENCE_PORT_TIMEOUT')), timeoutMs); }),
      ]);
      const value = snapshot(output);
      exact(value, ['mode', 'complete', 'observed_at', 'invocation_id', 'result']);
      need(value.mode === evidenceMode && value.complete === true, 'EVIDENCE_UNVERIFIED'); id(value.invocation_id);
      fresh(value.observed_at); need(timestamp(value.observed_at) >= began, 'EVIDENCE_CACHED_CALLBACK');
      return value;
    } catch (error) {
      // Provider errors may contain private source text, URLs or credentials.
      if (error instanceof EvidenceGateError) throw error;
      throw new EvidenceGateError('EVIDENCE_PORT_FAILED');
    } finally { clearTimeout(timer); }
  }
  function receipt(kind, binding, result, privateValue, started) {
    const observed_at = bounded(started);
    const value = snapshot({schema_version: 1, kind, evidence_mode: evidenceMode, status: 'EVIDENCE_ONLY', external_mutations: false,
      observed_at, binding, result});
    issued.set(value, {binding: value.binding, privateValue}); return value;
  }
  function assertCurrent(value, expectedBinding) {
    active(); const saved = issued.get(value); need(saved, 'EVIDENCE_FOREIGN_RECEIPT');
    fresh(value.observed_at); if (saved.binding.gate_observed_at) fresh(saved.binding.gate_observed_at);
    need(same(saved.binding, snapshot(expectedBinding)), 'EVIDENCE_BINDING_CHANGED'); return value;
  }
  async function head(binding) {
    const read = await invoke('readCurrentHead', {repository: REPOSITORY});
    exact(read.result, ['repository', 'main_sha', 'head_sha']); validRefs(read.result);
    need(read.result.repository === REPOSITORY && read.result.main_sha === binding.main_sha && read.result.head_sha === binding.head_sha, 'EVIDENCE_HEAD_CHANGED');
    return read;
  }
  function sourceRequest(value) {
    const request = snapshot(value); exact(request, ['run_id', 'window', 'main_sha', 'head_sha']); id(request.run_id); validWindow(request.window); validRefs(request);
    const yesterday = new Date(clock() + 8 * 3600_000 - 86400_000).toISOString().slice(0, 10);
    need(request.window.end === yesterday, 'EVIDENCE_STALE_WINDOW');
    return snapshot({repository: REPOSITORY, ...request});
  }
  async function sources(binding) {
    const read = await invoke('readSources', binding), value = read.result;
    exact(value, ['window', 'families', 'records']); need(same(value.window, binding.window), 'EVIDENCE_WINDOW_CHANGED');
    need(Array.isArray(value.families) && same([...value.families].sort(), ['cloud_work', 'github']), 'EVIDENCE_SOURCE_FAMILIES');
    need(Array.isArray(value.records), 'EVIDENCE_SOURCE_RECORDS'); const identities = new Set();
    for (const row of value.records) {
      exact(row, ['source_id', 'topic_id', 'family', 'completed_at', 'content', 'sha256']); id(row.source_id); id(row.topic_id);
      const key = `${row.source_id}\0${row.topic_id}`; need(!identities.has(key), 'EVIDENCE_SOURCE_DUPLICATE'); identities.add(key);
      need(['cloud_work', 'github'].includes(row.family), 'EVIDENCE_SOURCE_FAMILIES');
      const day = new Date(timestamp(row.completed_at) + 8 * 3600_000).toISOString().slice(0, 10);
      need(day >= binding.window.start && day <= binding.window.end, 'EVIDENCE_SOURCE_OUTSIDE_WINDOW');
      need(typeof row.content === 'string' && HASH.test(row.sha256) && sha256(row.content) === row.sha256, 'EVIDENCE_SOURCE_BYTES_CHANGED');
    }
    return value;
  }
  async function history(binding) {
    const read = await invoke('readHistory', binding), value = read.result;
    exact(value, ['main_sha', 'head_sha', 'records']);
    need(value.main_sha === binding.main_sha && value.head_sha === binding.head_sha && Array.isArray(value.records), 'EVIDENCE_HISTORY_INCOMPLETE');
    return value;
  }
  async function semantic(binding, source, articleHistory, phase, selected = null) {
    const read = await invoke('semanticReview', {binding, sources: source, history: articleHistory, phase, selected}), value = read.result;
    exact(value, ['binding', 'candidates']); need(same(value.binding, binding), 'EVIDENCE_SEMANTIC_BINDING');
    need(Array.isArray(value.candidates), 'EVIDENCE_SEMANTIC_INCOMPLETE');
    const candidates = new Map(source.records.map(row => [`${row.source_id}\0${row.topic_id}`, row])), seen = new Set();
    for (const candidate of value.candidates) {
      exact(candidate, ['source_id', 'topic_id', 'completed_at', 'completed', 'evidence_complete', 'public_safe', 'reusable', 'dedup_passed', 'scores']);
      const key = `${candidate.source_id}\0${candidate.topic_id}`, original = candidates.get(key);
      need(original && !seen.has(key) && candidate.completed_at === original.completed_at, 'EVIDENCE_CANDIDATE_CHANGED'); seen.add(key);
      for (const key of ['completed', 'evidence_complete', 'public_safe', 'reusable', 'dedup_passed']) need(typeof candidate[key] === 'boolean', 'EVIDENCE_SEMANTIC_INCOMPLETE');
      // Boundary shape prevents arbitrary private text escaping in a score.
      // Existing Python rank_candidates still owns score caps/ranking/filters.
      need(Array.isArray(candidate.scores) && candidate.scores.length === 5 && candidate.scores.every(Number.isSafeInteger), 'EVIDENCE_SEMANTIC_INCOMPLETE');
    }
    if (selected) need(value.candidates.length === 1 && same(value.candidates[0], selected), 'EVIDENCE_SELECTION_CHANGED');
    else need(seen.size === candidates.size, 'EVIDENCE_SEMANTIC_INCOMPLETE');
    return value.candidates;
  }
  async function collectSources(input) {
    const started = start(), request = sourceRequest(input); await head(request);
    const source = await sources(request), articleHistory = await history(request);
    const binding = snapshot({...request, source_sha256: digest(source), history_sha256: digest(articleHistory)});
    const candidates = await semantic(binding, source, articleHistory, 'before_scoring');
    need(digest(await sources(request)) === binding.source_sha256, 'EVIDENCE_SOURCE_CHANGED');
    need(digest(await history(request)) === binding.history_sha256, 'EVIDENCE_HISTORY_CHANGED'); await head(request);
    return receipt('SOURCE_REVIEW', binding, {candidates, phase: 'before_scoring'}, null, started);
  }
  async function beforeWriting(value, identity) {
    const started = start(); assertCurrent(value, value?.binding); need(value.kind === 'SOURCE_REVIEW', 'EVIDENCE_RECEIPT_KIND');
    const key = snapshot(identity); exact(key, ['source_id', 'topic_id']);
    const selected = value.result.candidates.find(c => c.source_id === key.source_id && c.topic_id === key.topic_id);
    need(selected, 'EVIDENCE_SELECTION_UNKNOWN'); const binding = value.binding; await head(binding);
    const source = await sources(binding), articleHistory = await history(binding);
    need(digest(source) === binding.source_sha256 && digest(articleHistory) === binding.history_sha256, 'EVIDENCE_SOURCE_OR_HISTORY_CHANGED');
    const candidates = await semantic(binding, source, articleHistory, 'before_writing', selected);
    need(digest(await sources(binding)) === binding.source_sha256, 'EVIDENCE_SOURCE_CHANGED');
    need(digest(await history(binding)) === binding.history_sha256, 'EVIDENCE_HISTORY_CHANGED'); await head(binding);
    return receipt('PREWRITE_SOURCE_REVIEW', binding, {candidates, phase: 'before_writing'}, null, started);
  }
  function planRequest(input, merge) {
    const value = snapshot(input); exact(value, ['schema_version', 'mode', 'run_id', 'observed_at', 'evidence']);
    need(value.schema_version === 1 && value.mode === evidenceMode && value.evidence.repository === REPOSITORY, 'EVIDENCE_PLAN_PROVENANCE');
    id(value.run_id); fresh(value.observed_at);
    const refs = {main_sha: value.evidence.main_sha, head_sha: merge ? value.evidence.pr?.head_sha : value.evidence.branch_head_sha}; validRefs(refs);
    return {value, refs};
  }
  function qaBinding(value, refs) {
    return snapshot({repository: REPOSITORY, run_id: value.run_id, ...refs, byte_bundle_sha256: articleContentHash(value.evidence.files),
      gate_observed_at: value.observed_at, gate_snapshot_sha256: digest(value.evidence)});
  }
  async function verifiedQa(value, binding) {
    const read = await invoke('readQaEvidence', {binding, files: value.evidence.files});
    exact(read.result, ['binding', 'qa', 'integrity_verified']);
    need(same(read.result.binding, binding) && read.result.integrity_verified === true, 'EVIDENCE_QA_UNVERIFIED');
    need(timestamp(read.result.qa?.execution?.completed_at) <= timestamp(read.observed_at), 'EVIDENCE_QA_FUTURE');
    return read.result.qa;
  }
  function validatedPlan(fn, value) {
    try { return fn(value, new Date(clock()).toISOString()); }
    catch { throw new EvidenceGateError('EVIDENCE_PLAN_REJECTED'); }
  }
  async function collectQa(input) {
    const started = start(), {value, refs} = planRequest(input, false), binding = qaBinding(value, refs); await head(binding);
    const qa = await verifiedQa(value, binding); await head(binding); fresh(value.observed_at);
    const normalized = snapshot({...value, observed_at: bounded(started), evidence: {...value.evidence, qa}});
    const plan = validatedPlan(planArticleCommit, normalized);
    return receipt('FULL_QA', {...binding, content_sha256: qa.content_sha256, assets_sha256: qa.assets_sha256, qa_report_sha256: qa.qa_report_sha256, report_bytes_sha256: qa.report.sha256}, {plan}, null, started);
  }
  async function ownerMessage(messageId, binding) {
    const read = await invoke('readOwnerMessage', {message_id: messageId, binding}), message = read.result;
    exact(message, ['message_id', 'user_id', 'sent_at', 'text', 'revision', 'revoked']);
    need(message.message_id === messageId && message.revoked === false && typeof message.text === 'string', 'EVIDENCE_MESSAGE_UNAVAILABLE');
    id(message.user_id); id(message.revision); need(timestamp(message.sent_at) <= clock(), 'EVIDENCE_MESSAGE_FUTURE');
    return message;
  }
  async function collectApproval(input, reference) {
    const started = start(), {value, refs} = planRequest(input, true), initial = qaBinding(value, refs);
    const ref = snapshot(reference); exact(ref, ['message_id']); id(ref.message_id);
    await head(initial);
    // Reverify the pinned prior QA packet; do not re-run full QA after approval
    // and thereby make an otherwise valid approval predate its own QA report.
    const qa = await verifiedQa(value, initial);
    const binding = snapshot({...initial, content_sha256: qa.content_sha256, assets_sha256: qa.assets_sha256,
      qa_report_sha256: qa.qa_report_sha256, report_bytes_sha256: qa.report.sha256});
    const message = await ownerMessage(ref.message_id, binding), message_sha256 = digest(message);
    const verification = await invoke('verifyOwnerApproval', {binding, message, message_sha256});
    exact(verification.result, ['binding', 'message_sha256', 'authenticated_owner', 'explicit_approval', 'authorized_intents', 'approval']);
    need(same(verification.result.binding, binding) && verification.result.message_sha256 === message_sha256 && verification.result.authenticated_owner === true && verification.result.explicit_approval === true, 'EVIDENCE_APPROVAL_UNVERIFIED');
    const permitted = verification.result.authorized_intents;
    need(Array.isArray(permitted) && new Set(permitted).size === permitted.length && permitted.every(kind => ['MARK_READY_FOR_REVIEW', 'NORMAL_SERVER_PROTECTED_MERGE'].includes(kind)), 'EVIDENCE_APPROVAL_SCOPE');
    const approval = verification.result.approval;
    need(approval?.message_id === message.message_id && approval.user_id === message.user_id && approval.granted_at === message.sent_at, 'EVIDENCE_APPROVAL_MESSAGE_CHANGED');
    const reviewRead = await head(binding);
    const reviewStarted = clock(), reviewed = await invoke('verifyReview', {binding, qa, approval, current_head_read_at: reviewRead.observed_at});
    exact(reviewed.result, ['binding', 'verify_review']); need(same(reviewed.result.binding, binding), 'EVIDENCE_REVIEW_BINDING');
    id(reviewed.result.verify_review?.execution?.invocation_id);
    const completed = timestamp(reviewed.result.verify_review?.execution?.completed_at);
    need(completed >= reviewStarted && completed <= timestamp(reviewed.observed_at), 'EVIDENCE_REVIEW_CACHED');
    need(digest(await ownerMessage(ref.message_id, binding)) === message_sha256, 'EVIDENCE_MESSAGE_CHANGED'); await head(binding);
    fresh(value.observed_at);
    const normalized = snapshot({...value, observed_at: bounded(started), evidence: {...value.evidence, qa, approval,
      verify_review: reviewed.result.verify_review, pr: {...value.evidence.pr, read_at: reviewRead.observed_at}}});
    const plan = validatedPlan(planMerge, normalized);
    return receipt('EXACT_HEAD_APPROVAL', {...binding, message_sha256}, {plan, approval, verify_review: reviewed.result.verify_review}, {permitted}, started);
  }
  /** Dispatcher bridge, for this reader's exact freshly prepared merge/Ready
   * plan only. A runtime must recollectApproval during each prepare invocation
   * and retain that new receipt for authorize. Content approval alone cannot
   * authorize an operation: verifyOwnerApproval must also establish explicit or
   * valid standing authority for each returned authorized_intents member.
   * This bridge never authorizes content creation, release, deploy or rollback.
   * The dispatcher must enforce expires_at after its final asynchronous fence
   * read. A fresh plan timestamp cannot extend the inherited gate's lifetime.
   */
  function authorize(value, operation) {
    assertCurrent(value, value?.binding);
    need(evidenceMode === 'TRUSTED_ADAPTER' && value.kind === 'EXACT_HEAD_APPROVAL', 'EVIDENCE_NOT_AUTHORITY');
    const op = snapshot(operation); exact(op, ['operation_id', 'kind', 'target_sha', 'intent', 'plan_sha256', 'observed_at']);
    const plan = value.result.plan; need(plan.intents.length === 1, 'EVIDENCE_OPERATION_SCOPE');
    fresh(op.observed_at); need(op.observed_at === plan.observed_at, 'EVIDENCE_OPERATION_CHANGED');
    const intent = plan.intents[0], kind = {MARK_READY_FOR_REVIEW: 'pr_ready', NORMAL_SERVER_PROTECTED_MERGE: 'merge'}[intent.kind];
    need(kind && issued.get(value).privateValue.permitted.includes(intent.kind), 'EVIDENCE_OPERATION_NOT_APPROVED');
    const plan_sha256 = sha256(JSON.stringify({run_id: plan.run_id, phase: plan.phase, target_sha: value.binding.head_sha, intent}));
    need(op.target_sha === value.binding.head_sha && op.kind === kind && same(op.intent, intent) && op.plan_sha256 === plan_sha256 && op.operation_id === `op_${plan_sha256}`, 'EVIDENCE_OPERATION_CHANGED');
    const expires_at = new Date(Math.min(timestamp(value.observed_at), timestamp(value.binding.gate_observed_at)) + MAX_AGE).toISOString();
    return snapshot({authorized: true, operation_id: op.operation_id, target_sha: op.target_sha, plan_sha256, expires_at});
  }
  return Object.freeze({collectSources, beforeWriting, collectQa, collectApproval, assertCurrent, authorize});
}
