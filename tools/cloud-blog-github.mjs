/** Credential-free supported connector adapter. Defaults to nonmutating rehearsal.
 * The injected tools object is supplied by the cloud assistant runtime.
 */
const REPO='fichil/fichil.com', API=`https://api.github.com/repos/${REPO}`, SHA=/^[0-9a-f]{40}$/;
export class GateError extends Error {}
function need(v,m){if(!v)throw new GateError(m);}
export function decode(r){need(!r?.isError,'Connector failed'); const d=r?.structuredContent;need(d,'No structured evidence');return typeof d.content==='string'?JSON.parse(d.content):d;}
export function createRunner(tools,{execute=false}={}){
 const call=async(n,a)=>decode(await tools[`mcp__codex_apps__github_${n}`](a));
 const get=p=>call('fetch',{url:API+p});
 async function list(path,key){
  const rows=[];
  for(let page=1;page<=100;page++){
   const data=await get(`${path}${path.includes('?')?'&':'?'}per_page=100&page=${page}`), batch=key?data[key]:data;
   need(Array.isArray(batch),'Incomplete list');rows.push(...batch);
   if(batch.length<100){if(key&&Number.isInteger(data.total_count))need(rows.length===data.total_count,'List changed/truncated');return rows;}
  }throw new GateError('Pagination limit exceeded');
 }
 async function main(){const r=await get('/git/ref/heads/main');need(SHA.test(r.object?.sha),'Invalid main ref');return r.object.sha;}
 async function pushEvidence(sha){
  need(SHA.test(sha),'Invalid target');
  const runs=await list(`/actions/runs?event=push&branch=main&head_sha=${sha}`,'workflow_runs');
  const matches=runs.filter(r=>r.name==='Site Build Check'&&r.event==='push'&&r.head_branch==='main'&&r.head_sha===sha&&r.path==='.github/workflows/hugo-check.yml');
  need(matches.length,'Exact main push run missing');need(matches.every(r=>Number.isInteger(r.run_number)&&Number.isInteger(r.run_attempt)),'Missing run identity');
  matches.sort((a,b)=>b.run_number-a.run_number||b.run_attempt-a.run_attempt);
  const r=await get(`/actions/runs/${matches[0].id}`);
  need(r.head_sha===sha&&r.event==='push'&&r.head_branch==='main'&&r.name==='Site Build Check'&&r.path==='.github/workflows/hugo-check.yml','Run identity changed');
  need(r.status==='completed'&&r.conclusion==='success','Main push CI not green');return r;
 }
 async function mergeSnapshot(n,qa){
  need(Number.isInteger(n)&&n>0,'Invalid PR');const pr=await get(`/pulls/${n}`);
  need(pr.state==='open'&&!pr.merged,'PR not open');
  need(pr.base?.ref==='main'&&pr.head?.ref==='chatgpt'&&pr.head.repo?.full_name===REPO&&pr.base.repo?.full_name===REPO,'Wrong PR source/destination');
  need(pr.auto_merge===null,'Existing auto-merge needs owner recovery');
  need(qa?.status==='approved'&&qa.user_approval_verified===true&&qa.skill_verify_review===true&&SHA.test(qa.head_sha)&&/^[0-9a-f]{64}$/.test(qa.content_sha256)&&/^[0-9a-f]{64}$/.test(qa.qa_report_sha256),'Verified exact approval required');
  need(pr.head.sha===qa.head_sha,'Stale approved head');const body=pr.body||'';
  const marker=`<!-- fichil-content-qa-approval:v1 status=approved head_sha=${qa.head_sha} content_sha256=${qa.content_sha256} qa_report_sha256=${qa.qa_report_sha256} -->`;
  need(body.split('<!-- codex-workday-bilingual-blog -->').length===2&&body.split('<!-- fichil-content-qa-approval:v1 ').length===2&&body.includes(marker),'Marker mismatch');
  const files=await list(`/pulls/${n}/files`);need(files.length===pr.changed_files&&new Set(files.map(f=>f.filename)).size===files.length,'Incomplete/duplicate diff');const pairs=new Map();
  for(const f of files){const m=/^content\/(en|zh-cn)\/blog\/([a-z0-9]+(?:-[a-z0-9]+)*)\/index\.md$/.exec(f.filename);need(m&&!['removed','renamed'].includes(f.status)&&(qa.recovery===true||f.status==='added'),'Invalid article path/change');if(!pairs.has(m[2]))pairs.set(m[2],new Set());pairs.get(m[2]).add(m[1]);}
  need(pairs.size&&(qa.recovery===true||pairs.size===1),'Invalid topic count');const issues=qa.issues||{};
  need(Object.keys(issues).length===pairs.size&&new Set(Object.values(issues)).size===pairs.size,'Unique Issues required');
  for(const [slug,langs] of pairs){need(langs.size===2&&Number.isInteger(issues[slug])&&issues[slug]>0,'Unpaired article/missing Issue');const issue=await get(`/issues/${issues[slug]}`);need(issue.number===issues[slug]&&!issue.pull_request&&issue.state==='open','Issue not open');need(new RegExp(`(?:closes|fixes|resolves)\\s+#${issues[slug]}\\b`,'i').test(body),'Closure link missing');}
  const reviews=await list(`/pulls/${n}/reviews`), latest=new Map();
  for(const r of reviews.sort((a,b)=>a.id-b.id))if(['APPROVED','CHANGES_REQUESTED','DISMISSED'].includes(r.state))latest.set(r.user?.login,r.state);
  need(![...latest.values()].includes('CHANGES_REQUESTED'),'Changes requested');
  const main_sha=await main(), cmp=await get(`/compare/${main_sha}...${qa.head_sha}`);
  need(['ahead','identical'].includes(cmp.status)&&cmp.behind_by===0,'Branch update and new review required');
  need(pr.mergeable===true&&pr.mergeable_state!=='dirty','Mergeability unknown/conflicting');
  const checks=await list(`/commits/${qa.head_sha}/check-runs?filter=latest`,'check_runs');
  for(const name of ['build','sites']){const cs=checks.filter(c=>c.name===name&&c.app?.id===15368&&c.head_sha===qa.head_sha).sort((a,b)=>b.id-a.id);need(cs.length&&cs[0].status==='completed'&&cs[0].conclusion==='success',`${name} missing/not green`);}
  return {pr,main_sha};
 }
 async function recover(n,head){
  const pr=await get(`/pulls/${n}`);
  if(pr.merged===true){need(pr.head?.sha===head&&SHA.test(pr.merge_commit_sha),'Unexpected merged head');const m=await main(),c=await get(`/compare/${pr.merge_commit_sha}...${m}`);need(['ahead','identical'].includes(c.status)&&c.behind_by===0,'Merge absent from main');return {status:'MERGED',merge_sha:pr.merge_commit_sha,main_sha:m};}
  need(pr.state==='open'&&pr.auto_merge===null,'Merge outcome unresolved');
  if(execute&&pr.draft!==true){await call('convert_pull_request_to_draft',{repository_full_name:REPO,pr_number:n});const r=await get(`/pulls/${n}`);need(r.draft===true&&r.state==='open','Draft recovery unconfirmed');}
  return {status:pr.head?.sha===head?'OPEN_REVALIDATE_BEFORE_RETRY':'AWAITING_NEW_REVIEW'};
 }
 async function mergeApproved(n,verifyQA){
  const qa=await verifyQA();
  const observed=await get(`/pulls/${n}`);
  if(observed.merged===true)return recover(n,qa.head_sha);
  let first;
  try{first=await mergeSnapshot(n,qa);}
  catch(error){if(execute)error.recovery=await recover(n,qa.head_sha);throw error;}
  const intent={repository_full_name:REPO,pr_number:n,expected_head_sha:qa.head_sha,merge_method:'merge'};
  if(!execute)return {status:'REHEARSAL_READY',intent,main_sha:first.main_sha};
  try{
   if(first.pr.draft)await call('mark_pull_request_ready_for_review',{repository_full_name:REPO,pr_number:n});
   const freshQA=await verifyQA();need(freshQA.head_sha===qa.head_sha,'Head changed after Ready');
   const fresh=await mergeSnapshot(n,freshQA);need(fresh.pr.draft===false,'Ready unconfirmed');
   const response=await call('merge_pull_request',intent), result=await recover(n,qa.head_sha);
   return response.merged===false&&result.status!=='MERGED'?{...result,rejected:true}:result;
  }catch(error){const result=await recover(n,qa.head_sha);return {...result,reconciliation:true,reason:error instanceof GateError?error.message:'Connector outcome uncertain'};}
 }
 return {get,list,main,pushEvidence,mergeSnapshot,mergeApproved,recover};
}
