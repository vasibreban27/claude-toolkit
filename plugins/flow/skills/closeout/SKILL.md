---
name: closeout
description: Collect what is still open at the end of a build (unresolved items, skipped tests, live checks, manual steps) and draft the PR description. Use before the pr skill.
argument-hint: <plan path, default: newest in docs/plans/>
model: sonnet
---

Close out the work of: $ARGUMENTS (if empty, the newest file in `docs/plans/`; if there is none, use the branch's commits only).

Read-only: you write no file, run no tests and spawn no agents. The `pr` skill pushes and opens the PR; you only prepare what goes into it. Never push.

## 1. Gather (only these sources)
1. The plan: title, Goal, per-task `Status:`, `## Follow-ups` (if `### Fix now / Later / Dropped` subsections exist from `triage`, use them), and any `Smoke` task.
2. `docs/notes/*-manual-check.md` and `docs/notes/*-spike.md` that the plan names; unchecked `- [ ]` steps count as open.
3. Git: `git branch --show-current`, and `git log --oneline $(git merge-base HEAD main)..HEAD`.
4. Skipped tests: added lines only, `git diff $(git merge-base HEAD main)..HEAD -U0`, matching `.skip(`, `xit(`, `xdescribe(`, `@Disabled`, `@Ignore`, `pytest.mark.skip`, `pytest.mark.xfail`, `t.Skip(`, `it.todo(`. List each with file and line.
5. `.flow/timing.jsonl` if it exists: total agent minutes per agent type (one line); skip it otherwise.

## 2. Judge
- **Unresolved**: tasks not `[x] verified`, blocked tasks with their note, Follow-ups marked fix now (or all of them if not triaged), findings the last verify report left open.
- **Live checks open**: the plan's Smoke task not run, unchecked manual-check steps, anything that says "launch" or "against a real X" that no test covers. If the plan changed runtime wiring and has no launch result, say "built and verified by tests and review, not launched".
- **Ready** only if there is nothing under Unresolved; open live checks and skipped tests do not block, but they must be listed in the PR text.

## 3. Report (exactly this format)
```
Closeout: <plan title or branch>
Status: ready | not ready (<n> unresolved)
Branch: <name> | commits: <n> | agent time: <total or "no timing log">

Unresolved: <none | bullets: id, one line each>
Skipped or disabled tests: <none | file:line, one line each>
Open live checks: <none | bullets>
Manual steps (reviewer or release): <none | numbered, exact commands or clicks>
Follow-ups left: <count by group> (see the plan)

--- Draft PR description (copy into /flow:pr) ---
## What changed
<3-6 bullets from the commits and plan Goal, grouped by layer>
## Why
<the plan's story line, one sentence>
## How it was tested
<test commands and results known from this session, and what was not run>
## Reviewer notes
<risks, sensitive tasks, skipped tests, open live checks, manual steps: only what exists>
## Follow-ups
<the plan's Follow-ups, one line each, or "none">
```
If Status is `not ready`, say the single next action in one line after the block. Do not soften the PR text: open items and skipped tests appear in it as they are.
