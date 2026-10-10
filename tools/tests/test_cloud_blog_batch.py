import copy
from datetime import datetime
import io
import json
from pathlib import Path
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).parents[1]))
import cloud_blog_batch as b
A,B,H='a'*40,'b'*40,'c'*64
NOW=datetime.fromisoformat('2026-10-09T09:10:00+08:00')
class Ports:
    evidence_mode='MOCK'
    def __init__(self):
        self.reads,self.phases,self.source_calls=0,[],0
        self.state=dict(main_sha=A,chatgpt_sha=B,live_sha=A,complete=True,complete_collections=list(b.REQUIRED_COLLECTIONS),main_articles=[],article_history=[],blog_prs=[],issues=[],sites_versions=[])
        self.candidates=[dict(source_id='github:1',topic_id='topic',completed_at='2026-10-08T12:00:00+08:00',completed=True,evidence_complete=True,public_safe=True,reusable=True,dedup_passed=True,scores=[30,25,20,15,10])]
        self.source_complete=True
    def snapshot(self):
        self.reads+=1
        return copy.deepcopy(self.state)
    def sources(self,start,end):
        self.source_calls+=1
        assert (start,end)==('2026-09-09','2026-10-08')
        return dict(complete=self.source_complete,families=['cloud_work','github'],candidates=self.candidates)
    def semantic_review(self,candidates,history,phase):
        self.phases.append(phase)
        return dict(complete=True,candidates=copy.deepcopy(candidates))
    def inspect_existing(self,pr,snapshot): return dict(status='AWAITING_EXACT_HEAD_APPROVAL',head_sha=B)
    def find_operation(self,operation): return dict(complete=True,items=[])
class BatchTests(unittest.TestCase):
    def run_batch(self,ports=None,operation=None):
        with tempfile.TemporaryDirectory() as root: return b.BatchRunner(ports or Ports(),root).rehearse(NOW,operation)
    def test_schedule(self):
        self.assertTrue(b.due(NOW)); self.assertFalse(b.due(datetime.fromisoformat('2026-10-10T09:10:00+08:00')))
        self.assertEqual(b.run_key(NOW),'fichil-blog:2026-10-09')
    def test_top_one_twice_semantic_no_writes(self):
        p=Ports(); p.candidates.append(dict(p.candidates[0],source_id='github:2',scores=[20,20,20,10,5])); r=self.run_batch(p)
        self.assertEqual(r.content['source_id'],'github:1'); self.assertEqual(r.content['status'],'TOPIC_SELECTED_NOT_WRITTEN')
        self.assertEqual(p.phases,['before_scoring','before_writing']); self.assertEqual(r.external_writes,0); self.assertEqual(r.evidence_mode,'MOCK')
    def test_empty_distinct_from_incomplete(self):
        p=Ports(); p.candidates=[]; self.assertEqual(self.run_batch(p).content['status'],'NO_NEW_TOPIC')
        p.source_complete=False; r=self.run_batch(p); self.assertEqual(r.content['status'],'TECHNICAL_FAILURE'); self.assertEqual(r.production['status'],'BLOCKED')
    def test_pending_review_no_new_source_work(self):
        p=Ports(); p.state['blog_prs']=[{'number':1}]; r=self.run_batch(p)
        self.assertEqual(r.content['status'],'AWAITING_EXACT_HEAD_APPROVAL'); self.assertEqual(p.source_calls,0); self.assertEqual(r.production['status'],'NO_CHANGE')
    def test_no_topic_still_plans_safe_main(self):
        p=Ports(); p.candidates=[]; p.state['live_sha']=B; self.assertEqual(self.run_batch(p).production['status'],'RELEASE_GATES_REQUIRED')
    def test_second_dedup_blocks(self):
        p=Ports(); original=p.semantic_review; p.semantic_review=lambda cs,hs,phase: original([] if phase=='before_writing' else cs,hs,phase)
        self.assertEqual(self.run_batch(p).content['reason'],'SECOND_DEDUP_REJECTED')
    def test_in_place_second_review_mutation_blocks(self):
        p=Ports(); original=p.semantic_review
        def review(cs,hs,phase):
            if phase=='before_writing': cs[0]['scores']=[0,0,0,0,0]
            return original(cs,hs,phase)
        p.semantic_review=review
        self.assertEqual(self.run_batch(p).content['status'],'TECHNICAL_FAILURE')
    def test_shared_mutable_snapshot_race_blocks(self):
        p=Ports()
        def snapshot():
            p.reads+=1
            if p.reads>1: p.state['main_sha']=B
            return p.state
        p.snapshot=snapshot
        self.assertEqual(self.run_batch(p).content['status'],'TECHNICAL_FAILURE')
    def test_main_race_blocks(self):
        p=Ports(); original=p.snapshot
        def snapshot():
            out=original()
            if p.reads>1: out['main_sha']=B
            return out
        p.snapshot=snapshot; self.assertEqual(self.run_batch(p).content['status'],'TECHNICAL_FAILURE')
    def test_partial_history_blocks(self):
        p=Ports(); p.state['complete_collections'].remove('article_history'); self.assertEqual(self.run_batch(p).content['status'],'TECHNICAL_FAILURE')
    def test_multiple_prs_block(self):
        p=Ports(); p.state['blog_prs']=[{},{}]; self.assertEqual(self.run_batch(p).content['status'],'TECHNICAL_FAILURE')
    def test_unknown_create_never_retries(self):
        p=Ports(); r=self.run_batch(p,dict(kind='draft_pr',key='run:1',target=B))
        self.assertEqual(r.content['status'],'UNKNOWN_DO_NOT_RETRY'); self.assertEqual(p.source_calls,0)
    def test_restart_clean_workspaces(self): self.assertEqual(self.run_batch(),self.run_batch())
    def test_local_overlap(self):
        with tempfile.TemporaryDirectory() as root:
            with b.local_guard(root):
                with self.assertRaises(b.GateError):
                    with b.local_guard(root): pass
    def test_unique_reconcile(self):
        op=dict(kind='sites_version',key='run:1',target=A); row=dict(key='run:1',target=A,id=7)
        self.assertEqual(b.reconcile_operation(op,dict(complete=True,items=[row]))['id'],7)
        for evidence in [dict(complete=False,items=[]),dict(complete=True,items=[row,row])]:
            with self.assertRaises(b.GateError): b.reconcile_operation(op,evidence)
