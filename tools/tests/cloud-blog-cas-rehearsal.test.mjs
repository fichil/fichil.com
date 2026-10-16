import test from 'node:test';
import assert from 'node:assert/strict';
import {createCasRehearsal} from '../cloud-blog-cas-rehearsal.mjs';
import {ISOLATED_CAS_REF, transition} from '../cloud-blog-lease.mjs';

const BASE='a'.repeat(40), TREE='b'.repeat(40), OTHER='c'.repeat(40);
const NOW='2026-10-16T02:00:00Z', REF=`refs/heads/${ISOLATED_CAS_REF}`;
const API='https://api.github.com/repos/fichil/fichil.com';
const input=()=>({base_sha:BASE,tree_sha:TREE,now:NOW});
const idle=()=>({schema:1,epoch:0,status:'idle',owner:null,until:null,pending:null});
const response=data=>({structuredContent:structuredClone(data)});
const absent=()=>({isError:true,structuredContent:{error_code:'NOT_FOUND',error_data:{status:'404'}}});
const reference=sha=>({ref:REF,object:{type:'commit',sha}});
const copy=structuredClone;

/** Entire fixture is local. Its synthetic no-update receipt is NOT a claimed
 * GitHub error schema or proof of the current connector's rejection semantics.
 * Only this trusted synthetic verifier can recognize its in-memory receipts.
 */
function fixture(hooks={}){
 const state={head:null,calls:[],commits:new Map([[BASE,{sha:BASE,tree:{sha:TREE},parents:[],message:'baseline'}]]),next:1,updates:0};
 const rejections=new WeakMap();
 const reject=request=>{const r={isError:true,structuredContent:{synthetic_test_fixture:'rejected_without_update'}};rejections.set(r,copy(request));return r;};
 const mutate=()=>state.calls.filter(c=>c.name!=='fetch');
 const tools={
  async mcp__codex_apps__github_fetch(args){
   state.calls.push({name:'fetch',args:copy(args)});
   const override=await hooks.fetch?.(args,state);if(override!==undefined)return override;
   if(args.url===`${API}/git/ref/heads/${ISOLATED_CAS_REF}`)return state.head===null?absent():response(reference(state.head));
   assert.match(args.url,new RegExp(`^${API}/git/commits/[a-f0-9]{40}$`));
   return response(state.commits.get(args.url.split('/').at(-1)));
  },
  async mcp__codex_apps__github_create_commit(args){
   state.calls.push({name:'create_commit',args:copy(args)});
   const sha=(state.next++).toString(16).padStart(40,'0');
   state.commits.set(sha,{sha,tree:{sha:args.tree_sha},parents:[{sha:args.parent_sha}],message:args.message});
   const override=await hooks.commit?.(args,state,sha);return override??response({sha});
  },
  async mcp__codex_apps__github_create_branch(args){
   state.calls.push({name:'create_branch',args:copy(args)});
   const override=await hooks.branch?.(args,state);if(override!==undefined)return override;
   assert.equal(state.head,null);state.head=args.sha;return response({success:true});
  },
  async mcp__codex_apps__github_update_ref(args){
   state.calls.push({name:'update_ref',args:copy(args)});state.updates++;
   const override=await hooks.update?.(args,state,reject);if(override!==undefined)return override;
   if(args.expected_sha!==state.head)return reject(args);
   state.head=args.sha;return response({success:true});
  }
 };
 const verifyCasRejection=async(raw,request)=>{
  const r=rejections.get(raw);
  if(r&&JSON.stringify(r)===JSON.stringify(request))return {status:'NO_UPDATE_CONFIRMED',...r};
  return null;
 };
 return {state,tools,mutate,verifyCasRejection,reject};
}
const enabled=f=>createCasRehearsal(f.tools,{execute:true,verifyCasRejection:f.verifyCasRejection});

