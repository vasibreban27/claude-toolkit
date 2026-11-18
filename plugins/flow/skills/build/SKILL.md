---
name: build
description: Execute an approved plan from docs/plans/ wave by wave with the worker agents, verifying each wave. Use when asked to build or implement a plan file.
argument-hint: <plan path, e.g. docs/plans/foo.md>
model: sonnet
---

Execute the plan at: $ARGUMENTS (if empty, use the newest file in `docs/plans/`).

You are the orchestrator. You do not write the feature code yourself; the workers do. Plans follow `docs/plan-format.md` (`Format: flow-plan/1`). If line 1 is not that, stop and say the plan needs re-planning with the current `plan` skill.

## Decision gates (the one definition; `plan` and `verify` refer to this table)
| Ask the user (a gate: stop and wait) | Decide automatically (never ask) |
|---|---|
| Plan approval | Minor findings: append to `## Follow-ups` |
| A design decision no default covers (`STOP: decision`) | Test or doc files changed outside `Owns`: accept, list in Follow-ups |
| A source file changed outside `Owns` (`STOP: scope`) | Wave transitions (subject to autonomy) |
| Anything irreversible: push, merge, delete, force | Fix rounds within the round limit |
| A task blocked after its retry budget (`STOP: blocked`) | Status and plan commits |
| A cost or time cap reached (`STOP: limit`) | Docs-only uncommitted changes before starting |

When you stop at a gate, say which gate, what you need decided, and your recommended answer, in at most 5 lines.

### STOP codes
Every agent report that is not clean carries `STOP: <code>: <reason>` and the same code in `REPORT_JSON` (`"stop"`). One taxonomy for all agents:

| Code | Meaning | Gate? |
|---|---|---|
| `blocked` | build, DB or tools broken, or tests keep failing; the agent could not finish | after the retry budget |
| `scope` | needs a source file outside its `Owns` | yes, at once |
| `decision` | contract mismatch, or a choice no default or plan text covers | yes, at once |
| `limit` | raised by you: round limit, cost cap or time cap reached | yes, at once |
| `slow-tests` | raised by `verify`: the fast suite took over 60 s; advisory, suggest splitting slow tests into `Test (slow)` and put it in Follow-ups | no |

Retry budget: a task that stops with `blocked` is re-dispatched **once**, with the failure output in the prompt. A second `blocked` is a gate. Never retry `scope` or `decision`.

### Autonomy
`autonomy` decides when you stop between waves. Resolution order: an instruction in the prompt that started this build, then the plan's `Autonomy:` header, then a `flow-autonomy: <value>` line in `CLAUDE.md`, then `checkpoints`.

| Value | You stop |
|---|---|
| `supervised` | after every verified wave (show a 3-line summary and wait for "continue"), and at gates |
| `checkpoints` | after a wave that contains a `Sensitive: yes` task, and at gates |
| `autonomous` | only at gates |

Gates always stop, whatever the autonomy. A cap in the prompt (for example "stop after 90 minutes" or "at most N rounds in total") is checked at every wave transition (`date +%s` against the start time you noted in Setup); when reached, stop with `STOP: limit`.

## Status tracking (the plan file is the resume point)
Each task has a `Status:` line. You are the only one who edits it; workers never do. Values: `[ ] todo`, `[~] built` (worker done, wave not verified yet), `[x] verified`, `[!] blocked: <short note>`. Write the change into the plan file immediately after each event, so a stopped or reset session loses nothing.

## Setup
1. Read the plan. Run `node "${CLAUDE_PLUGIN_ROOT}/bin/plan-lint.js" <plan>`; on errors, show them and stop (a gate: the plan needs fixing). If the script cannot be found, continue and say "plan not linted". Note the start time. List tasks, workers, `Owns`, `Depends on`, `Sensitive`, `Status` and waves. Resolve `autonomy` as above.
   **Resume**: skip tasks that are `[x]`. A wave whose tasks are all `[~]` goes straight to its verify step (use the range `git merge-base HEAD main..HEAD`). Re-dispatch `[ ]` and `[!]` tasks. Say in one line where you are resuming.
