/** Dedicated GitHub state-ref CAS protocol. No automatic expiry takeover.
 * Default is read-only; execute=true is for authorized runtime or explicit mocks.
 * Sites has no fencing parameter: an expired owner remains blocking until its
 * pending operation is reconciled and the old worker is demonstrably quiescent.
 * Never store private evidence, credentials, source URLs or article prose here.
 */
import {decode, GateError} from './cloud-blog-github.mjs';
const REPO='fichil/fichil.com', REF='automation/blog-runner-state';
const API=`https://api.github.com/repos/${REPO}`;
const SHA=/^[a-f0-9]{40}$/, ID=/^[a-zA-Z0-9_-]{1,96}$/;
const need=(value,message)=>{if(!value)throw new GateError(message);};
const millis=value=>{const time=Date.parse(value);need(Number.isFinite(time)&&/(Z|[+-]\d\d:\d\d)$/.test(value),'Invalid aware timestamp');return time;};
export function validateState(state){
 need(state&&Object.keys(state).sort().join(',')==='epoch,owner,pending,schema,status,until','Unexpected state fields');
 need(state?.schema===1&&Number.isSafeInteger(state.epoch)&&state.epoch>=0,'Invalid lease state');
 need(['idle','owned'].includes(state.status),'Invalid lease status');
 if(state.status==='idle')need(state.owner===null&&state.until===null&&state.pending===null,'Invalid idle lease');
 else {need(ID.test(state.owner||''),'Invalid opaque owner');millis(state.until);}
 if(state.pending!==null){
  need(Object.keys(state.pending).sort().join(',')==='id,kind,target_sha','Unexpected operation fields');
  need(state.status==='owned'&&ID.test(state.pending?.id||''),'Invalid pending operation');
  need(['issue','commit','draft_pr','merge','sites_version','deploy'].includes(state.pending.kind),'Invalid operation kind');
  need(SHA.test(state.pending.target_sha||''),'Pending operation requires exact target SHA');
 }
 return state;
}
export function transition(state,command,now){
 validateState(state); const next=structuredClone(state), clock=millis(now);
 need(ID.test(command.owner||''),'Invalid opaque owner');
 if(command.action==='acquire'){
  need(state.status==='idle','LEASE_BUSY_OR_EXPIRED: never steal ownership');
  need(Number.isSafeInteger(command.ttl_seconds)&&command.ttl_seconds>=30&&command.ttl_seconds<=900,'Invalid lease duration');
  next.status='owned';next.owner=command.owner;next.epoch++;next.until=new Date(clock+command.ttl_seconds*1000).toISOString();
 }else{
  need(state.status==='owned'&&state.owner===command.owner&&state.epoch===command.epoch,'STALE_FENCE');
  if(command.action==='renew'||command.action==='begin')need(clock<millis(state.until),'LEASE_EXPIRED: no new mutation');
  if(command.action==='renew'){
   need(Number.isSafeInteger(command.ttl_seconds)&&command.ttl_seconds>=30&&command.ttl_seconds<=900,'Invalid lease duration');
   next.until=new Date(clock+command.ttl_seconds*1000).toISOString();
  }else if(command.action==='begin'){
   need(state.pending===null,'UNRESOLVED_OPERATION: do not overlap/retry');next.pending=structuredClone(command.operation);
  }else if(command.action==='resolve'){
   need(state.pending?.id===command.operation_id&&command.remote_result_verified===true,'Unique remote outcome must be verified');
   next.pending=null; // Persist only after remote reconciliation, never merely a timeout.
  }else if(command.action==='release'){
   need(state.pending===null,'Cannot release unresolved operation');next.status='idle';next.owner=null;next.until=null;
  }else throw new GateError('Unsupported lease transition');
 }
 return validateState(next);
}
export function createLeaseController(tools,{execute=false}={}){
 const call=async(name,args)=>decode(await tools[`mcp__codex_apps__github_${name}`](args));
 async function read(){
  const ref=await call('fetch',{url:`${API}/git/ref/heads/${REF}`});need(SHA.test(ref.object?.sha||''),'State ref missing/invalid; owner must authorize bootstrap');
  const commit=await call('fetch',{url:`${API}/git/commits/${ref.object.sha}`});
  need(commit.sha===ref.object.sha&&SHA.test(commit.tree?.sha||''),'Invalid state commit identity');
  let state;try{state=JSON.parse(commit.message);}catch{throw new GateError('Invalid state commit payload');}
  return {sha:commit.sha,tree:commit.tree.sha,state:validateState(state)};
 }
 async function change(command,now){
  const before=await read(), next=transition(before.state,command,now);
  if(!execute)return {status:'REHEARSAL_ONLY',expected_sha:before.sha,next};
  // The tree is unchanged. Only safe opaque coordination data goes in the commit.
  const commit=await call('create_commit',{repository_full_name:REPO,parent_sha:before.sha,tree_sha:before.tree,message:JSON.stringify(next)});
  need(SHA.test(commit.sha||''),'State commit outcome unknown; do not update ref');
  let uncertain=false;
  try{await call('update_ref',{repository_full_name:REPO,branch_name:REF,sha:commit.sha,expected_sha:before.sha,force:false});}
  catch{uncertain=true;}
  // Both rejected CAS and lost success responses must be read back, never retried.
  const after=await read();
  if(after.sha!==commit.sha)return {status:'CAS_NOT_CONFIRMED_STOP',observed_sha:after.sha,uncertain};
  need(JSON.stringify(after.state)===JSON.stringify(next),'Unexpected state payload');
  return {status:'CONFIRMED',sha:after.sha,owner:next.owner,epoch:next.epoch,until:next.until,pending:next.pending,uncertain};
 }
 async function assertOperation(fence,operationId,now){
  const current=await read();
  need(current.sha===fence.sha&&current.state.owner===fence.owner&&current.state.epoch===fence.epoch,'STALE_FENCE');
  need(millis(now)<millis(current.state.until)&&current.state.pending?.id===operationId,'Expired or unjournaled operation');
  return current;
 }
 return {read,change,assertOperation};
}