test('default is disabled without even reading, validating input or resolving tools',async()=>{
 let calls=0;const tools=new Proxy({},{get(){calls++;throw Error('must not resolve');}});
 assert.equal((await createCasRehearsal(tools).run()).status,'DISABLED');assert.equal(calls,0);
});
test('no arbitrary ref, repository, execute coercion or extra private input',async()=>{
 for(const options of [{branch_name:'main'},{stateRef:'main'},{repository:'other/repo'},{execute:1},{execute:'true'},Object.create({execute:true}),Object.create(null)])assert.throws(()=>createCasRehearsal({},options));
 const f=fixture();await assert.rejects(enabled(f).run({...input(),private_prose:'private test prose'}));assert.equal(f.state.calls.length,0);
});
test('malformed primitive input is rejected without tool calls or private exception text',async()=>{
 for(const key of ['base_sha','tree_sha','now']){
  const f=fixture(),request={...input(),[key]:()=> 'PRIVATE_INPUT_SENTINEL'};
  await assert.rejects(enabled(f).run(request),error=>error.message==='EXACT_BASE_TREE_AND_TIME_REQUIRED'&&!String(error).includes('PRIVATE_INPUT_SENTINEL'));
  assert.equal(f.state.calls.length,0);
 }
 const f=fixture(),request=input();Object.defineProperty(request,'now',{get(){throw Error('PRIVATE_INPUT_SENTINEL');}});
 await assert.rejects(enabled(f).run(request),/EXACT_BASE_TREE_AND_TIME_REQUIRED/);assert.equal(f.state.calls.length,0);
});
test('synthetic normalized protocol fixture completes exactly four metadata-only commits',async()=>{
 const f=fixture(), r=await enabled(f).run(input());assert.equal(r.status,'CONFIRMED');
 const commits=f.mutate().filter(c=>c.name==='create_commit'), updates=f.mutate().filter(c=>c.name==='update_ref');
 assert.equal(commits.length,4);assert.equal(updates.length,3);assert.equal(f.mutate().filter(c=>c.name==='create_branch').length,1);
 assert.deepEqual(r.cas,{accepted:1,rejected:1,unknown:0,both_settled:true});
 assert.equal(r.observation_loss,'SIMULATED_CLIENT_SUCCESS_RESPONSE_DISCARD');assert.equal(r.real_network_failure_tested,false);assert.equal(r.atomic_cas_guarantee_proven,false);assert.equal(r.production_serialization_proven,false);
 assert.equal(r.fresh_instance_reconciliation,true);assert.equal(r.expiry_takeover_blocked,true);
 assert.ok(commits.every(c=>c.args.tree_sha===TREE));assert.deepEqual(commits.map(c=>Object.keys(c.args).sort()),Array(4).fill(['message','parent_sha','repository_full_name','tree_sha']));
 assert.deepEqual(commits.map(c=>JSON.parse(c.args.message).status),['idle','owned','owned','idle']);
 assert.deepEqual(commits.map(c=>c.args.parent_sha),[BASE,r.bootstrap_sha,r.bootstrap_sha,r.winner_sha]);
 assert.equal(updates[0].args.expected_sha,r.bootstrap_sha);assert.equal(updates[1].args.expected_sha,r.bootstrap_sha);
 for(const c of f.mutate()){
  assert.equal(c.args.repository_full_name,'fichil/fichil.com');
  if(c.name!=='create_commit')assert.equal(c.args.branch_name,ISOLATED_CAS_REF);
  if(c.name==='update_ref')assert.equal(c.args.force,false);
 }
 assert.equal(JSON.parse(f.state.commits.get(f.state.head).message).status,'idle');
 assert.equal((await createCasRehearsal(f.tools).inspect()).sha,r.release_sha);
});
test('a second call and concurrent duplicate cannot reuse an instance or repeat writes',async()=>{
 const f=fixture(), runner=enabled(f), pending=runner.run(input());
 assert.equal((await runner.run(input())).reason,'INSTANCE_ALREADY_USED');await pending;
 const count=f.mutate().length;assert.equal((await runner.run(input())).reason,'INSTANCE_ALREADY_USED');assert.equal(f.mutate().length,count);
});
test('fresh instance refuses an existing successful trial instead of silently restarting',async()=>{
 const f=fixture();await enabled(f).run(input());const count=f.mutate().length;
 assert.equal((await enabled(f).run(input())).reason,'INITIAL_REF_EXISTS');assert.equal(f.mutate().length,count);
});
test('valid existing ref, malformed ref, and unknown lookup are distinct and nonmutating',async()=>{
 for(const [value,status] of [[response(reference(OTHER)),'EXISTS'],[response({object:{sha:OTHER}}),'MALFORMED'],[{isError:true,structuredContent:{error_code:'FORBIDDEN'}},'UNKNOWN'],[response(null),'UNKNOWN']]){
  const f=fixture({fetch:({url})=>url.includes('/git/ref/')?value:undefined});
  assert.equal((await enabled(f).run(input())).reason,`INITIAL_REF_${status}`);assert.equal(f.mutate().length,0);
 }
});
test('not-found prose, mismatched status or wrong error code never establish absence',async()=>{
 for(const r of [{isError:true,structuredContent:{error_code:'NOT_FOUND',error_data:{status:'403'}}},{isError:true,structuredContent:{error_code:'UNKNOWN',error_data:{status:'404'}}},{isError:true,structuredContent:{message:'Not Found 404'}}]){
  const f=fixture({fetch:({url})=>url.includes('/git/ref/')?r:undefined});assert.equal((await enabled(f).run(input())).reason,'INITIAL_REF_UNKNOWN');assert.equal(f.mutate().length,0);
 }
});
test('an inaccessible or mismatched base cannot turn a 404 ref into write authorization',async()=>{
 for(const r of [absent(),response({sha:OTHER,tree:{sha:TREE},parents:[]}),response({sha:BASE,tree:{sha:OTHER},parents:[]})]){
  const f=fixture({fetch:({url})=>url.endsWith(`/git/commits/${BASE}`)?r:undefined});
  const result=await enabled(f).run(input());assert.equal(result.reason,'BASE_PREFLIGHT_UNCONFIRMED');assert.equal(f.mutate().length,0);
 }
});
test('ref appearing during bootstrap is preserved and never repointed',async()=>{
 const f=fixture({commit:(_args,state)=>{state.head=OTHER;}});
 const r=await enabled(f).run(input());assert.equal(r.reason,'PRECREATE_REF_EXISTS');assert.equal(f.mutate().length,1);assert.equal(f.state.head,OTHER);
});
test('duplicate commit SHA is rejected before contention',async()=>{
 const f=fixture({commit:(_args,state)=>state.next===3?response({sha:'1'.padStart(40,'0')}):undefined});
 const r=await enabled(f).run(input());assert.equal(r.reason,'CREATE_METADATA_COMMIT_UNCONFIRMED');assert.equal(f.state.updates,0);
});
test('invalid hash, mismatched remote hash, changed tree, parent, message or extra private fields stop',async()=>{
 const edits=[c=>{c.sha=OTHER;},c=>{c.tree.sha=OTHER;},c=>{c.parents=[{sha:OTHER}];},c=>{c.parents.push({sha:OTHER});},c=>{c.message=JSON.stringify({...idle(),private_prose:'secret should stay out'});},c=>{c.message=JSON.stringify({...idle(),epoch:99});}];
 for(const edit of edits){
  const f=fixture({commit:(_args,state,sha)=>{edit(state.commits.get(sha));}}),r=await enabled(f).run(input());
  assert.equal(r.reason,'CREATE_METADATA_COMMIT_UNCONFIRMED');assert.equal(f.mutate().length,1);assert.ok(!JSON.stringify(r).includes('secret should stay out'));
 }
 const f=fixture({commit:()=>response({sha:'invalid'})});assert.equal((await enabled(f).run(input())).reason,'CREATE_METADATA_COMMIT_UNCONFIRMED');assert.equal(f.mutate().length,1);
});
test('uncertain commit response is not retried or recovered by inventing another action ID',async()=>{
 const f=fixture({commit:()=>{throw Error('private token:do-not-echo');}}),r=await enabled(f).run(input());
 assert.equal(r.reason,'CREATE_METADATA_COMMIT_UNCONFIRMED');assert.equal(r.recovery.status,'ABSENT');assert.equal(f.mutate().length,1);assert.equal(r.retry_permitted,false);assert.ok(!JSON.stringify(r).includes('token'));
});
test('uncertain successful branch creation stops with read-only observation',async()=>{
 const f=fixture({branch:(args,state)=>{state.head=args.sha;throw Error('lost response');}}),r=await enabled(f).run(input());
 assert.equal(r.reason,'CREATE_ISOLATED_BRANCH_UNCONFIRMED');assert.equal(r.recovery.status,'OBSERVED');assert.equal(f.mutate().length,2);assert.equal(f.state.updates,0);
});
test('negative or unfamiliar branch responses stop even when readback finds the applied branch',async()=>{
 for(const result of [{success:false},{unexpected:'payload'},{success:false,...reference('1'.padStart(40,'0'))},{success:true,...reference(OTHER)},{success:true,ref:'refs/heads/main'}]){
  const f=fixture({branch:(args,state)=>{state.head=args.sha;return response(result);}}),r=await enabled(f).run(input());
  assert.equal(r.reason,'CREATE_ISOLATED_BRANCH_UNCONFIRMED');assert.equal(r.recovery.status,'OBSERVED');assert.equal(f.mutate().length,2);assert.equal(f.state.updates,0);
 }
});
test('contradictory success and ref evidence cannot count as accepted CAS',async()=>{
 const f=fixture({update:(args,state,reject)=>{if(state.updates===1){state.head=args.sha;return response({success:true,...reference(OTHER)});}return reject(args);}}),r=await enabled(f).run(input());
 assert.equal(r.reason,'EXACTLY_ONE_ACCEPTED_CAS_REQUIRED');assert.equal(r.cas.accepted,0);assert.equal(r.cas.unknown,1);assert.equal(f.state.updates,2);
});
test('both accepted contender responses fail closed even if final ref matches a candidate',async()=>{
 const f=fixture({update:(args,state)=>{state.head=args.sha;return response({success:true});}}),r=await enabled(f).run(input());
 assert.equal(r.reason,'EXACTLY_ONE_ACCEPTED_CAS_REQUIRED');assert.equal(r.cas.accepted,2);assert.equal(f.state.updates,2);assert.equal(f.mutate().filter(c=>c.name==='create_commit').length,3);
});
test('both rejected contenders fail closed without a release',async()=>{
 const f=fixture({update:(args,_state,reject)=>reject(args)}),r=await enabled(f).run(input());
 assert.equal(r.reason,'EXACTLY_ONE_ACCEPTED_CAS_REQUIRED');assert.equal(r.cas.accepted,0);assert.equal(r.cas.rejected,2);assert.equal(r.recovery.state.status,'idle');assert.equal(f.state.updates,2);
});
test('default verifier absence keeps actual generic rejection UNKNOWN and reconstructs winner read-only',async()=>{
 const f=fixture(),r=await createCasRehearsal(f.tools,{execute:true}).run(input());
 assert.equal(r.reason,'CAS_REJECTION_UNVERIFIED');assert.equal(r.cas.accepted,1);assert.equal(r.cas.unknown,1);assert.equal(r.recovery.state.status,'owned');assert.equal(f.state.updates,2);assert.equal(f.mutate().filter(c=>c.name==='create_commit').length,3);
});
test('thrown failure after successful CAS remains unknown even with final winner evidence',async()=>{
 const f=fixture({update:(args,state)=>{if(state.updates===1){state.head=args.sha;throw Error('transport failure with private payload');}}}),r=await enabled(f).run(input());
 assert.equal(r.reason,'EXACTLY_ONE_ACCEPTED_CAS_REQUIRED');assert.equal(r.cas.unknown,1);assert.equal(r.recovery.state.status,'owned');assert.equal(f.state.updates,2);assert.ok(!JSON.stringify(r).includes('private'));
});
test('mismatched or false rejection receipt cannot permit release',async()=>{
 for(const verifier of [async()=>true,async(_raw,request)=>({status:'NO_UPDATE_CONFIRMED',...request,expected_sha:OTHER}),async()=>{throw Error('uncertain verifier');}]){
  const f=fixture(),r=await createCasRehearsal(f.tools,{execute:true,verifyCasRejection:verifier}).run(input());assert.equal(r.reason,'CAS_REJECTION_UNVERIFIED');assert.equal(f.state.updates,2);
 }
});
test('provider returning wrong ref state after one acceptance cannot authorize release',async()=>{
 const f=fixture({update:(args,state,reject)=>{if(state.updates===1)return response({success:true});return reject(args);}}),r=await enabled(f).run(input());
 assert.equal(r.reason,'FRESH_INSTANCE_RECONCILIATION_UNCONFIRMED');assert.equal(f.state.updates,2);assert.equal(f.mutate().filter(c=>c.name==='create_commit').length,3);
});
test('stale expected SHA rejects both contenders after an intervening external head change',async()=>{
 const f=fixture({update:(_args,state)=>{if(state.updates===1)state.head=OTHER;}}),r=await enabled(f).run(input());
 assert.equal(r.reason,'EXACTLY_ONE_ACCEPTED_CAS_REQUIRED');assert.equal(r.cas.rejected,2);assert.equal(f.state.head,OTHER);assert.equal(f.state.updates,2);
});
test('fresh winner tree, parent, SHA and pending metadata must remain exact',async()=>{
 const edits=[c=>{c.sha=OTHER;},c=>{c.tree.sha=OTHER;},c=>{c.parents=[{sha:OTHER}];},c=>{const s=JSON.parse(c.message);s.pending={id:'unknown-operation',kind:'deploy',target_sha:BASE};c.message=JSON.stringify(s);}];
 for(const edit of edits){
  const f=fixture({update:(args,state,reject)=>{if(state.updates===1){state.head=args.sha;return response({success:true});}edit(state.commits.get(state.head));return reject(args);}}),r=await enabled(f).run(input());
  assert.equal(r.reason,'FRESH_INSTANCE_RECONCILIATION_UNCONFIRMED');assert.equal(f.state.updates,2);assert.equal(f.mutate().filter(c=>c.name==='create_commit').length,3);
 }
});
test('release never starts while either contender call is still pending',async()=>{
 let unblock,entered;const waiting=new Promise(r=>{entered=r;}),gate=new Promise(r=>{unblock=r;});
 const f=fixture({update:async(args,state,reject)=>{if(state.updates===2){entered();await gate;return reject(args);}}});
 const promise=enabled(f).run(input());await waiting;
 assert.equal(f.mutate().filter(c=>c.name==='create_commit').length,3);assert.equal(f.state.updates,2);
 unblock();assert.equal((await promise).status,'CONFIRMED');
});
test('uncertain applied release is read back only, never retried or called confirmed',async()=>{
 const f=fixture({update:(args,state)=>{if(state.updates===3){state.head=args.sha;throw Error('release response missing');}}}),r=await enabled(f).run(input());
 assert.equal(r.reason,'RELEASE_OUTCOME_UNKNOWN');assert.equal(r.recovery.state.status,'idle');assert.equal(f.state.updates,3);assert.equal(f.mutate().filter(c=>c.name==='create_commit').length,4);
});
test('fresh read-only instance cannot steal expired owner or resume unfinished trial',async()=>{
 const f=fixture();await createCasRehearsal(f.tools,{execute:true}).run(input());const count=f.mutate().length;
 const reader=createCasRehearsal(f.tools),snapshot=await reader.inspect();assert.equal(snapshot.state.status,'owned');
 assert.throws(()=>transition(snapshot.state,{action:'acquire',owner:'other-owner',ttl_seconds:60},'2027-01-01T00:00:00Z'),/never steal/);
 assert.equal((await reader.run(input())).status,'DISABLED');assert.equal((await enabled(f).run(input())).reason,'INITIAL_REF_EXISTS');assert.equal(f.mutate().length,count);
});
test('input is captured before the first await and cannot change the same-tree contract',async()=>{
 const f=fixture(),request=input(),pending=enabled(f).run(request);request.tree_sha=OTHER;request.base_sha=OTHER;
 assert.equal((await pending).status,'CONFIRMED');assert.ok(f.mutate().filter(c=>c.name==='create_commit').every(c=>c.args.tree_sha===TREE));
});

