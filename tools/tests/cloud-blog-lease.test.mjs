import test from 'node:test';
import assert from 'node:assert/strict';
import {createLeaseController,transition,ISOLATED_CAS_REF,PRODUCTION_STATE_REF} from '../cloud-blog-lease.mjs';
const A='a'.repeat(40),B='b'.repeat(40),T='c'.repeat(40),NOW='2026-10-09T01:10:00Z';
const idle=()=>({schema:1,epoch:0,status:'idle',owner:null,until:null,pending:null});
const acquire={action:'acquire',owner:'worker-1',ttl_seconds:60};
const owned=()=>transition(idle(),acquire,NOW);
const begin={action:'begin',owner:'worker-1',epoch:1,operation:{id:'op-1',kind:'deploy',target_sha:A}};
function mock({lost=false,reject=false,initial=idle()}={}){
 let head=A;const commits=new Map([[A,{sha:A,tree:{sha:T},message:JSON.stringify(initial)}]]),calls=[];
 const response=data=>({structuredContent:data});
 const tools={
  mcp__codex_apps__github_fetch:async({url})=>response(url.includes('/git/ref/')?{object:{sha:head}}:commits.get(url.split('/').at(-1))),
  mcp__codex_apps__github_create_commit:async args=>{calls.push(['create',args]);commits.set(B,{sha:B,tree:{sha:T},message:args.message});return response({sha:B});},
  mcp__codex_apps__github_update_ref:async args=>{calls.push(['cas',args]);if(reject)throw Error('CAS conflict');assert.equal(args.expected_sha,head);assert.equal(args.force,false);head=args.sha;if(lost)throw Error('lost response');return response({object:{sha:head}});}
 };return {tools,calls};
}
test('read-only default never creates a commit',async()=>{const m=mock();const r=await createLeaseController(m.tools).change(acquire,NOW);assert.equal(r.status,'REHEARSAL_ONLY');assert.equal(m.calls.length,0);});
test('observed GraphQL UNKNOWN shape never becomes a confirmed fence or rejection',async()=>{
 for(const applied of [false,true]){
  const m=mock(),update=m.tools.mcp__codex_apps__github_update_ref;
  m.tools.mcp__codex_apps__github_update_ref=async args=>{
   if(applied)await update(args);else m.calls.push(['cas',args]);
   return {isError:true,structuredContent:{error_code:'UNKNOWN',error:'GithubGraphQLAPIError: Something went wrong while executing your query'}};
  };
  const r=await createLeaseController(m.tools,{execute:true}).change(acquire,NOW);
  assert.equal(r.status,'CAS_OUTCOME_UNKNOWN_STOP');assert.equal(r.observed_sha,applied?B:A);assert.equal(r.owner,undefined);assert.equal(m.calls.length,2);
 }
});
test('negative, unfamiliar and contradictory acknowledgments stop despite target readback',async()=>{
 for(const ack of [{success:false},{},{success:true,object:{sha:A}}]){
  const m=mock(),update=m.tools.mcp__codex_apps__github_update_ref;
  m.tools.mcp__codex_apps__github_update_ref=async args=>{await update(args);return {structuredContent:ack};};
  const r=await createLeaseController(m.tools,{execute:true}).change(acquire,NOW);
  assert.equal(r.status,'CAS_OUTCOME_UNKNOWN_STOP');assert.equal(r.observed_sha,B);assert.equal(m.calls.length,2);
 }
});
test('CAS binds expected head and never forces',async()=>{const m=mock();const r=await createLeaseController(m.tools,{execute:true}).change(acquire,NOW);assert.equal(r.status,'CONFIRMED');assert.equal(r.epoch,1);assert.equal(m.calls.length,2);});
test('actual connector success shape confirms only after exact readback',async()=>{
 const m=mock(),update=m.tools.mcp__codex_apps__github_update_ref;
 m.tools.mcp__codex_apps__github_update_ref=async args=>{await update(args);return {isError:false,structuredContent:{success:true}};};
 const r=await createLeaseController(m.tools,{execute:true}).change(acquire,NOW);
 assert.equal(r.status,'CONFIRMED');assert.equal(r.sha,B);assert.equal(m.calls.length,2);
});
test('unknown update followed by failed readback never writes again',async()=>{
 const m=mock({lost:true}),read=m.tools.mcp__codex_apps__github_fetch;
 m.tools.mcp__codex_apps__github_fetch=async args=>{if(m.calls.some(c=>c[0]==='cas'))throw Error('read unavailable');return read(args);};
 await assert.rejects(createLeaseController(m.tools,{execute:true}).change(acquire,NOW),/read unavailable/);assert.equal(m.calls.length,2);
});
test('lost CAS response stays stopped even when target is observed',async()=>{const m=mock({lost:true});const r=await createLeaseController(m.tools,{execute:true}).change(acquire,NOW);assert.equal(r.status,'CAS_OUTCOME_UNKNOWN_STOP');assert.equal(r.uncertain,true);assert.equal(r.observed_sha,B);assert.equal(r.owner,undefined);assert.equal(m.calls.length,2);});
test('rejected CAS stops without retry',async()=>{const m=mock({reject:true});assert.equal((await createLeaseController(m.tools,{execute:true}).change(acquire,NOW)).status,'CAS_OUTCOME_UNKNOWN_STOP');assert.equal(m.calls.length,2);});
test('live and expired owners both block competitors',()=>{for(const now of [NOW,'2026-10-10T01:10:00Z'])assert.throws(()=>transition(owned(),{...acquire,owner:'worker-2'},now),/never steal/);});
test('old epoch cannot renew or begin',()=>{assert.throws(()=>transition(owned(),{...begin,epoch:0},NOW),/STALE_FENCE/);});
test('expiry blocks new side effects',()=>{assert.throws(()=>transition(owned(),begin,'2026-10-09T01:11:00Z'),/LEASE_EXPIRED/);});
test('journal prevents overlap and release with unknown outcome',()=>{const s=transition(owned(),begin,NOW);assert.throws(()=>transition(s,begin,NOW),/UNRESOLVED/);assert.throws(()=>transition(s,{action:'release',owner:'worker-1',epoch:1},NOW),/unresolved/);});
test('resolve requires exact operation and verified remote result',()=>{const s=transition(owned(),begin,NOW);assert.throws(()=>transition(s,{action:'resolve',owner:'worker-1',epoch:1,operation_id:'op-1'},NOW));});
test('late reconciliation then explicit release permits next epoch',()=>{let s=transition(owned(),begin,NOW);s=transition(s,{action:'resolve',owner:'worker-1',epoch:1,operation_id:'op-1',remote_result_verified:true},'2026-10-10T01:10:00Z');s=transition(s,{action:'release',owner:'worker-1',epoch:1},'2026-10-10T01:10:00Z');s=transition(s,{...acquire,owner:'worker-2'},'2026-10-10T01:10:00Z');assert.equal(s.epoch,2);});
test('assertOperation refuses stale fence',async()=>{const m=mock();await assert.rejects(createLeaseController(m.tools).assertOperation({sha:B,owner:'worker-1',epoch:1},'op-1',NOW),/STALE_FENCE/);});

