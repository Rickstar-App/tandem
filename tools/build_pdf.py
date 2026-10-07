#!/usr/bin/env python3
"""Build MASTER_DESIGN.md and MASTER_DESIGN.pdf with a contents table whose page numbers are read from the PDF itself.
Run from the repo root: python3 tools/build_pdf.py"""
import json, os, re, subprocess, sys
P = os.path.expanduser('~/.claude/skills/gstack/make-pdf/dist/pdf')
def run(*a, **k):
    r = subprocess.run(a, capture_output=True, text=True, **k)
    if r.returncode: sys.exit(r.stderr or r.stdout)
    return r.stdout
def norm(t):
    t = t.replace('`', '').translate(str.maketrans({'\u201c': '"', '\u201d': '"', '\u2018': "'", '\u2019': "'", '\u2013': '-', '\u2014': '-'}))
    return re.sub(r'\s+', ' ', t).strip().lower()
def build():
    run('python3', 'tools/build_master.py')
    run(P, 'generate', '--cover', '--no-confidential', '--title', 'Tandem: Master Design Document', 'MASTER_DESIGN.md', 'MASTER_DESIGN.pdf')
    run('swift', 'tools/pdf_pages.swift', 'MASTER_DESIGN.pdf', '/tmp/pdf_pages.json')
    return json.load(open('/tmp/pdf_pages.json'))
def locate(pages):
    start = next(i for i, t in enumerate(pages) if 'Compiled 2' in t and 'read-only compilation' in t)  # the Overview page
    md = open('MASTER_DESIGN.md').read()
    body = md.split('# Overview', 1)[1]
    found, fence = {'Overview': start + 1}, False
    cursor = start
    for ln in body.split('\n'):
        if ln.startswith('```'): fence = not fence
        m = None if fence else re.match(r'^#{1,2} (.+)$', ln)
        if not m: continue
        h = m.group(1).strip(); key = norm(h)
        for i in range(cursor, len(pages)):
            lines = [norm(x) for x in pages[i].split('\n')]
            hit = any(x == key for x in lines) if len(key) <= 40 else any(x.startswith(key[:40]) for x in lines)
            if hit: found[h] = i + 1; cursor = i; break
        else: found.setdefault('__missing__', []).append(h)
    return found
os.remove('tools/toc_pages.json') if os.path.exists('tools/toc_pages.json') else None
pages = build(); first = locate(pages)
if first.get('__missing__'): sys.exit(f"headings not found in PDF: {first['__missing__']}")
json.dump(first, open('tools/toc_pages.json', 'w'), indent=1)
pages = build(); second = locate(pages)
if second != first: sys.exit('page numbers shifted between passes; contents would be wrong')
print(f'OK: {len(pages)} pages, {len(first)} contents entries, numbers stable across passes')
