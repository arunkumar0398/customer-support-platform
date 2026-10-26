#!/usr/bin/env python3
"""Verify the static starter-kit file manifest and original acceptance/task IDs.

This script does NOT validate an implemented app, package scripts, Docker, CI or deployment.
Uses Python standard library only; safe to run from any working directory.
"""
import hashlib
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parent.parent
manifest_path = ROOT / 'KIT_MANIFEST.json'
errors = []

if not manifest_path.exists():
    sys.exit('FAIL: KIT_MANIFEST.json not found; extract entire ZIP at repository root.')

manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
expected = manifest['files']
for relpath, sha256 in expected.items():
    path = ROOT / relpath
    if not path.is_file():
        errors.append('Missing: ' + relpath)
        continue
    got = hashlib.sha256(path.read_bytes()).hexdigest()
    if got != sha256:
        errors.append('Checksum mismatch: ' + relpath)

mandatory = [
    'AGENTS.md', 'README.md', 'reference/assessment.pdf',
    'harness/ASSESSMENT_MASTER_PLAN.md', 'harness/ACCEPTANCE_MATRIX.md',
    'harness/IMPLEMENTATION_TASKS.md', 'harness/VERCEL_NEON_DEPLOYMENT.md',
    'prompts/MASTER_CODEX_DESKTOP_PROMPT.md',
]
for relpath in mandatory:
    if not (ROOT / relpath).is_file():
        errors.append('Missing mandatory file: ' + relpath)

acceptance = (ROOT / 'harness/ACCEPTANCE_MATRIX.md').read_text(encoding='utf-8')
ledger = (ROOT / 'harness/IMPLEMENTATION_TASKS.md').read_text(encoding='utf-8')
ids = set(re.findall(r'^\| (A\d{2}) \|', acceptance, flags=re.M))
tasks = set(re.findall(r'^\| (TK-\d{2}) ', ledger, flags=re.M))
expect_ids = {f'A{i:02d}' for i in range(1, 41)}
expect_tasks = {f'TK-{i:02d}' for i in range(1, 38)}
if ids != expect_ids:
    errors.append(f'Acceptance ID mismatch: missing={sorted(expect_ids-ids)} extras={sorted(ids-expect_ids)}')
if tasks != expect_tasks:
    errors.append(f'Task ID mismatch: missing={sorted(expect_tasks-tasks)} extras={sorted(tasks-expect_tasks)}')
pdf = (ROOT / 'reference/assessment.pdf').read_bytes()
if not pdf.startswith(b'%PDF-'):
    errors.append('Assessment reference is not a valid PDF header')
if hashlib.sha256(pdf).hexdigest() != manifest.get('assessment_pdf_sha256'):
    errors.append('Assessment PDF differs from original assessed source')

if errors:
    print('STARTER KIT FAIL')
    for error in errors:
        print(' -', error)
    print('Re-extract official ZIP without overwriting working project files.')
    sys.exit(1)
print('STARTER KIT PASS')
print(f'  Manifest entries checked: {len(expected)}')
print('  Assessment PDF checksum preserved')
print('  Acceptance IDs: A01..A40 (40 checks)')
print('  Implementation tasks: TK-01..TK-37 (37 tasks)')
print('  Reminder: application tests, Docker and deployment are NOT checked here.')