test('observed exact branch-name acknowledgment is accepted only without contradictions',async()=>{
 const f=fixture({branch:(args,state)=>{state.head=args.sha;return response({branch:ISOLATED_CAS_REF});}});
 assert.equal((await enabled(f).run(input())).status,'CONFIRMED');
 for(const data of [{branch:'main'},{branch:ISOLATED_CAS_REF,success:false},{branch:ISOLATED_CAS_REF,...reference(OTHER)},{branch:'main',success:true}]){
  const bad=fixture({branch:(args,state)=>{state.head=args.sha;return response(data);}}),r=await enabled(bad).run(input());
  assert.equal(r.reason,'CREATE_ISOLATED_BRANCH_UNCONFIRMED');assert.equal(bad.mutate().length,2);
 }
});

const BOOTSTRAP='1'.padStart(40,'0');
const resumeInput=()=>({...input(),bootstrap_sha:BOOTSTRAP});
function bootstrapFixture(hooks={}){
 const f=fixture(hooks);f.state.head=BOOTSTRAP;f.state.next=2;
 f.state.commits.set(BOOTSTRAP,{sha:BOOTSTRAP,tree:{sha:TREE},parents:[{sha:BASE}],message:JSON.stringify(idle())});
 let consumed=false;
 // SYNTHETIC host receipt only. Real hosting must persist its consumed marker
 // before returning, and retain the original bootstrap-only audit.
 f.authorizeBootstrapResume=async request=>{
  assert.equal(consumed,false,'synthetic host checkpoint already consumed');consumed=true;
  assert.deepEqual(request,{ref:ISOLATED_CAS_REF,base_sha:BASE,tree_sha:TREE,bootstrap_sha:BOOTSTRAP,existing_metadata_commits:1,max_new_metadata_commits:3});
  return {status:'CONSUMED_BOOTSTRAP_ONLY_CHECKPOINT',...request,candidate_mutations_started:false};
 };
 f.wasConsumed=()=>consumed;
 return f;
}
const resumer=f=>createCasRehearsal(f.tools,{execute:true,verifyCasRejection:f.verifyCasRejection,authorizeBootstrapResume:f.authorizeBootstrapResume});