class RestoreTests(unittest.TestCase):
    def archive(self,root,name='safe.txt',kind=None):
        path=Path(root)/'bundle.tar'
        with tarfile.open(path,'w') as bundle:
            member=tarfile.TarInfo(name); member.size=2
            if kind: member.type=kind; member.linkname='safe.txt'; member.size=0
            bundle.addfile(member,io.BytesIO(b'ok') if not kind else None)
        return path,b.digest(path)
    def test_restore_and_freshness(self):
        with tempfile.TemporaryDirectory() as root:
            file,sha=self.archive(root); out=b.restore_archive(file,sha,Path(root)/'restore')
            self.assertEqual((out/'safe.txt').read_text(),'ok'); self.assertEqual((out/'safe.txt').stat().st_mode&0o777,0o600)
            with self.assertRaises(b.GateError): b.restore_archive(file,sha,out)
            with self.assertRaises(b.GateError): b.restore_archive(file,'0'*64,Path(root)/'bad')
    def test_traversal_links_rejected(self):
        for name,kind in [('../escape',None),('/absolute',None),('link',tarfile.SYMTYPE),('hard',tarfile.LNKTYPE)]:
            with tempfile.TemporaryDirectory() as root:
                file,sha=self.archive(root,name,kind)
                with self.assertRaises(b.GateError): b.restore_archive(file,sha,Path(root)/'restore')
                self.assertFalse((Path(root)/'restore').exists())
    def test_archive_replacement_after_hash_uses_verified_snapshot(self):
        with tempfile.TemporaryDirectory() as root:
            archive,expected=self.archive(root)
            real_hasher=b.hashlib.sha256
            class SwappingHasher:
                def __init__(self): self.inner=real_hasher()
                def update(self,data): self.inner.update(data)
                def hexdigest(self):
                    with tarfile.open(archive,'w') as bundle:
                        member=tarfile.TarInfo('safe.txt'); member.size=8
                        bundle.addfile(member,io.BytesIO(b'replaced'))
                    return self.inner.hexdigest()
            with patch.object(b.hashlib,'sha256',SwappingHasher):
                out=b.restore_archive(archive,expected,Path(root)/'restore')
            self.assertEqual((out/'safe.txt').read_text(),'ok')
    def test_pax_metadata_decompression_is_bounded(self):
        with tempfile.TemporaryDirectory() as root:
            path=Path(root)/'metadata.tar.gz'
            with tarfile.open(path,'w:gz',format=tarfile.PAX_FORMAT) as bundle:
                member=tarfile.TarInfo('empty'); member.pax_headers={'comment':'x'*1000000}
                bundle.addfile(member,io.BytesIO())
            with self.assertRaises(b.GateError): b.restore_archive(path,b.digest(path),Path(root)/'restore',max_bytes=10000)
    def test_size_bound(self):
        with tempfile.TemporaryDirectory() as root:
            file,sha=self.archive(root)
            with self.assertRaises(b.GateError): b.restore_archive(file,sha,Path(root)/'restore',max_bytes=1)
    def packet(self,root):
        root=Path(root); files={}
        for name in b.PRIVATE_PACKET_FILES|{'en390.png','en360.png','zh390.png','zh360.png'}:
            (root/name).write_bytes(b'fixture only, not actual screenshots'); files[name]=b.digest(root/name)
        shots=[dict(locale=l,width=w,height=h,path=n,inspected=True) for (l,w,h),n in zip(sorted(b.MOBILE),['en360.png','en390.png','zh360.png','zh390.png'])]
        return dict(head_sha=A,content_sha256=H,files=files,screenshots=shots)
    def test_packet_restore_not_approval(self):
        with tempfile.TemporaryDirectory() as root:
            manifest=self.packet(root); self.assertEqual(b.verify_packet(root,manifest,head_sha=A,content_sha256=H)['status'],'RESTORED_REVERIFY_REQUIRED')
            with self.assertRaises(b.GateError): b.verify_packet(root,manifest,head_sha=B,content_sha256=H)
            (Path(root)/'source-evidence.json').write_text('tampered')
            with self.assertRaises(b.GateError): b.verify_packet(root,manifest,head_sha=A,content_sha256=H)
    def test_private_fixture_reacquired_in_two_fresh_directories(self):
        with tempfile.TemporaryDirectory() as root:
            root=Path(root); source=root/'private'; source.mkdir(); manifest=self.packet(source)
            (source/'manifest.json').write_text(json.dumps(manifest))
            archive=root/'evidence.tar'
            with tarfile.open(archive,'w') as bundle:
                for file in sorted(source.iterdir()): bundle.add(file,arcname=file.name)
            for name in ['first-run','restart-run']:
                target=b.restore_archive(archive,b.digest(archive),root/name)
                restored=json.loads((target/'manifest.json').read_text())
                self.assertEqual(b.verify_packet(target,restored,head_sha=A,content_sha256=H)['status'],'RESTORED_REVERIFY_REQUIRED')
    def test_reused_screenshot_bytes_path_blocks(self):
        with tempfile.TemporaryDirectory() as root:
            manifest=self.packet(root)
            manifest['screenshots'][0]['path']=manifest['screenshots'][1]['path']
            with self.assertRaises(b.GateError): b.verify_packet(root,manifest,head_sha=A,content_sha256=H)
    def test_uninspected_screenshot_blocks(self):
        with tempfile.TemporaryDirectory() as root:
            manifest=self.packet(root); manifest['screenshots'][0]['inspected']=False
            with self.assertRaises(b.GateError): b.verify_packet(root,manifest,head_sha=A,content_sha256=H)
class DeploymentTests(unittest.TestCase):
    def test_restart_preserves_window(self):
        record=dict(deployment_id='d1',target_sha=A)
        remote=dict(record,status='succeeded',completed_at='2026-10-09T09:08:00+08:00')
        result=b.resume_deployment(record,remote,NOW)
        self.assertEqual(result['remaining_seconds'],60)
        self.assertFalse(result['reuse_pre_restart_samples'])
        remote['completed_at']='2026-10-09T09:06:00+08:00'
        self.assertEqual(b.resume_deployment(record,remote,NOW)['remaining_seconds'],0)
    def test_missing_timing_and_changed_identity_fail(self):
        record=dict(deployment_id='d1',target_sha=A)
        for remote in [dict(record,status='succeeded'),dict(record,status='running',deployment_id='d2')]:
            with self.assertRaises(ValueError): b.resume_deployment(record,remote,NOW)
    def test_pending_uses_existing_id(self):
        record=dict(deployment_id='d1',target_sha=A)
        self.assertEqual(b.resume_deployment(record,dict(record,status='running'),NOW)['status'],'WAIT_EXISTING_DEPLOYMENT')
if __name__=='__main__': unittest.main()
