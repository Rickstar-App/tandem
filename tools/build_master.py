#!/usr/bin/env python3
"""Compile MASTER_DESIGN.md from the source files. Run from the repo root: python3 tools/build_master.py"""
import re, subprocess, datetime

def rd(p): return open(p).read()

def drop_h1(md):
    out, fence = [], False
    for ln in md.split('\n'):
        if ln.startswith('```'): fence = not fence
        if not fence and ln.startswith('# '): continue
        out.append(ln)
    return '\n'.join(out).strip('\n')

def as_h2(md):  # an appendix source whose top headings are H2 already: keep; shift H2->H3 inside appendices
    out, fence = [], False
    for ln in md.split('\n'):
        if ln.startswith('```'): fence = not fence
        if not fence and re.match(r'^#{2,5} ', ln): ln = '#' + ln
        out.append(ln)
    return '\n'.join(out)

tests = subprocess.run(['npx', 'vitest', 'run'], cwd='packages/engine', capture_output=True, text=True).stdout
m = re.search(r'Tests\s+(\d+) passed', tests); files = re.search(r'Test Files\s+(\d+) passed', tests)
n_tests = m.group(1) if m else '?'; n_files = files.group(1) if files else '?'
if '?' in (n_tests, n_files) or 'failed' in tests: raise SystemExit('engine tests did not pass; refusing to compile')
today = datetime.date.today().isoformat()
import json, os
PAGES = json.load(open('tools/toc_pages.json')) if os.path.exists('tools/toc_pages.json') else {}

def headings(md):
    out, fence = [], False
    for ln in md.split('\n'):
        if ln.startswith('```'): fence = not fence
        if fence: continue
        m = re.match(r'^(#{1,2}) (.+)$', ln)
        if m: out.append((len(m.group(1)), m.group(2).strip()))
    return out

body = f"""# Overview

Tandem is an online two-player bughouse chess site where each player controls both boards, with one clock per board.

**Compiled {today}** from the project files. This is a read-only compilation; edit the source files (`BRIEF.md`, `DESIGN.md`, `THIRD_PARTY.md`, `design/tokens.css`), then rebuild with `python3 tools/build_master.py`.

## Status at a glance
| Area | State |
|---|---|
| Brief | v2.4, complete, no open questions |
| Visual direction | **Club table**, decided 2026-10-07 |
| Tokens, fonts, pieces, licences | Done and verified (`design/`, `THIRD_PARTY.md`) |
| Rules engine (M1) | Done. Run for this compilation: **{n_tests} tests passing** ({n_files} files) |
| Server, client, replay, spectators, rules page (M2 to M5) | Done and reviewed |
| Hardening (M6) | Accessibility, performance and licences verified; see §9 |
| Dependencies | Two shipped (Svelte, ws), both MIT; all recorded in `THIRD_PARTY.md` |

![The game screen as built, captured from the running application at 1280 px. The viewer is Team White-A: White at the bottom of Board A, Black at the bottom of Board B. The spine between the boards is where a captured piece crosses to the partner reserve.](shots/desktop-game.png)

# Part 1. Build brief

{drop_h1(rd('BRIEF.md'))}

# Part 2. Design system

{drop_h1(rd('DESIGN.md'))}

# Appendices

## Appendix A. Design tokens (verbatim from `design/tokens.css`)

```css
{rd('design/tokens.css').rstrip()}
```

## Appendix B. Rules engine

{as_h2(drop_h1(rd('packages/engine/README.md')))}

Test run for this compilation: {n_files} files, {n_tests} tests, all passing.

## Appendix C. Third-party licences

{as_h2(drop_h1(rd('THIRD_PARTY.md')))}

## Appendix D. File inventory

| Path | What it is |
|---|---|
| `MASTER_DESIGN.md` | This document, compiled by `tools/build_master.py` |
| `MASTER_DESIGN.pdf` | PDF export of this document |
| `BRIEF.md` | Build brief: product, rules, interaction, architecture, quality bars, milestones |
| `DESIGN.md` | Club table design record and rejection checklist |
| `THIRD_PARTY.md` | Licences for pieces, fonts and dev dependencies |
| `design/tokens.css` | Every design value (colour, type, space, motion) |
| `design/fonts/` | Self-hosted Atkinson Hyperlegible Next and Zilla Slab (latin subsets) and their OFL texts |
| `design/pieces/` | Cburnett SVG piece set (12 files) |
| `design/preview.html`, `design/preview.png` | Rendered reference of the game screen using the tokens |
| `packages/engine/` | Rules engine (TypeScript) and its tests |
| `packages/server/` | Authoritative room, clocks and protocol; Node and Durable Object adapters |
| `packages/web/` | Svelte 5 client |
| `e2e/` | Playwright specs: gameplay, flows, layout, accessibility, performance |
| `shots/` | Screenshots of every screen at three widths |
| `tools/build_master.py` | Rebuilds this document |
| `gate1/` | Archived style tiles (three directions) and the font test page |
"""
hs = headings(body)
rows = '\n'.join(f"| {'&nbsp;&nbsp;&nbsp;' if lvl == 2 else ''}{'**' + t + '**' if lvl == 1 else t} | {PAGES.get(t, '')} |" for lvl, t in hs)
contents = f"# Contents\n\n| Section | Page |\n|---|---|\n{rows}\n\n"
doc = contents + body
open('MASTER_DESIGN.md', 'w').write(doc)
print(f'MASTER_DESIGN.md written, {len(doc.splitlines())} lines, {n_tests} tests')
