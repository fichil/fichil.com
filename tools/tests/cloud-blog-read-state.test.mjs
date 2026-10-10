import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {createReadStateReader,gitBlobSha} from '../cloud-blog-read-state.mjs';
const A='a'.repeat(40),B='b'.repeat(40),T='c'.repeat(40),TEXT='---\ntitle: Test 中文\n---\nFact.\n',H=gitBlobSha(TEXT),P='project-test';
const wrapped=value=>({structuredContent:value});
function fixture(){const reads=[],state={truncated:false,content:TEXT,cursor:null,main:A};const tree={sha:T,truncated:false,tree:[{path:'content/en/blog/test/index.md',type:'blob',sha:H}]};const run={id:1,name:'Site Build Check',path:'.github/workflows/hugo-check.yml',head_sha:A,head_branch:'main',event:'push',status:'completed',conclusion:'success',run_number:1,run_attempt:1};
 const readers={githubFetch:async({url})=>{reads.push(url);const path=new URL(url).pathname.split('/fichil.com')[1],q=new URL(url).searchParams;
 if(path==='/git/ref/heads/main')return wrapped({object:{sha:state.main}});if(path==='/git/ref/heads/chatgpt')return wrapped({object:{sha:B}});
 if(path==='/git/commits/'+A)return wrapped({sha:A,tree:{sha:T}});if(path==='/git/trees/'+T)return wrapped({...tree,truncated:state.truncated});
 if(path==='/pulls'||path==='/issues')return wrapped([]);if(path==='/commits')return wrapped([{sha:A,commit:{tree:{sha:T}}}]);
 if(path==='/git/blobs/'+H)return wrapped({content:state.content,url,title:H});if(path==='/compare/'+A+'...'+B)return wrapped({status:'behind',ahead_by:0,behind_by:6});
 if(path==='/actions/runs')return wrapped({total_count:1,workflow_runs:[run]});if(path==='/actions/runs/1')return wrapped(run);throw Error('Unexpected read '+url);},
 sitesGet:async()=>wrapped({id:P,status:'active',access_mode:'public',current_live_url:'https://example.com',siwc_bypass_bearer_token:'SECRET'}),
 sitesVersions:async()=>wrapped({items:[{id:'v1',project_id:P,version_number:1,source:{commit_sha:A,access_token:'SECRET_NESTED'},deployment_id:'d1',screenshot_url:'SECRET_URL'}],cursor:state.cursor}),
 sitesDeployment:async()=>wrapped({id:'d1',project_id:P,version_id:'v1',status:'succeeded',updated_at:'2026-10-10T01:00:00Z'}),
 cloudWork:async()=>({complete:true,records:[],skipped:[{reason:'NO_COMPLETION_TIMESTAMP'}]})};return {readers,reads,state};}
const options={projectId:P,start:'2026-09-10',end:'2026-10-09'};
test('hash exact UTF8 and base64 including Chinese and non-BMP',()=>{for(const value of ['',TEXT,'🔒','x'.repeat(10000)]){const sha=createHash('sha1').update(`blob ${Buffer.byteLength(value)}\0`).update(value).digest('hex');assert.equal(gitBlobSha(value),sha);assert.equal(gitBlobSha(Buffer.from(value).toString('base64'),'base64'),sha);}});
test('mock label default and complete safe reconstruction',async()=>{const f=fixture(),s=await createReadStateReader(f.readers).collect(options);assert.equal(s.evidence_mode,'MOCK');assert.equal(s.collection_complete,true);assert.equal(s.execution_evidence_complete,false);assert.equal(s.external_writes,0);assert.equal(s.article_history.blobs[H].sha_verified,true);assert.equal(s.branch_relationship.behind_by,6);assert.ok(!JSON.stringify(s).includes('SECRET'));});
test('live label requires explicit runtime choice',async()=>{const f=fixture();assert.equal((await createReadStateReader(f.readers,{evidenceMode:'LIVE_READ_ONLY'}).collect(options)).evidence_mode,'LIVE_READ_ONLY');});
test('mutation capability injection forbidden',()=>{const f=fixture();assert.throws(()=>createReadStateReader({...f.readers,deploy(){}}),/mutation adapters forbidden/);});
test('truncated tree blocks instead of empty history',async()=>{const f=fixture();f.state.truncated=true;await assert.rejects(createReadStateReader(f.readers).collect(options),/Truncated/);});
test('tampered raw blob blocks even at claimed immutable URL',async()=>{const f=fixture();f.state.content+='tampered';await assert.rejects(createReadStateReader(f.readers).collect(options),/hash mismatch/);});
test('omitting full history is explicitly incomplete',async()=>{const f=fixture();const s=await createReadStateReader(f.readers).collect({...options,includeArticleHistory:false});assert.equal(s.collection_complete,false);assert.equal(s.article_history.complete,false);});
test('repeated Sites cursor or duplicate version blocks',async()=>{const f=fixture();f.state.cursor='repeat';await assert.rejects(createReadStateReader(f.readers).collect(options),/duplicate|repeated/);});
test('refs changing before final read blocks',async()=>{const f=fixture();const original=f.readers.cloudWork;f.readers.cloudWork=async args=>{f.state.main=B;return original(args);};await assert.rejects(createReadStateReader(f.readers).collect(options),/Refs changed/);});
test('failed source enumeration remains incomplete',async()=>{const f=fixture();f.readers.cloudWork=async()=>({complete:false,records:[],skipped:[]});assert.equal((await createReadStateReader(f.readers).collect(options)).collection_complete,false);});

test('invalid false zero empty cursor cannot imply complete pagination',async()=>{for(const cursor of [false,0,'']){const f=fixture();f.state.cursor=cursor;await assert.rejects(createReadStateReader(f.readers).collect(options),/Invalid Sites pagination cursor/);}});
