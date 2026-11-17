---
name: triage
description: Sort a plan's ## Follow-ups into fix now, later or drop, with a reason for each. Use after a build, before opening a PR, when the follow-up list has grown.
argument-hint: <plan path, default: newest in docs/plans/> [--apply]
model: sonnet
---

Triage the Follow-ups of: $ARGUMENTS (first word is the plan path; if empty, the newest file in `docs/plans/`; if there is none, say so and stop).

Read-only unless the arguments contain `--apply`. You spawn no agents and fix nothing; fixes go through the `verify` skill or a worker afterwards.

## 1. Collect
Read the plan's `## Follow-ups` section (one line each: id, file, problem) and the plan's Goal and `Sensitive:` tasks. If the section is empty, print `Follow-ups: none` and stop. For each item, read at most 5 lines of the file around the cited line (skip if the file no longer exists, or the line is gone: then the item is probably obsolete, see below). Do not read anything else.

## 2. Decide each item
| Verdict | Use when |
|---|---|
| **fix now** | it breaks an acceptance criterion or the contract, is a reproducible bug or security weakness in a `Sensitive: yes` area, would surprise a reviewer, or is trivial (one line, no test needed) and sits in a file this branch already changed |
| **later** | real but not needed for this change: refactors, naming, extra tests for rare paths, hardening without a reproduction, or work that needs its own design |
| **drop** | already fixed or the code is gone, a duplicate of another item, a style point the linter covers, outside `docs/threat-model.md` with no reproduction, or a preference with no failing scenario |
Every verdict has a reason of at most 12 words that names the evidence (a file, a criterion, a duplicate id). When unsure between fix now and later, pick later; between later and drop, pick later. Do not invent new findings.

## 3. Report (exactly this format)
```
Triage of <plan path>: <n> items -> fix now <a>, later <b>, drop <c>

| # | item | verdict | reason |
|---|---|---|---|
| 1 | F3 src/a.ts: missing null check | fix now | breaks criterion T2.1 when body is empty |

Fix now (in this order): <ids>
Next: <one line: "run /flow:verify on these files" or "nothing blocks the PR">
```

## 4. Apply (only with `--apply`)
Rewrite the plan's `## Follow-ups` as three subsections in this order: `### Fix now`, `### Later`, `### Dropped`, keeping each original line and appending ` — <reason>`. Dropped items stay listed (so the decision is auditable). Commit only the plan file (`docs(plan): triage follow-ups`), staging it by explicit path. Never push.
