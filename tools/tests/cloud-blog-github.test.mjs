import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRunner, decode} from '../cloud-blog-github.mjs';
const A='a'.repeat(40), B='b'.repeat(40), M='e'.repeat(40), H='c'.repeat(64), Q='d'.repeat(64);
const qa={status:'approved',user_approval_verified:true,skill_verify_review:true,head_sha:A,content_sha256:H,qa_report_sha256:Q,issues:{topic:7}};
function fixture(mode='success'){
 const state={draft:true,merged:false,head:A,mutations:[],reads:[],mode};
 const wrap=d=>({structuredContent:{content:JSON.stringify(d)}});
 const pr=()=>({state:state.merged?'closed':'open',merged:state.merged,draft:state.draft,auto_merge:null,changed_files:2,mergeable:true,mergeable_state:'clean',head:{ref:'chatgpt',sha:state.head,repo:{full_name:'fichil/fichil.com'}},base:{ref:'main',repo:{full_name:'fichil/fichil.com'}},merge_commit_sha:M,body:`<!-- codex-workday-bilingual-blog -->\n<!-- fichil-content-qa-approval:v1 status=approved head_sha=${A} content_sha256=${H} qa_report_sha256=${Q} -->\nCloses #7`});
 const run={id:12,name:'Site Build Check',path:'.github/workflows/hugo-check.yml',head_branch:'main',head_sha:B,event:'push',run_number:9,run_attempt:1,status:'completed',conclusion:'success'};
 const tools={
  mcp__codex_apps__github_fetch:async({url})=>{state.reads.push(url);const u=new URL(url),p=u.pathname;
   if(p.endsWith('/pulls/8'))return wrap(pr());
   if(p.endsWith('/files'))return wrap(['en','zh-cn'].map(l=>({filename:`content/${l}/blog/topic/index.md`,status:'added'})));
   if(p.endsWith('/issues/7'))return wrap({number:7,state:'open'});
   if(p.endsWith('/reviews'))return wrap([]);
   if(p.endsWith('/git/ref/heads/main'))return wrap({object:{sha:state.merged?M:B}});
   if(p.includes('/compare/'))return wrap({status:'ahead',behind_by:state.mode==='behind'?1:0});
   if(p.endsWith('/check-runs'))return wrap({total_count:2,check_runs:['build','sites'].map((name,i)=>({name,id:i+1,head_sha:A,app:{id:15368},status:'completed',conclusion:state.mode==='bad-check'?'failure':'success'}))});
   if(p.endsWith('/actions/runs'))return wrap({total_count:1,workflow_runs:[run]});
   if(p.endsWith('/actions/runs/12'))return wrap(run);
   throw new Error(`Unexpected read ${url}`);
  },
  mcp__codex_apps__github_mark_pull_request_ready_for_review:async args=>{state.mutations.push(['ready',args]);state.draft=false;if(state.mode==='head-race')state.head=B;return wrap(pr());},
  mcp__codex_apps__github_convert_pull_request_to_draft:async args=>{state.mutations.push(['draft',args]);state.draft=true;return wrap(pr());},
  mcp__codex_apps__github_merge_pull_request:async args=>{state.mutations.push(['merge',args]);
   if(state.mode==='reject')return wrap({merged:false});
   if(state.mode==='timeout-open')throw new Error('timeout');
   state.merged=true;if(state.mode==='timeout-merged')throw new Error('timeout');return wrap({merged:true,sha:M});
  }
 };
 return {state,tools,run};
}
test('rehearsal reads complete evidence and never mutates',async()=>{const f=fixture();const r=await createRunner(f.tools).mergeApproved(8,async()=>qa);assert.equal(r.status,'REHEARSAL_READY');assert.deepEqual(r.intent,{repository_full_name:'fichil/fichil.com',pr_number:8,expected_head_sha:A,merge_method:'merge'});assert.equal(f.state.mutations.length,0);});
test('approved merge uses exact head and revalidates after Ready',async()=>{const f=fixture();let count=0;const r=await createRunner(f.tools,{execute:true}).mergeApproved(8,async()=>{count++;return qa;});assert.equal(r.status,'MERGED');assert.equal(count,2);assert.equal(f.state.mutations.filter(x=>x[0]==='merge').length,1);});
test('server rejection restores Draft, next invocation revalidates',async()=>{const f=fixture('reject'),r=createRunner(f.tools,{execute:true});assert.equal((await r.mergeApproved(8,async()=>qa)).status,'OPEN_REVALIDATE_BEFORE_RETRY');assert.equal(f.state.draft,true);f.state.mode='success';assert.equal((await r.mergeApproved(8,async()=>qa)).status,'MERGED');assert.equal(f.state.mutations.filter(x=>x[0]==='merge').length,2);});
test('lost success response reconciles merged, never retries',async()=>{const f=fixture('timeout-merged');assert.equal((await createRunner(f.tools,{execute:true}).mergeApproved(8,async()=>qa)).status,'MERGED');assert.equal(f.state.mutations.filter(x=>x[0]==='merge').length,1);});
test('lost open response restores Draft without automatic retry',async()=>{const f=fixture('timeout-open');assert.equal((await createRunner(f.tools,{execute:true}).mergeApproved(8,async()=>qa)).status,'OPEN_REVALIDATE_BEFORE_RETRY');assert.equal(f.state.draft,true);assert.equal(f.state.mutations.filter(x=>x[0]==='merge').length,1);});
test('head race during Ready never reaches merge and restores Draft',async()=>{const f=fixture('head-race');assert.equal((await createRunner(f.tools,{execute:true}).mergeApproved(8,async()=>qa)).status,'AWAITING_NEW_REVIEW');assert.equal(f.state.mutations.some(x=>x[0]==='merge'),false);assert.equal(f.state.draft,true);});
for(const mode of ['behind','bad-check'])test(`${mode} stops before mutations`,async()=>{const f=fixture(mode);await assert.rejects(createRunner(f.tools,{execute:true}).mergeApproved(8,async()=>qa));assert.equal(f.state.mutations.length,0);});
test('push-inclusive exact-main fetch and reread',async()=>{const f=fixture();assert.equal((await createRunner(f.tools).pushEvidence(B)).id,12);assert.ok(f.state.reads[0].includes('event=push&branch=main&head_sha='));f.run.event='pull_request';await assert.rejects(createRunner(f.tools).pushEvidence(B));});
test('failed latest exact push run blocks',async()=>{const f=fixture();f.run.conclusion='failure';await assert.rejects(createRunner(f.tools).pushEvidence(B));});
test('connector errors and unstructured responses fail closed',()=>{assert.throws(()=>decode({isError:true}));assert.throws(()=>decode({content:[{text:'success'}]}));});
test('pagination traverses full pages and validates counts',async()=>{let calls=0;const runner=createRunner({mcp__codex_apps__github_fetch:async()=>({structuredContent:{content:JSON.stringify({total_count:101,items:Array.from({length:++calls===1?100:1},(_,i)=>i)})}})});assert.equal((await runner.list('/test','items')).length,101);assert.equal(calls,2);});

test('restart after merge reconciles without another mutation',async()=>{const f=fixture();const r=createRunner(f.tools,{execute:true});await r.mergeApproved(8,async()=>qa);const count=f.state.mutations.length;assert.equal((await r.mergeApproved(8,async()=>qa)).status,'MERGED');assert.equal(f.state.mutations.length,count);});
test('unreadable merge outcome stops without repeating merge',async()=>{const f=fixture();const original=f.tools.mcp__codex_apps__github_fetch;f.tools.mcp__codex_apps__github_fetch=async a=>{if(f.state.merged)throw new Error('read unavailable');return original(a);};await assert.rejects(createRunner(f.tools,{execute:true}).mergeApproved(8,async()=>qa));assert.equal(f.state.mutations.filter(x=>x[0]==='merge').length,1);});
test('stale already-Ready PR is restored before error returns',async()=>{const f=fixture();f.state.draft=false;f.state.head=B;await assert.rejects(createRunner(f.tools,{execute:true}).mergeApproved(8,async()=>qa));assert.equal(f.state.draft,true);assert.equal(f.state.mutations.some(x=>x[0]==='merge'),false);});
