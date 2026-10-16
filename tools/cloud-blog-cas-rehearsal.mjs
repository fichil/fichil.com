/** Isolated, default-disabled GitHub CAS trial. No production ref or publisher.
 * This module never binds real tools itself. Calling run with execute=true is
 * permitted only after separate approval of the exact isolated trial.
 * A discarded success response below simulates CLIENT observation loss only;
 * it does not inject or establish any real transport/server failure behavior.
 */
import {decode, GateError} from './cloud-blog-github.mjs';
import {ISOLATED_CAS_REF, transition, validateState} from './cloud-blog-lease.mjs';

const REPO='fichil/fichil.com', API=`https://api.github.com/repos/${REPO}`;
const REF=`refs/heads/${ISOLATED_CAS_REF}`, SHA=/^[a-f0-9]{40}$/;
const OWNERS=Object.freeze(['cas-rehearsal-owner-a','cas-rehearsal-owner-b']);
const need=(v,m)=>{if(!v)throw new GateError(m);};
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
const idle=()=>({schema:1,epoch:0,status:'idle',owner:null,until:null,pending:null});
const canonical=s=>JSON.stringify(validateState(s));
const exactKeys=(value,keys)=>value&&Object.getPrototypeOf(value)===Object.prototype&&Object.keys(value).every(k=>keys.includes(k));
const metadata=c=>{
 let state;try{state=JSON.parse(c.message);}catch{throw new GateError('MALFORMED_STATE_MESSAGE');}
 validateState(state);
 need(c.message===canonical(state),'NONCANONICAL_STATE_MESSAGE');
 return state;
};
const commitIdentity=(c,sha)=>{
 need(SHA.test(sha||'')&&c?.sha===sha&&SHA.test(c.tree?.sha||'')&&Array.isArray(c.parents)&&c.parents.every(p=>SHA.test(p?.sha||'')),'INVALID_COMMIT_IDENTITY');
 return c;
};
const exactCommit=(c,{sha,tree,parent,state})=>{
 commitIdentity(c,sha);
 need(c.tree.sha===tree&&c.parents.length===1&&c.parents[0].sha===parent,'COMMIT_TREE_OR_PARENT_MISMATCH');
 need(c.message===canonical(state),'COMMIT_STATE_MISMATCH');metadata(c);
 return c;
};
const refIdentity=(r,sha)=>r?.ref===REF&&r.object?.type==='commit'&&SHA.test(r.object?.sha||'')&&(!sha||r.object.sha===sha);
const consistentIdentity=(r,sha)=>(!Object.hasOwn(r,'branch')||r.branch===ISOLATED_CAS_REF)&&(!['ref','object'].some(k=>Object.hasOwn(r,k))||refIdentity(r,sha));
const consistentSuccess=(r,sha)=>r?.success===true&&consistentIdentity(r,sha);
const branchAccepted=(r,sha)=>r&&consistentIdentity(r,sha)&&(Object.hasOwn(r,'success')?r.success===true:(r.branch===ISOLATED_CAS_REF||refIdentity(r,sha)));

/** No repository/ref override is accepted. inspect() is always read-only and
 * returns only strict lease metadata; it cannot resume or release any run.
 * Unknown write outcomes stop. The caller must preserve STOPPED results and
 * use only inspect() for recovery, including when a dangling bootstrap commit
 * has no discoverable ref. No absent-ref read authorizes retrying that write.
 * Re-instantiation cannot infer discarded action IDs or take over on expiry.
 * resumeFromBootstrap is a separate explicitly authorized continuation only
 * from an audited bootstrap-only stop. Its trusted authorizeBootstrapResume
 * port must consume the host's one-use checkpoint BEFORE returning, bind the
 * exact ref/base/tree/bootstrap, and prove only one metadata commit was made
 * with no candidate requests started. The receipt is not inferred from idle
 * remote state: candidate commits can dangle without changing that state.
 * A disposable-cloud host may use an exclusive-create consumption marker, but
 * that is local single-host bookkeeping, NOT distributed authority. The host
 * must preserve the original audit and marker and reject missing/reused state.
 * After any candidate attempt, recovery is read-only; never reissue a receipt.
 * Optional verifyCasRejection is a TRUSTED adapter port, not provider JSON or
 * an error-code list. It must independently authenticate documented evidence
 * that the exact request was rejected without updating the ref. Its receipt
 * must bind repository_full_name, branch_name, expected_sha and sha, and have
 * status NO_UPDATE_CONFIRMED. No such live binding is supplied by this module.
 */
