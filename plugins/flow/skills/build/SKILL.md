---
name: build
description: Execute an approved plan from docs/plans/ wave by wave with the worker agents, verifying each wave. Use when asked to build or implement a plan file.
argument-hint: <plan path, e.g. docs/plans/foo.md>
---

Execute the plan at: $ARGUMENTS (if empty, use the newest file in `docs/plans/`).

You are the orchestrator. You do not write the feature code yourself; the workers do.

## Status tracking (the plan file is the resume point)
Each task has a `Status:` line. You are the only one who edits it; workers never do. Values: `[ ] todo`, `[~] built` (worker done, wave not verified yet), `[x] verified`, `[!] blocked: <short note>`. Write the change into the plan file immediately after each event, so a stopped or reset session loses nothing.

## Setup
1. Read the plan. List its tasks, workers, `Owns`, `Depends on`, `Status` and waves. If a task lacks a worker or `Owns`, stop and ask me.
   **Resume**: skip tasks that are `[x]`. A wave whose tasks are all `[~]` goes straight to its verify step (use the range `git merge-base HEAD main..HEAD`). Re-dispatch `[ ]` and `[!]` tasks. Say in one line where you are resuming.
2. Make sure the work is on a feature branch, not main or master, with a clean tree. If the only uncommitted changes are the plan file, `.gitignore` or other docs, commit them (`docs: update plan`) without asking. For any other uncommitted change, ask me.
3. **Small plan shortcut**: if the plan has a single task touching one file, implement it directly in the main thread, run the tests, and skip to Finish (no agents, no verify loop).

## For each wave, in order
1. Record the base commit: `BASE=$(git rev-parse HEAD)`.
2. **Owns check before launching**: compare the `Owns` paths of the wave's tasks. Two paths overlap if they are equal or one is inside the other (`src/orders/` and `src/orders/Cancel.java`). On any overlap, do not launch: show me the pair and ask whether to move one task to a later wave. Then run `git status --short` and note any uncommitted files, so you can tell later which changes are not the workers'.
3. Launch every task of the wave in parallel, one agent per task, with the worker named in the plan (`java-developer`, `python-developer`, `node-developer`, `frontend-developer`, `database-engineer`). Prompt = the plan path and the task id, plus this line: "Other workers are editing other files at the same time; judge your checks by your own files, ignore errors in files outside your task's `Owns` and list them in Notes." Workers read only the plan's Goal, Architecture (with the contract) and their own task from disk, and stage and commit only their own files. Do not use worktrees for this: a fresh worktree has no installed dependencies and merging adds cost; the disjoint `Owns` rule is what keeps parallel workers apart, and your wave-level check is the real gate.
4. Collect the reports (each is `Task: <id> – done | partial | blocked`, plus a `STOP: <code>: <reason>` line when not done and a final `REPORT_JSON:` line). Keep only the status line, the STOP line and any notes in your context. Mark `done` tasks `[~] built`.
5. **Scope check**: run `git diff --name-only $BASE..HEAD` and `git status --short`. Every changed file must fall under some wave task's `Owns` (or be one of the uncommitted files you noted before launching, or the plan file). List the others as `out-of-scope: <file> (<commit>)`; do not mark the wave verified until I have seen the list. Also check each `done` task's commit touched only its own `Owns`; a task that changed another task's files is a collision, report it.
6. If any task is `partial` or `blocked`, mark it `[!] blocked: <note>` in the plan, stop and show me the notes. Do not start the next wave.
7. Use the `verify` skill with range `$BASE..HEAD` and the plan path for this wave. When it passes, mark the wave's tasks `[x] verified` and commit the plan file (`docs(plan): wave N verified`). Do not start the next wave until then. Append every minor finding and worker caveat from the wave to the plan's `## Follow-ups` section, one line each (id, file, problem), and include it in the same commit.

## Finish
Run the full test suite once. For an app with a UI or shell, also run the plan's `Smoke` task result: if it is automated, it must pass; if it is a manual check, or the plan has none, do NOT call the phase done. Say "built and verified by tests and review, not launched" and hand me the manual-check steps.
Then report: waves run, tasks done, rounds used per wave, findings fixed, tests added, unresolved items, and the number of Follow-ups with the plan path. Tell me the next step is to open a PR (the `pr` skill). Never push or open a PR yourself.
