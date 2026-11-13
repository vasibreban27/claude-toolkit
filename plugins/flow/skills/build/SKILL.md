---
name: build
description: Execute an existing, approved plan from docs/plans/ by dispatching its tasks to the worker agents wave by wave, verifying after each wave. Use when the user asks to build, implement or execute a plan file. Not for tasks without a plan (use the plan skill first).
argument-hint: <plan path, e.g. docs/plans/foo.md>
---

Execute the plan at: $ARGUMENTS (if empty, use the newest file in `docs/plans/`).

You are the orchestrator. You do not write the feature code yourself; the workers do.

## Status tracking (the plan file is the resume point)
Each task has a `Status:` line. You are the only one who edits it; workers never do. Values: `[ ] todo`, `[~] built` (worker done, wave not verified yet), `[x] verified`, `[!] blocked: <short note>`. Write the change into the plan file immediately after each event, so a stopped or reset session loses nothing.

## Setup
1. Read the plan. List its tasks, workers, `Owns`, `Depends on`, `Status` and waves. If a task lacks a worker or `Owns`, stop and ask me.
   **Resume**: skip tasks that are `[x]`. A wave whose tasks are all `[~]` goes straight to its verify step (use the range `git merge-base HEAD main..HEAD`). Re-dispatch `[ ]` and `[!]` tasks. Say in one line where you are resuming.
2. Make sure the work is on a feature branch, not main or master, with a clean tree. If not, ask me.
3. **Small plan shortcut**: if the plan has a single task touching one file, implement it directly in the main thread, run the tests, and skip to Finish (no agents, no verify loop).

## For each wave, in order
1. Record the base commit: `BASE=$(git rev-parse HEAD)`.
2. Launch every task of the wave in parallel, one agent per task, with the worker named in the plan (`java-developer`, `python-developer`, `node-developer`, `frontend-developer`, `database-engineer`). Prompt = the plan path and the task id only; workers read the rest from disk.
3. Collect the reports (each is `Task: <id> – done | partial | blocked`). Keep only the status line and any notes in your context. Mark `done` tasks `[~] built`.
4. If any task is `partial` or `blocked`, mark it `[!] blocked: <note>` in the plan, stop and show me the notes. Do not start the next wave.
5. Use the `verify` skill with range `$BASE..HEAD` and the plan path for this wave. When it passes, mark the wave's tasks `[x] verified` and commit the plan file (`docs(plan): wave N verified`). Do not start the next wave until then.

## Finish
Run the full test suite once, then report: waves run, tasks done, rounds used per wave, findings fixed, tests added, and anything unresolved. Tell me the next step is to open a PR (the `pr` skill). Never push or open a PR yourself.
