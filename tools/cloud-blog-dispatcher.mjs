/** Injectable single-operation executor. No provider adapter is bound here.
 * Trusted ports must authenticate approval and read authoritative remote state.
 * In-memory exclusion is only supplemental: the existing lease journal owns
 * cross-worker exclusion. Expiry never transfers ownership. A pending operation
 * is reconciled, never invoked again, even after a fresh process restart.
 */
import {createHash} from 'node:crypto';
const kinds = Object.freeze({CREATE_UNIQUE_ISSUE:'issue', CREATE_ATOMIC_TWO_FILE_COMMIT:'commit',
 CREATE_DRAFT_PR:'draft_pr', MARK_READY_FOR_REVIEW:'pr_ready', NORMAL_SERVER_PROTECTED_MERGE:'merge', PUSH_EXACT_MAIN_SOURCE:'source_push',
 SAVE_EXACT_MAIN_VERSION:'sites_version', DEPLOY_VERIFIED_VERSION:'deploy', ROLLBACK_KNOWN_GOOD:'deploy'});
const internalErrors=new WeakSet();
const need=(v,m)=>{if(!v){const error=new Error(m);internalErrors.add(error);throw error;}};
const sanitized=error=>internalErrors.has(error)?error:new Error('DISPATCH_PORT_FAILED_RECONCILE_PENDING');
const clone=v=>structuredClone(v);
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const time=v=>{need(typeof v==='string'&&/(Z|[+-]\d\d:\d\d)$/.test(v)&&Number.isFinite(Date.parse(v)),'Invalid clock');return Date.parse(v);};
function prepared(value, mode, now){
 const x=clone(value), p=x.plan;
 need(/^[a-f0-9]{40}$/.test(x.target_sha||''),'Exact operation target required');
 need(p?.status==='PLAN_ONLY'&&p.external_mutations===false&&p.evidence_mode===mode,'Trusted plan/provenance required');
 need(typeof p.run_id==='string'&&p.run_id.length>0&&Array.isArray(p.intents),'Invalid plan');
 need(time(now)>=time(p.observed_at)&&time(now)-time(p.observed_at)<=60000,'Stale plan');
 need(p.intents.length===1&&Object.hasOwn(kinds,p.intents[0]?.kind),'One supported external intent required');
 const intent=p.intents[0];
 const targetKey={CREATE_ATOMIC_TWO_FILE_COMMIT:'expected_parent_sha',CREATE_DRAFT_PR:'expected_remote_head_sha',
  MARK_READY_FOR_REVIEW:'expected_head_sha',NORMAL_SERVER_PROTECTED_MERGE:'expected_head_sha'}[intent.kind]||'target_sha';
 if(intent.kind!=='CREATE_UNIQUE_ISSUE')need(intent[targetKey]===x.target_sha,'Required exact intent target missing');
 for(const key of ['target_sha','expected_head_sha','expected_parent_sha','expected_remote_head_sha'])if(intent[key])need(intent[key]===x.target_sha,'Intent target mismatch');
 const digest=hash({run_id:p.run_id,phase:p.phase,target_sha:x.target_sha,intent});
 return freeze({operation_id:'op_'+digest,kind:kinds[intent.kind],target_sha:x.target_sha,intent,plan_sha256:digest,observed_at:p.observed_at});
}
export function createMutationDispatcher(ports,{execute=false,mode='MOCK'}={}){
 need(typeof execute==='boolean','Explicit boolean execution switch required');
 need(['MOCK','TRUSTED_ADAPTER'].includes(mode),'Explicit provenance required');
 for(const name of ['prepare','clock'])need(typeof ports[name]==='function',`Missing ${name} port`);
 let active=false;
 async function observe(op){
  const r=clone(await ports.reconcile(op)), now=ports.clock();
  need(r?.complete===true&&r.operation_id===op.operation_id&&r.kind===op.kind&&r.target_sha===op.target_sha,'Incomplete or mismatched reconciliation');
  need(time(now)>=time(r.observed_at)&&time(now)-time(r.observed_at)<=60000,'Stale reconciliation');
  need(['ABSENT','APPLIED','UNKNOWN'].includes(r.state),'Unknown reconciliation state');
  if(r.state==='APPLIED')need(r.matches===1&&typeof r.result_id==='string'&&r.result_id.length>0,'Unique authoritative result required');
  if(r.state==='ABSENT')need(r.matches===0,'Absent reconciliation has matches');
  return r;
 }
 async function settle(op,owner,epoch){
  let r;try{r=await observe(op);}catch{return freeze({status:'UNRESOLVED_STOP',operation_id:op.operation_id});}
  if(r.state!=='APPLIED')return freeze({status:'UNRESOLVED_STOP',operation_id:op.operation_id});
  const resolved=await ports.lease.change({action:'resolve',owner,epoch,operation_id:op.operation_id,remote_result_verified:true},ports.clock());
  return freeze({status:resolved.status==='CONFIRMED'?'APPLIED_VERIFIED':'RESOLUTION_UNCONFIRMED_STOP',operation_id:op.operation_id,result_id:r.result_id});
 }
 async function dispatch(request,{owner,epoch}={}){
  need(!active,'LOCAL_OPERATION_IN_PROGRESS');active=true;
  try{
   const input=freeze(clone(request)), op=prepared(await ports.prepare(input),mode,ports.clock());
   if(!execute)return freeze({status:'DISABLED_PLAN_ONLY',operation:op});
   for(const name of ['authorize','invoke','reconcile'])need(typeof ports[name]==='function',`Missing ${name} port`);
   need(ports.lease&&['read','change','assertOperation'].every(k=>typeof ports.lease[k]==='function'),'Missing lease binding');
   need(typeof owner==='string'&&/^[a-zA-Z0-9_-]{1,96}$/.test(owner)&&Number.isSafeInteger(epoch)&&epoch>0,'Valid fence identity required');
   const current=await ports.lease.read();
   need(current.state.status==='owned'&&current.state.owner===owner&&current.state.epoch===epoch,'STALE_OWNER');
   if(current.state.pending){
    need(current.state.pending.id===op.operation_id&&current.state.pending.target_sha===op.target_sha&&current.state.pending.kind===op.kind,'DIFFERENT_PENDING_OPERATION');
    return await settle(op,owner,epoch);
   }
   const prior=await observe(op);
   if(prior.state==='APPLIED')return freeze({status:'ALREADY_APPLIED',operation_id:op.operation_id,result_id:prior.result_id});
   need(prior.state==='ABSENT','UNKNOWN_REMOTE_OUTCOME');
   const consent=clone(await ports.authorize(op));
   need(consent?.authorized===true&&consent.operation_id===op.operation_id&&consent.target_sha===op.target_sha&&consent.plan_sha256===op.plan_sha256,'Exact operation authorization required');
   need(time(consent.expires_at)>time(ports.clock()),'AUTHORIZATION_EXPIRED');
   const fence=await ports.lease.change({action:'begin',owner,epoch,operation:{id:op.operation_id,kind:op.kind,target_sha:op.target_sha}},ports.clock());
   need(fence.status==='CONFIRMED','JOURNAL_NOT_CONFIRMED');
   await ports.lease.assertOperation(fence,op.operation_id,ports.clock());
   const fresh=prepared(await ports.prepare(input),mode,ports.clock());
   need(fresh.operation_id===op.operation_id,'PLAN_CHANGED_AFTER_JOURNAL');
   const freshConsent=clone(await ports.authorize(fresh));
   need(freshConsent?.authorized===true&&freshConsent.operation_id===op.operation_id&&freshConsent.target_sha===op.target_sha&&freshConsent.plan_sha256===op.plan_sha256,'Authorization changed');
   need(time(freshConsent.expires_at)>time(ports.clock()),'AUTHORIZATION_EXPIRED');
   const finalFence=await ports.lease.assertOperation(fence,op.operation_id,ports.clock());
   // Check after the last remote await: an in-flight read/approval may cross
   // lease expiry or make the freshly prepared evidence too old.
   const dispatchAt=time(ports.clock());
   need(dispatchAt<time(freshConsent.expires_at),'AUTHORIZATION_EXPIRED_BEFORE_DISPATCH');
   need(dispatchAt>=time(fresh.observed_at)&&dispatchAt-time(fresh.observed_at)<=60000,'PLAN_EXPIRED_BEFORE_DISPATCH');
   need(finalFence?.sha===fence.sha&&finalFence.state?.owner===owner&&finalFence.state.epoch===epoch&&finalFence.state.pending?.id===op.operation_id,'FINAL_FENCE_MISMATCH');
   need(dispatchAt<time(finalFence.state.until),'LEASE_EXPIRED_BEFORE_DISPATCH');
   // At most one call. Its response alone is never proof of the remote outcome.
   try{await ports.invoke(fresh);}catch{/* Unknown outcomes remain journaled. */}
   return await settle(op,owner,epoch);
  }catch(error){throw sanitized(error);}finally{active=false;}
 }
 async function recoverPending({owner,epoch}={}){
  need(!active,'LOCAL_OPERATION_IN_PROGRESS');active=true;
  try{
   need(ports.lease&&typeof ports.lease.read==='function','Missing lease read binding');
   const current=await ports.lease.read(), pending=current.state.pending;
   if(!pending)return freeze({status:'NO_PENDING_OPERATION'});
   need(current.state.status==='owned'&&current.state.owner===owner&&current.state.epoch===epoch,'STALE_OWNER');
   need(/^op_[a-f0-9]{64}$/.test(pending.id)&&Object.values(kinds).includes(pending.kind)&&/^[a-f0-9]{40}$/.test(pending.target_sha),'Invalid pending dispatcher binding');
   const op=freeze({operation_id:pending.id,kind:pending.kind,target_sha:pending.target_sha,plan_sha256:pending.id.slice(3)});
   if(!execute)return freeze({status:'DISABLED_RECOVERY_ONLY',operation:op});
   need(typeof ports.reconcile==='function'&&typeof ports.lease.change==='function','Missing recovery ports');
   // Recovery must not run a current planner: successful writes change the
   // remote state, so its old mutation intent may legitimately no longer exist.
   return await settle(op,owner,epoch);
  }catch(error){throw sanitized(error);}finally{active=false;}
 }
 return Object.freeze({dispatch,recoverPending});
}