test('private extra operation fields never reach public create_commit',async()=>{const m=mock({initial:owned()});await assert.rejects(createLeaseController(m.tools,{execute:true}).change({...begin,operation:{...begin.operation,private_evidence:'must-not-publish'}},NOW),/Unexpected operation fields/);assert.equal(m.calls.length,0);});
test('unexpected state fields fail closed before public writes',async()=>{const m=mock({initial:{...idle(),private_evidence:'must-not-publish'}});await assert.rejects(createLeaseController(m.tools,{execute:true}).change(acquire,NOW),/Unexpected state fields/);assert.equal(m.calls.length,0);});
test('isolated binding reads and writes only the named test ref',async()=>{const m=mock(),urls=[];const read=m.tools.mcp__codex_apps__github_fetch;m.tools.mcp__codex_apps__github_fetch=async args=>{urls.push(args.url);return read(args);};await createLeaseController(m.tools,{stateRef:ISOLATED_CAS_REF,execute:true}).change(acquire,NOW);assert.ok(urls.filter(u=>u.includes('/git/ref/')).every(u=>u.endsWith('/'+ISOLATED_CAS_REF)));assert.equal(m.calls.find(c=>c[0]==='cas')[1].branch_name,ISOLATED_CAS_REF);});
test('test binding alone never enables mutation',async()=>{const m=mock();assert.equal((await createLeaseController(m.tools,{stateRef:ISOLATED_CAS_REF}).change(acquire,NOW)).status,'REHEARSAL_ONLY');assert.equal(m.calls.length,0);});
test('production default remains explicit and unchanged',async()=>{const m=mock();await createLeaseController(m.tools,{execute:true}).change(acquire,NOW);assert.equal(m.calls.find(c=>c[0]==='cas')[1].branch_name,PRODUCTION_STATE_REF);});
test('arbitrary branch override and nonboolean execution fail before any tool call',()=>{for(const options of [{stateRef:'main'},{stateRef:'chatgpt'},{stateRef:'refs/heads/'+ISOLATED_CAS_REF},{stateRef:'automation/other'},{execute:'false'},{execute:1},{branch_name:ISOLATED_CAS_REF}]){const m=mock();assert.throws(()=>createLeaseController(m.tools,options));assert.equal(m.calls.length,0);}});
