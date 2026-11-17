---
name: spike
description: Time-boxed research on one design-changing unknown that ends in a decision note with one-line decisions later tasks can cite. Use before planning or building when a library, API or approach is unproven.
argument-hint: <the question to answer, optionally "box: 20 min">
model: sonnet
---

Answer one question, then stop. Question: $ARGUMENTS

You write no production code and change no source file. The only file you create in the repo is the decision note. Experiments (a throwaway script, a minimal repro) run in the scratchpad or a temp directory outside the repo and are deleted afterwards.

## 1. Frame (before any tool call)
State in at most 5 lines: the question as one sentence ending in `?`, what decision it unlocks, the **box** (default: 15 tool calls or 20 minutes, whichever comes first; the user's `box:` overrides), and what answer would change the plan. If the question is really several, pick the one that changes the design most and list the rest under "Not answered". Do not ask the user anything unless the question cannot be understood.

## 2. Investigate (bounded)
- Read `CLAUDE.md`, then only the code, docs and manifests that bear on the question. Prefer the smallest experiment that gives a yes or no over reading more.
- Delegate wide searches to the built-in `Explore` agent and keep only its conclusion.
- Count your tool calls. At the box limit, stop investigating and write what you have. A spike that ends with "undecided" is a valid result.

## 3. Write the note
Create `docs/notes/<slug>-spike.md` (kebab-case slug of the question) in exactly this shape:

```
# Spike: <question>
Date: <YYYY-MM-DD> | Box: <used>/<allowed> | Result: decided | partly | undecided

## Decisions
- D1: <one line a task can cite, e.g. "Use better-sqlite3, not sqlite3: sync API works in the main process.">  Evidence: <file:line, command or result>
- D2: ...

## If this goes the other way
<what changes in the plan, one or two lines per decision that could be wrong; "stop and re-plan before the next wave" where it applies>

## Evidence
<commands run and what they printed, links, versions: short, enough to re-check>

## Not answered
<open points; each says who or what would answer it>
```
Rules: one line per decision, no hedging words inside it; a decision without evidence is written as `Assumption:` instead; at most 7 decisions.

## 4. Hand back
Commit only the note (`docs(spike): <slug>`), staging it by explicit path. Then tell me, in at most 6 lines: the result, each decision (D-ids), which plan tasks should cite them, and whether any plan task or wave must change. If a plan exists, suggest the edits; do not make them. Never push.

## Never
- Edit source, tests, config or lockfiles; install dependencies into the project.
- Exceed the box without telling me why and asking.
- Present a guess as a decision.
