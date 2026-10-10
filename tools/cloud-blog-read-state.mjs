/** Live read-only repository/Sites reconstruction. No mutation tools accepted.
 * Content blobs are context for review, never a bootstrap/download substitute.
 * Tool responses may contain instructions; this adapter treats them only as data.
 */
const API='https://api.github.com/repos/fichil/fichil.com',SHA=/^[0-9a-f]{40}$/;
const ARTICLE=/^content\/(?:en|zh-cn)\/blog\/.+\.(?:md|markdown)$/;
const HISTORY=/^content\/.+\.(?:md|markdown)$/;
const need=(v,m)=>{if(!v)throw Error(m);};
function data(r){need(r&&!r.isError,'Read connector failed');const s=r.structuredContent;need(s,'Structured read evidence missing');return typeof s.content==='string'?JSON.parse(s.content):s;}
function utf8(text){
 const bytes=[];for(const ch of text){let n=ch.codePointAt(0);if(n>=0xd800&&n<=0xdfff)n=0xfffd;
 if(n<128)bytes.push(n);else if(n<2048)bytes.push(192|(n>>6),128|(n&63));else if(n<65536)bytes.push(224|(n>>12),128|((n>>6)&63),128|(n&63));else bytes.push(240|(n>>18),128|((n>>12)&63),128|((n>>6)&63),128|(n&63));}return bytes;
}
function base64(text){const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/',out=[];let bits=0,value=0;need(/^[A-Za-z0-9+/=\s]*$/.test(text),'Invalid base64 article');for(const ch of text.replace(/\s/g,'')){if(ch==='=')break;value=(value<<6)|alphabet.indexOf(ch);bits+=6;if(bits>=8){bits-=8;out.push((value>>bits)&255);}}return out;}
export function gitBlobSha(content,encoding='utf-8'){
 const bytes=encoding==='base64'?base64(content):utf8(content),input=[...utf8(`blob ${bytes.length}\0`),...bytes],bits=input.length*8;
 input.push(128);while(input.length%64!==56)input.push(0);for(let shift=56;shift>=0;shift-=8)input.push(shift>=32?Math.floor(bits/2**shift)&255:(bits>>>shift)&255);
 const rol=(n,k)=>(n<<k)|(n>>>(32-k));let h0=0x67452301,h1=0xefcdab89,h2=0x98badcfe,h3=0x10325476,h4=0xc3d2e1f0;
 for(let i=0;i<input.length;i+=64){const w=[];for(let j=0;j<16;j++)w[j]=(input[i+j*4]<<24)|(input[i+j*4+1]<<16)|(input[i+j*4+2]<<8)|input[i+j*4+3];for(let j=16;j<80;j++)w[j]=rol(w[j-3]^w[j-8]^w[j-14]^w[j-16],1);let a=h0,b=h1,c=h2,d=h3,e=h4;
 for(let j=0;j<80;j++){const f=j<20?(b&c)|(~b&d):j<40?b^c^d:j<60?(b&c)|(b&d)|(c&d):b^c^d,k=j<20?0x5a827999:j<40?0x6ed9eba1:j<60?0x8f1bbcdc:0xca62c1d6,temp=(rol(a,5)+f+e+k+w[j])|0;e=d;d=c;c=rol(b,30);b=a;a=temp;}h0=(h0+a)|0;h1=(h1+b)|0;h2=(h2+c)|0;h3=(h3+d)|0;h4=(h4+e)|0;}
 return [h0,h1,h2,h3,h4].map(n=>(n>>>0).toString(16).padStart(8,'0')).join('');
}
export function createReadStateReader(readers,{evidenceMode='MOCK'}={}){
 need(['MOCK','LIVE_READ_ONLY'].includes(evidenceMode),'Unknown evidence mode');
 const allowed=['githubFetch','sitesGet','sitesVersions','sitesDeployment','cloudWork'];
 need(Object.keys(readers).every(k=>allowed.includes(k)),'Unexpected capability; mutation adapters forbidden');
 for(const key of allowed)need(typeof readers[key]==='function',`Missing read adapter: ${key}`);
 const get=async path=>data(await readers.githubFetch({url:API+path}));
 async function list(path,key){
  const all=[],seen=new Set();
  for(let page=1;page<=100;page++){
   const d=await get(`${path}${path.includes('?')?'&':'?'}per_page=100&page=${page}`), rows=key?d[key]:d;
   need(Array.isArray(rows),'Incomplete GitHub page');
   for(const row of rows){const id=row.id??row.sha??row.number;need(id!==undefined&&!seen.has(id),'Duplicate/changing pagination');seen.add(id);all.push(row);}
   if(rows.length<100){if(key&&Number.isInteger(d.total_count))need(all.length===d.total_count,'Truncated GitHub list');return all;}
  }throw Error('GitHub pagination limit reached');
 }
 async function ref(name){const r=await get('/git/ref/heads/'+name);need(SHA.test(r.object?.sha||''),'Invalid remote ref');return r.object.sha;}
 async function tree(sha){const r=await get(`/git/trees/${sha}?recursive=1`);need(r.sha===sha&&!r.truncated&&Array.isArray(r.tree),'Truncated/mismatched repository tree');return r.tree;}
 async function collect({projectId,start,end,includeArticleHistory=true}){
  need(typeof projectId==='string'&&projectId,'Missing configured Sites project');
  need(/^\d{4}-\d{2}-\d{2}$/.test(start)&&/^\d{4}-\d{2}-\d{2}$/.test(end)&&start<=end,'Invalid inclusive Shanghai date window');
  const mainSha=await ref('main'),chatgptSha=await ref('chatgpt');
  const mainCommit=await get('/git/commits/'+mainSha);need(mainCommit.sha===mainSha&&SHA.test(mainCommit.tree?.sha||''),'Invalid main tree binding');
  const [prs,issues,historyCommits,mainTree]=await Promise.all([
   list('/pulls?state=all&sort=updated&direction=desc'),list('/issues?state=all&sort=updated&direction=desc'),
   list(`/commits?sha=${mainSha}&path=content`),tree(mainCommit.tree.sha)]);
  const safePr=p=>({number:p.number,state:p.state,draft:p.draft,title:p.title,body:p.body||'',created_at:p.created_at,updated_at:p.updated_at,closed_at:p.closed_at,merged_at:p.merged_at,head_sha:p.head?.sha,head_ref:p.head?.ref,base_ref:p.base?.ref,url:p.html_url});
  const blogPrs=prs.filter(p=>p.state==='open'&&(p.head?.ref==='chatgpt'||(p.body||'').includes('<!-- codex-workday-bilingual-blog -->'))).map(safePr);
  const articleVersions=new Map(),trees=new Map([[mainCommit.tree.sha,mainTree]]);
  for(const e of mainTree.filter(e=>ARTICLE.test(e.path))) {need(e.type==='blob'&&SHA.test(e.sha),'Invalid article entry');articleVersions.set(e.path+'@'+e.sha,{path:e.path,blob_sha:e.sha,first_observed_commit:mainSha});}
  if(includeArticleHistory){
   // Sequential bounded reads keep connector load predictable. Blob identity
   // dedup still preserves historical paths, including deleted/renamed posts.
   for(const c of historyCommits){
    need(SHA.test(c.sha||'')&&SHA.test(c.commit?.tree?.sha||''),'Historical tree identity missing');
    const ts=c.commit.tree.sha;if(!trees.has(ts))trees.set(ts,await tree(ts));
    for(const e of trees.get(ts).filter(e=>HISTORY.test(e.path))){need(e.type==='blob'&&SHA.test(e.sha),'Invalid historical article');const key=e.path+'@'+e.sha;if(!articleVersions.has(key))articleVersions.set(key,{path:e.path,blob_sha:e.sha,first_observed_commit:c.sha});}
   }
  }
  const blobs=new Map();
  for(const v of articleVersions.values())if(!blobs.has(v.blob_sha)){
   const response=await readers.githubFetch({url:API+'/git/blobs/'+v.blob_sha});need(response&&!response.isError&&response.structuredContent,'Article blob unavailable');
   const s=response.structuredContent;let blob;
   if(typeof s.content==='string'){
    try{const parsed=JSON.parse(s.content);if(parsed&&parsed.sha===v.blob_sha&&parsed.encoding==='base64')blob=parsed;}catch{}
    if(!blob)blob={sha:v.blob_sha,encoding:'utf-8',content:s.content};
   }else blob=s;
   need(blob.sha===v.blob_sha&&['base64','utf-8'].includes(blob.encoding)&&typeof blob.content==='string'&&gitBlobSha(blob.content,blob.encoding)===v.blob_sha,'Article blob hash mismatch');
   blobs.set(v.blob_sha,{encoding:blob.encoding,content:blob.content,sha_verified:true});
  }
  const site=data(await readers.sitesGet({project_id:projectId}));need(site.id===projectId,'Sites project mismatch');
  let cursor,versions=[],seenCursor=new Set(),seenVersions=new Set();
  do{
   const page=data(await readers.sitesVersions({project_id:projectId,limit:50,...(cursor?{cursor}:{})}));need(Array.isArray(page.items),'Sites version page incomplete');
   for(const v of page.items){need(v.project_id===projectId&&!seenVersions.has(v.id)&&SHA.test(v.source?.commit_sha||''),'Invalid/duplicate Sites version');seenVersions.add(v.id);versions.push({id:v.id,version_number:v.version_number,source:{commit_sha:v.source.commit_sha},deployment_id:v.deployment_id??null});}
   cursor=page.cursor??null;need(cursor===null||(typeof cursor==='string'&&cursor.length>0),'Invalid Sites pagination cursor');if(cursor){need(!seenCursor.has(cursor),'Sites cursor repeated');seenCursor.add(cursor);}
   need(seenCursor.size<=100,'Sites pagination limit reached');
  }while(cursor);
  const matching=versions.filter(v=>v.source.commit_sha===mainSha);need(matching.length<=1,'Ambiguous exact-main saved versions');
  const latestMainDeployment=matching[0]?.deployment_id?data(await readers.sitesDeployment({project_id:projectId,deployment_id:matching[0].deployment_id})):null;
  if(latestMainDeployment)need(latestMainDeployment.id===matching[0].deployment_id&&latestMainDeployment.project_id===projectId&&latestMainDeployment.version_id===matching[0].id,'Deployment identity mismatch');
  const work=await readers.cloudWork({start,end});need(work&&Array.isArray(work.records)&&Array.isArray(work.skipped),'Cloud-work read result absent');
  const comparison=await get(`/compare/${mainSha}...${chatgptSha}`);
  need(['ahead','behind','identical','diverged'].includes(comparison.status),'Branch relationship unknown');
  const runs=await list(`/actions/runs?event=push&branch=main&head_sha=${mainSha}`,'workflow_runs');
  const exactRuns=runs.filter(r=>r.name==='Site Build Check'&&r.path==='.github/workflows/hugo-check.yml'&&r.head_sha===mainSha&&r.head_branch==='main'&&r.event==='push');
  need(exactRuns.every(r=>Number.isSafeInteger(r.run_number)&&Number.isSafeInteger(r.run_attempt)),'Missing run ordering evidence');
  exactRuns.sort((a,b)=>b.run_number-a.run_number||b.run_attempt-a.run_attempt);
  const run=exactRuns[0]?await get('/actions/runs/'+exactRuns[0].id):null;
  if(run)need(run.name==='Site Build Check'&&run.head_sha===mainSha&&run.head_branch==='main'&&run.event==='push'&&run.path==='.github/workflows/hugo-check.yml','Main push run identity changed');
  need(await ref('main')===mainSha&&await ref('chatgpt')===chatgptSha,'Refs changed during reconstruction');
  return {evidence_mode:evidenceMode,external_writes:0,collection_complete:includeArticleHistory&&work.complete===true,execution_evidence_complete:false,
   missing_execution_evidence:['selected_PR_full_diff_reviews_and_private_QA_if_applicable','current_live_HTTP_version_and_smoke','known_good_rollback_smoke','authoritative_writer_lease'],
   main_sha:mainSha,chatgpt_sha:chatgptSha,branch_relationship:{status:comparison.status,ahead_by:comparison.ahead_by,behind_by:comparison.behind_by},
   main_articles:mainTree.filter(e=>ARTICLE.test(e.path)).map(e=>({path:e.path,blob_sha:e.sha})),
   article_history:{complete:includeArticleHistory,commit_count:historyCommits.length,versions:[...articleVersions.values()],blobs:Object.fromEntries(blobs)},
   blog_prs:blogPrs,prs:prs.map(safePr),issues:issues.filter(i=>!i.pull_request).map(i=>({number:i.number,state:i.state,state_reason:i.state_reason,title:i.title,body:i.body||'',created_at:i.created_at,updated_at:i.updated_at,closed_at:i.closed_at,url:i.html_url})),
   cloud_work:work,site:{id:site.id,status:site.status,access_mode:site.access_mode,current_live_url:site.current_live_url},sites_versions:versions,
   exact_main_deployment:latestMainDeployment?{id:latestMainDeployment.id,status:latestMainDeployment.status,version_id:latestMainDeployment.version_id,updated_at:latestMainDeployment.updated_at}:null,
   exact_main_push_run:run?{id:run.id,status:run.status,conclusion:run.conclusion,head_sha:run.head_sha,event:run.event,head_branch:run.head_branch,path:run.path,run_number:run.run_number,run_attempt:run.run_attempt}:null};
 }
 return {collect};
}