2. Make sure the work is on a feature branch, not main or master, with a clean tree. If the only uncommitted changes are the plan file, `.gitignore` or other docs, commit them (`docs: update plan`) without asking. For any other uncommitted change, ask me.
3. **Small plan shortcut**: if the plan has a single task touching one file, implement it directly in the main thread, run the tests, and skip to Finish (no agents, no verify loop).

## For each wave, in order
1. Record the base commit: `BASE=$(git rev-parse HEAD)`.
2. **Owns check before launching**: compare the `Owns` paths of the wave's tasks. Two paths overlap if they are equal or one is inside the other. On any overlap, do not launch: show me the pair and ask whether to move one task to a later wave (a gate). Then run `git status --short` and note any uncommitted files, so you can tell later which changes are not the workers'.
3. Launch every task of the wave in parallel, one agent per task, with the worker named in the plan. If the task has `Model: haiku` or `opus`, pass that as the agent's `model` override; otherwise use the worker's own default (sonnet). Prompt = the contents of `${CLAUDE_PLUGIN_ROOT}/prompts/worker-task.md` (read it once in Setup) with `{{plan_path}}` and `{{task_id}}` filled in, and nothing added, so this skill and the claude-desk app send the same prompt (`docs/prompts.md`). If the file cannot be found, use: "Implement task <id> from the plan at <path>. Read the files in your task's `Read first` first. Other workers edit other files at the same time: judge your checks by your own files and list errors elsewhere in Notes. Stage and commit only your own files." Do not use worktrees: a fresh worktree has no installed dependencies and merging adds cost; the disjoint `Owns` rule keeps parallel workers apart, and your wave-level check is the real gate.
4. Collect the reports (each is `Task: <id> – done | partial | blocked`, plus a `STOP: <code>: <reason>` line when not done and a final `REPORT_JSON:` line). Keep only the status line, the STOP line and any notes in your context. Mark `done` tasks `[~] built`.
5. **Scope check**: run `git diff --name-only $BASE..HEAD` and `git status --short`. Every changed file must fall under some wave task's `Owns` (or be one of the uncommitted files you noted before launching, or the plan file). For each other file:
   - a test or doc path (`test/`, `tests/`, `__tests__/`, `*.test.*`, `*.spec.*`, `docs/`, `*.md`): accept it and add `out-of-scope (accepted): <file> (<commit>)` to Follow-ups;
   - any other (source) file: `STOP: scope`. List them as `out-of-scope: <file> (<commit>)` and do not mark the wave verified until I have decided.
   Also check each `done` task's commit touched only its own `Owns`; a task that changed another task's files is a collision, report it as `STOP: scope`.
6. If any task is `partial` or `blocked`, apply the STOP rules above: re-dispatch once if `blocked`; otherwise mark it `[!] blocked: <note>` in the plan, stop and show me the notes. Do not start the next wave.
7. Use the `verify` skill with range `$BASE..HEAD`, the plan path and the mode for this wave: `--full` if any task of the wave is `Sensitive: yes`, otherwise `--light`. When it passes, mark the wave's tasks `[x] verified` and commit the plan file (`docs(plan): wave N verified`). Append every minor finding and worker caveat from the wave to the plan's `## Follow-ups` section, one line each (id, file, problem), in the same commit.
8. **Wave transition**: apply `autonomy` (table above). If it says stop, summarize the wave in 3 lines (tasks, rounds used, findings fixed) and wait. Otherwise start the next wave without asking.

## Finish
1. Run the project's slow suite once: `Test (slow)` from `CLAUDE.md`. If the project declares no `Test (slow)`, run its full test command once, as before. Per-wave verify runs never ran it.
2. If any wave ran with `--light` (no reviewer), run the `verify` skill once with `--phase` over `git merge-base HEAD main..HEAD`, so the whole change gets one review. Its findings go through the normal fix rounds (limit 2).
3. For an app with a UI or shell, also run the plan's `Smoke` task result: if it is automated, it must pass; if it is a manual check, or the plan has none, do NOT call the phase done. Say "built and verified by tests and review, not launched" and hand me the manual-check steps.
4. Report: waves run, tasks done, rounds used per wave, findings fixed, tests added, unresolved items, and the number of Follow-ups with the plan path. Tell me the next step is to open a PR (the `pr` skill). Never push or open a PR yourself (irreversible: a gate).
