#!/usr/bin/env python3
"""Replay a pinned real read snapshot in a fresh directory; never publishes.

Captured connector data is read evidence, not authorization or an editorial
judgment. Replaying this file is not a second live scan or a fresh Git bootstrap.
"""
import argparse
import base64
from datetime import datetime
import hashlib
import json
from pathlib import Path
from zoneinfo import ZoneInfo
from cloud_blog_contract import HASH, SHA, require, window


def plan(snapshot, now, live_sha, browser_blocked=False):
    require(snapshot.get('evidence_mode') == 'LIVE_READ_ONLY' and snapshot.get('external_writes') == 0,
            'Expected actual read-only connector evidence')
    require(snapshot.get('collection_complete') is True and snapshot.get('article_history', {}).get('complete') is True,
            'Snapshot reconstruction incomplete')
    main = snapshot.get('main_sha')
    require(SHA.fullmatch(main or '') and SHA.fullmatch(live_sha or ''), 'Invalid live/main SHA')
    history = snapshot['article_history']
    blobs = history['blobs']
    for sha, blob in blobs.items():
        require(SHA.fullmatch(sha) and blob.get('encoding') in {'utf-8', 'base64'}, 'Invalid article blob')
        content = blob['content'].encode('utf-8') if blob['encoding'] == 'utf-8' else base64.b64decode(blob['content'], validate=False)
        actual = hashlib.sha1(f'blob {len(content)}\0'.encode() + content).hexdigest()
        require(actual == sha, 'Captured article blob does not match Git identity')
    for record in history['versions'] + snapshot['main_articles']:
        require(record['blob_sha'] in blobs, 'Missing article bytes')
    _, start, end = window(now)
    eligible = []
    for pr in snapshot['prs']:
        if not pr.get('merged_at') or pr.get('base_ref') != 'main':
            continue
        completed = datetime.fromisoformat(pr['merged_at'].replace('Z', '+00:00'))
        require(completed.tzinfo is not None, 'PR completion timezone missing')
        if start <= completed.astimezone(ZoneInfo('Asia/Shanghai')).date() <= end:
            eligible.append(pr['number'])
    run = snapshot.get('exact_main_push_run') or {}
    ci_ok = (run.get('head_sha') == main and run.get('event') == 'push' and run.get('head_branch') == 'main'
             and run.get('path') == '.github/workflows/hugo-check.yml'
             and run.get('status') == 'completed' and run.get('conclusion') == 'success')
    relationship = snapshot['branch_relationship']
    if snapshot['blog_prs']:
        content_state = 'RECONCILE_EXISTING_PR_BEFORE_NEW_TOPIC'
    elif relationship.get('status') == 'behind' and relationship.get('ahead_by') == 0:
        content_state = 'GUARDED_CHATGPT_FAST_FORWARD_REQUIRED'
    elif relationship.get('status') == 'diverged':
        content_state = 'BRANCH_RECOVERY_REQUIRED'
    else:
        content_state = 'SOURCE_AND_SEMANTIC_REVIEW_REQUIRED'
    return {
        'mode': 'CAPTURED_LIVE_EVIDENCE_REPLAY', 'external_writes': 0,
        'source_window': {'timezone': 'Asia/Shanghai', 'start': str(start), 'end': str(end)},
        'main_sha': main, 'chatgpt_sha': snapshot['chatgpt_sha'],
        'content': {'status': content_state, 'branch_relationship': relationship,
                    'eligible_merged_prs_for_review': sorted(eligible),
                    'cloud_work_records_skipped': len(snapshot['cloud_work']['skipped']),
                    'semantic_review': 'NOT_PERFORMED', 'selected_topic': None,
                    'qa': 'BLOCKED_BROWSER_SOCKET' if browser_blocked else 'NOT_RUN',
                    'required_mobile_screenshots': 4, 'actual_mobile_screenshots': 0},
        'production': {'status': 'NO_CHANGE' if live_sha == main and ci_ok else 'RELEASE_GATES_REQUIRED',
                       'live_sha': live_sha, 'exact_main_push_ci_verified': ci_ok},
        'reconstruction': {'historical_versions': len(history['versions']), 'verified_article_blobs': len(blobs),
                           'sites_versions': len(snapshot['sites_versions']), 'issues': len(snapshot['issues']),
                           'prs': len(snapshot['prs'])},
        'next_actions': ['Approve isolated CAS test-ref trial separately',
                         'After verified serialization, authorize/reconcile chatgpt fast-forward to current main',
                         'Review eligible public PR evidence against complete historical content; do not invent claims',
                         'Resolve dot-cloud browser launch capability before any article QA or Draft PR',
                         'Keep all mutation plans disabled until their exact evidence and authorization gates pass'],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--snapshot', required=True)
    parser.add_argument('--snapshot-sha256', required=True)
    parser.add_argument('--now', required=True)
    parser.add_argument('--live-sha', required=True)
    parser.add_argument('--browser-log')
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    raw = Path(args.snapshot).read_bytes()
    require(HASH.fullmatch(args.snapshot_sha256) and hashlib.sha256(raw).hexdigest() == args.snapshot_sha256,
            'Captured snapshot hash mismatch')
    blocked = args.browser_log is not None and 'socket() failed: Operation not permitted' in Path(args.browser_log).read_text()
    result = plan(json.loads(raw), datetime.fromisoformat(args.now), args.live_sha, blocked)
    result['captured_snapshot_sha256'] = args.snapshot_sha256
    Path(args.output).write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'content': result['content']['status'], 'production': result['production']['status'], 'external_writes': 0}))

if __name__ == '__main__':
    main()