test('explicit bootstrap resume is disabled by default and blocked without its trusted host authorizer',async()=>{
 const f=bootstrapFixture();assert.equal((await createCasRehearsal(f.tools).resumeFromBootstrap()).status,'DISABLED');assert.equal(f.state.calls.length,0);
 assert.equal((await enabled(f).resumeFromBootstrap(resumeInput())).reason,'BOOTSTRAP_RESUME_AUTHORIZATION_UNAVAILABLE');assert.equal(f.state.calls.length,0);
 for(const request of [{...resumeInput(),bootstrap_sha:()=> 'PRIVATE_RESUME_INPUT'},{...resumeInput(),branch_name:'main'},Object.create(resumeInput())]){
  await assert.rejects(resumer(f).resumeFromBootstrap(request),/EXACT_BASE_TREE_AND_TIME_REQUIRED/);assert.equal(f.state.calls.length,0);
 }
});
test('synthetic authorized bootstrap-only continuation creates at most three new same-tree commits',async()=>{
 const f=bootstrapFixture(),runner=resumer(f),r=await runner.resumeFromBootstrap(resumeInput());
 assert.equal(r.status,'CONFIRMED');assert.equal(r.resumed_from_bootstrap,true);assert.equal(r.metadata_commits,4);assert.equal(r.created_metadata_commits,3);assert.equal(f.wasConsumed(),true);
 assert.equal(f.mutate().filter(c=>c.name==='create_branch').length,0);
 const commits=f.mutate().filter(c=>c.name==='create_commit');assert.equal(commits.length,3);assert.deepEqual(commits.map(c=>c.args.parent_sha),[BOOTSTRAP,BOOTSTRAP,r.winner_sha]);assert.ok(commits.every(c=>c.args.tree_sha===TREE));
 assert.equal((await runner.resumeFromBootstrap(resumeInput())).reason,'INSTANCE_ALREADY_USED');assert.equal(f.mutate().filter(c=>c.name==='create_commit').length,3);
});
test('resume verifies exact canonical idle epoch zero, pending, parent, tree, SHA and ref before authorization',async()=>{
 const changes=[f=>{f.state.head=null;},f=>{f.state.head=OTHER;},f=>{f.state.commits.get(BOOTSTRAP).sha=OTHER;},f=>{f.state.commits.get(BOOTSTRAP).tree.sha=OTHER;},f=>{f.state.commits.get(BOOTSTRAP).parents=[{sha:OTHER}];},f=>{f.state.commits.get(BOOTSTRAP).message=JSON.stringify({...idle(),epoch:1});},f=>{f.state.commits.get(BOOTSTRAP).message=JSON.stringify(transition(idle(),{action:'acquire',owner:'other-owner',ttl_seconds:60},NOW));},f=>{f.state.commits.get(BOOTSTRAP).message=JSON.stringify({...idle(),pending:{id:'pending',kind:'deploy',target_sha:BASE}});},f=>{f.state.commits.get(BOOTSTRAP).message=JSON.stringify(idle(),null,2);}];
 for(const change of changes){const f=bootstrapFixture();change(f);const r=await resumer(f).resumeFromBootstrap(resumeInput());assert.equal(r.reason,'RESUME_BOOTSTRAP_UNCONFIRMED');assert.equal(f.wasConsumed(),false);assert.equal(f.mutate().length,0);}
});
test('resume requires exact consumed bootstrap-only receipt and never infers it from idle state',async()=>{
 for(const change of [r=>({...r,status:'AUTHORIZED'}),r=>({...r,existing_metadata_commits:2}),r=>({...r,max_new_metadata_commits:4}),r=>({...r,candidate_mutations_started:true}),r=>({...r,bootstrap_sha:OTHER}),r=>({...r,tree_sha:OTHER}),r=>({...r,base_sha:OTHER}),r=>({...r,ref:'main'})]){
  const f=bootstrapFixture(),authorize=f.authorizeBootstrapResume;f.authorizeBootstrapResume=async request=>change(await authorize(request));
  const r=await resumer(f).resumeFromBootstrap(resumeInput());assert.equal(r.reason,'AUTHORIZE_BOOTSTRAP_RESUME_UNCONFIRMED');assert.equal(f.mutate().length,0);assert.equal(f.wasConsumed(),true);
 }
});
test('resume rechecks exact bootstrap after awaited checkpoint consumption',async()=>{
 const f=bootstrapFixture(),authorize=f.authorizeBootstrapResume;f.authorizeBootstrapResume=async request=>{const receipt=await authorize(request);f.state.head=OTHER;return receipt;};
 const r=await resumer(f).resumeFromBootstrap(resumeInput());assert.equal(r.reason,'RESUME_BOOTSTRAP_UNCONFIRMED');assert.equal(f.wasConsumed(),true);assert.equal(f.mutate().length,0);
});
test('unknown candidate creation consumes allowance and a fresh instance cannot reuse host checkpoint',async()=>{
 const f=bootstrapFixture({commit:()=>{throw Error('candidate response unknown');}}),r=await resumer(f).resumeFromBootstrap(resumeInput());
 assert.equal(r.reason,'CREATE_METADATA_COMMIT_UNCONFIRMED');assert.equal(f.mutate().length,1);assert.equal(f.state.head,BOOTSTRAP);assert.equal(f.wasConsumed(),true);
 const retry=await resumer(f).resumeFromBootstrap(resumeInput());assert.equal(retry.reason,'AUTHORIZE_BOOTSTRAP_RESUME_UNCONFIRMED');assert.equal(f.mutate().length,1);
});
test('resumed default connector path still stops on unknown loser without release or replayed creation',async()=>{
 const f=bootstrapFixture(),r=await createCasRehearsal(f.tools,{execute:true,authorizeBootstrapResume:f.authorizeBootstrapResume}).resumeFromBootstrap(resumeInput());
 assert.equal(r.reason,'CAS_REJECTION_UNVERIFIED');assert.equal(r.recovery.state.status,'owned');assert.equal(f.mutate().filter(c=>c.name==='create_commit').length,2);assert.equal(f.mutate().filter(c=>c.name==='create_branch').length,0);assert.equal(f.state.updates,2);
});