export function createCasRehearsal(tools,options={}){
 need(exactKeys(options,['execute','verifyCasRejection','authorizeBootstrapResume']),'UNSUPPORTED_TRIAL_OPTION');
 const execute=Object.hasOwn(options,'execute')?options.execute:false;
 const authorizeBootstrapResume=Object.hasOwn(options,'authorizeBootstrapResume')?options.authorizeBootstrapResume:undefined;
 need(authorizeBootstrapResume===undefined||typeof authorizeBootstrapResume==='function','INVALID_BOOTSTRAP_RESUME_AUTHORIZER');
 const verifyCasRejection=Object.hasOwn(options,'verifyCasRejection')?options.verifyCasRejection:undefined;
 need(verifyCasRejection===undefined||typeof verifyCasRejection==='function','INVALID_REJECTION_VERIFIER');
 need(typeof execute==='boolean','EXPLICIT_BOOLEAN_EXECUTION_REQUIRED');
 let started=false;
 const call=async(name,args)=>{
  need(typeof tools?.[`mcp__codex_apps__github_${name}`]==='function','MISSING_SUPPORTED_TOOL');
  return tools[`mcp__codex_apps__github_${name}`](args);
 };
 const get=async path=>decode(await call('fetch',{url:API+path}));
 async function probe(){
  let result;
  try{result=await call('fetch',{url:`${API}/git/ref/heads/${ISOLATED_CAS_REF}`});}catch{return {status:'UNKNOWN'};}
  // This exact supported connector error is not an authorization proof. run()
  // first verifies the pinned base commit through the same repository adapter.
  const d=result?.structuredContent;
  if(result?.isError===true&&d?.error_code==='NOT_FOUND'&&String(d.error_data?.status)==='404')return {status:'ABSENT'};
  if(result?.isError)return {status:'UNKNOWN'};
  let r;try{r=decode(result);}catch{return {status:'UNKNOWN'};}
  if(!refIdentity(r))return {status:'MALFORMED'};
  return {status:'EXISTS',sha:r.object.sha};
 }
 async function inspect(){
  const p=await probe();if(p.status!=='EXISTS')return freeze({status:p.status,ref:ISOLATED_CAS_REF,read_only:true});
  try{
   const c=commitIdentity(await get(`/git/commits/${p.sha}`),p.sha), state=metadata(c);
   need(c.parents.length===1,'STATE_MUST_HAVE_ONE_PARENT');
   const parent=commitIdentity(await get(`/git/commits/${c.parents[0].sha}`),c.parents[0].sha);
   need(parent.tree.sha===c.tree.sha,'STATE_PARENT_TREE_MISMATCH');
   const again=await probe();need(again.status==='EXISTS'&&again.sha===p.sha,'REF_CHANGED_DURING_READ');
   return freeze({status:'OBSERVED',ref:ISOLATED_CAS_REF,read_only:true,sha:c.sha,tree_sha:c.tree.sha,parent_sha:parent.sha,state});
  }catch{return freeze({status:'UNVERIFIED',ref:ISOLATED_CAS_REF,read_only:true});}
 }
 const freshRead=()=>createCasRehearsal(tools).inspect();
 const stopped=async(reason,details={})=>freeze({status:'STOPPED',reason,ref:ISOLATED_CAS_REF,...details,recovery:await freshRead(),retry_permitted:false});
 async function perform(input,resume){
  // No connector, clock, validation callback or ref discovery runs by default.
  if(!execute)return freeze({status:'DISABLED',ref:ISOLATED_CAS_REF,external_mutations:false});
  if(started)return freeze({status:'STOPPED',reason:'INSTANCE_ALREADY_USED',ref:ISOLATED_CAS_REF,retry_permitted:false});
  started=true;
  const keys=['base_sha','tree_sha','now',...(resume?['bootstrap_sha']:[])];
  need(exactKeys(input,keys)&&keys.every(k=>typeof Object.getOwnPropertyDescriptor(input,k)?.value==='string')&&SHA.test(input.base_sha)&&SHA.test(input.tree_sha)&&(!resume||SHA.test(input.bootstrap_sha)),'EXACT_BASE_TREE_AND_TIME_REQUIRED');
  if(resume&&!authorizeBootstrapResume)return freeze({status:'STOPPED',reason:'BOOTSTRAP_RESUME_AUTHORIZATION_UNAVAILABLE',ref:ISOLATED_CAS_REF,attempted_mutations:0,retry_permitted:false});
  input=freeze(structuredClone(input));
  const states=OWNERS.map(owner=>transition(idle(),{action:'acquire',owner,ttl_seconds:60},input.now));
  const known=new Set([input.base_sha]);
  let phase='BASE_PREFLIGHT', attemptedMutations=0;
  async function makeCommit(parent,state){
   phase='CREATE_METADATA_COMMIT';attemptedMutations++;
   const r=decode(await call('create_commit',{repository_full_name:REPO,parent_sha:parent,tree_sha:input.tree_sha,message:canonical(state)}));
   need(SHA.test(r.sha||'')&&!known.has(r.sha),'MISSING_OR_DUPLICATE_COMMIT_SHA');known.add(r.sha);
   exactCommit(await get(`/git/commits/${r.sha}`),{sha:r.sha,tree:input.tree_sha,parent,state});
   return r.sha;
  }
  async function confirm(sha,parent,state){
   const r=await freshRead();
   need(r.status==='OBSERVED'&&r.sha===sha&&r.tree_sha===input.tree_sha&&r.parent_sha===parent&&canonical(r.state)===canonical(state),'EXACT_REMOTE_STATE_NOT_CONFIRMED');
   return r;
  }
  async function cas(sha,expected){
   attemptedMutations++;
   const request=freeze({repository_full_name:REPO,branch_name:ISOLATED_CAS_REF,sha,expected_sha:expected,force:false});
   try{
    const raw=await call('update_ref',request);
    if(!raw?.isError&&consistentSuccess(decode(raw),sha))return {outcome:'ACCEPTED'};
    // No generic exception, HTTP status or error prose proves rejection.
    if(verifyCasRejection){
     const receipt=await verifyCasRejection(raw,request);
     if(receipt?.status==='NO_UPDATE_CONFIRMED'&&['repository_full_name','branch_name','sha','expected_sha'].every(k=>receipt[k]===request[k]))return {outcome:'REJECTED'};
    }
    return {outcome:'UNKNOWN'};
   }catch{return {outcome:'UNKNOWN'};}
  }
  try{
   const base=commitIdentity(await get(`/git/commits/${input.base_sha}`),input.base_sha);
   need(base.tree.sha===input.tree_sha,'BASE_TREE_MISMATCH');
   let bootstrap;
   if(resume){
    phase='RESUME_BOOTSTRAP';bootstrap=input.bootstrap_sha;
    need(!known.has(bootstrap),'BOOTSTRAP_MUST_DIFFER_FROM_BASE');known.add(bootstrap);
    await confirm(bootstrap,input.base_sha,idle());
    const request=freeze({ref:ISOLATED_CAS_REF,base_sha:input.base_sha,tree_sha:input.tree_sha,bootstrap_sha:bootstrap,existing_metadata_commits:1,max_new_metadata_commits:3});
    phase='AUTHORIZE_BOOTSTRAP_RESUME';
    const receipt=await authorizeBootstrapResume(request);
    need(receipt?.status==='CONSUMED_BOOTSTRAP_ONLY_CHECKPOINT'&&receipt.existing_metadata_commits===1&&receipt.max_new_metadata_commits===3&&receipt.candidate_mutations_started===false&&['ref','base_sha','tree_sha','bootstrap_sha'].every(k=>receipt[k]===request[k]),'BOOTSTRAP_ONLY_CHECKPOINT_NOT_CONSUMED');
    // The host has consumed its allowance even if this last read now fails.
    // Neither failure nor an idle ref permits issuing another allowance.
    phase='RESUME_BOOTSTRAP';await confirm(bootstrap,input.base_sha,idle());
   }else{
    const initial=await probe();
    if(initial.status!=='ABSENT')return freeze({status:'STOPPED',reason:`INITIAL_REF_${initial.status}`,ref:ISOLATED_CAS_REF,attempted_mutations:0,retry_permitted:false});
    bootstrap=await makeCommit(input.base_sha,idle());
    // Do not silently replace a ref created during bootstrap construction.
    const precreate=await probe();if(precreate.status!=='ABSENT')return stopped(`PRECREATE_REF_${precreate.status}`,{attempted_mutations:attemptedMutations});
    phase='CREATE_ISOLATED_BRANCH';attemptedMutations++;
    const branchResult=decode(await call('create_branch',{repository_full_name:REPO,branch_name:ISOLATED_CAS_REF,sha:bootstrap}));
    need(branchAccepted(branchResult,bootstrap),'BRANCH_ACCEPTANCE_UNCONFIRMED');
    await confirm(bootstrap,input.base_sha,idle());
   }
   const candidates=[];
   for(const state of states)candidates.push(await makeCommit(bootstrap,state));
   await confirm(bootstrap,input.base_sha,idle());
   phase='CONTENDERS';
   // Both promises are started before awaiting either. No timeout can stand in
   // for settlement; no release occurs while either supported tool is pending.
   const observations=await Promise.all(candidates.map(sha=>cas(sha,bootstrap)));
   const accepted=observations.flatMap((r,i)=>r.outcome==='ACCEPTED'?[i]:[]);
   const summary={accepted:accepted.length,rejected:observations.filter(r=>r.outcome==='REJECTED').length,unknown:observations.filter(r=>r.outcome==='UNKNOWN').length,both_settled:true};
   if(accepted.length!==1)return stopped('EXACTLY_ONE_ACCEPTED_CAS_REQUIRED',{cas:summary,attempted_mutations:attemptedMutations});
   if(summary.unknown||summary.rejected!==1)return stopped('CAS_REJECTION_UNVERIFIED',{cas:summary,attempted_mutations:attemptedMutations});
   const winner=accepted[0];
   // Supervisory audit retains only acceptance counts and candidate SHAs. The
   // client observation is deliberately discarded, then a new reader starts.
   observations[winner]=null;
   phase='FRESH_INSTANCE_RECONCILIATION';
   const recovered=await confirm(candidates[winner],bootstrap,states[winner]);
   need(recovered.state.pending===null,'PENDING_OPERATION_BLOCKS_RELEASE');
   for(const now of [input.now,new Date(Date.parse(recovered.state.until)+1000).toISOString()]){
    let blocked=false;try{transition(recovered.state,{action:'acquire',owner:OWNERS[1-winner],ttl_seconds:60},now);}catch(error){blocked=error instanceof GateError&&error.message.includes('never steal');}
    need(blocked,'EXPIRY_TAKEOVER_NOT_BLOCKED');
   }
   const released=transition(recovered.state,{action:'release',owner:recovered.state.owner,epoch:recovered.state.epoch},input.now);
   const release=await makeCommit(recovered.sha,released);
   await confirm(recovered.sha,bootstrap,states[winner]);
   phase='RELEASE_CAS';
   if((await cas(release,recovered.sha)).outcome!=='ACCEPTED')return stopped('RELEASE_OUTCOME_UNKNOWN',{attempted_mutations:attemptedMutations});
   await confirm(release,recovered.sha,released);
   return freeze({status:'CONFIRMED',ref:ISOLATED_CAS_REF,base_sha:input.base_sha,tree_sha:input.tree_sha,bootstrap_sha:bootstrap,candidate_shas:candidates,winner_sha:recovered.sha,release_sha:release,cas:summary,metadata_commits:4,created_metadata_commits:resume?3:4,resumed_from_bootstrap:resume,attempted_mutations:attemptedMutations,fresh_instance_reconciliation:true,expiry_takeover_blocked:true,observation_loss:'SIMULATED_CLIENT_SUCCESS_RESPONSE_DISCARD',real_network_failure_tested:false,production_serialization_proven:false,atomic_cas_guarantee_proven:false});
  }catch{
   return stopped(`${phase}_UNCONFIRMED`,{attempted_mutations:attemptedMutations});
  }
 }
 return Object.freeze({run:input=>perform(input,false),resumeFromBootstrap:input=>perform(input,true),inspect});
}
