import copy
from datetime import datetime
import hashlib
from pathlib import Path
import sys
import unittest
sys.path.insert(0,str(Path(__file__).parents[1]))
from cloud_blog_rehearsal import plan
A,B='a'*40,'b'*40
NOW=datetime.fromisoformat('2026-10-10T07:00:00+00:00')
def snapshot():
    text='article';sha=hashlib.sha1(b'blob 7\0article').hexdigest()
    return dict(evidence_mode='LIVE_READ_ONLY',external_writes=0,collection_complete=True,main_sha=A,chatgpt_sha=B,
        article_history=dict(complete=True,blobs={sha:dict(encoding='utf-8',content=text)},versions=[dict(blob_sha=sha)]),
        main_articles=[dict(blob_sha=sha)],blog_prs=[],prs=[dict(number=1,base_ref='main',merged_at='2026-10-09T01:00:00Z')],
        issues=[],sites_versions=[],cloud_work=dict(skipped=[{}]),branch_relationship=dict(status='behind',ahead_by=0,behind_by=6),
        exact_main_push_run=dict(head_sha=A,event='push',head_branch='main',path='.github/workflows/hugo-check.yml',status='completed',conclusion='success'))
class ReplayTests(unittest.TestCase):
    def test_real_capture_replay_never_claims_qa_or_new_topic(self):
        result=plan(snapshot(),NOW,A,True)
        self.assertEqual(result['content']['status'],'GUARDED_CHATGPT_FAST_FORWARD_REQUIRED')
        self.assertEqual(result['production']['status'],'NO_CHANGE')
        self.assertIsNone(result['content']['selected_topic'])
        self.assertEqual(result['content']['actual_mobile_screenshots'],0)
        self.assertEqual(result['source_window']['start'],'2026-09-10')
    def test_mock_not_live(self):
        s=snapshot();s['evidence_mode']='MOCK'
        with self.assertRaises(ValueError):plan(s,NOW,A)
    def test_hash_tampering_blocks(self):
        s=snapshot();next(iter(s['article_history']['blobs'].values()))['content']='tampered'
        with self.assertRaises(ValueError):plan(s,NOW,A)
    def test_incomplete_is_not_no_topic(self):
        s=snapshot();s['collection_complete']=False
        with self.assertRaises(ValueError):plan(s,NOW,A)
    def test_no_change_requires_exact_push(self):
        s=snapshot();s['exact_main_push_run']['event']='pull_request'
        self.assertEqual(plan(s,NOW,A)['production']['status'],'RELEASE_GATES_REQUIRED')
    def test_current_day_pr_excluded(self):
        s=snapshot();s['prs'][0]['merged_at']='2026-10-10T01:00:00Z'
        self.assertEqual(plan(s,NOW,A)['content']['eligible_merged_prs_for_review'],[])
if __name__=='__main__':unittest.main()
