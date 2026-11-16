---
name: status
description: Show where a plan stands: tasks per wave with their status, blockers and the next step. Use when resuming, or asked "where are we" or "what's left".
argument-hint: <plan path, default: newest in docs/plans/>
---

Read-only. Report on the plan at: $ARGUMENTS (if empty, the newest file in `docs/plans/`; if there is none, say so and stop). Change nothing.

1. Read only the plan's title, the `### T<n>` task blocks (Status, Worker, Depends on, Owns) and `## Follow-ups`. Skip the rest.
2. Print one table per wave: `id | title | worker | status`. Status values: `[ ] todo`, `[~] built` (done, wave not verified), `[x] verified`, `[!] blocked: <note>`.
3. Print counts (verified / built / todo / blocked) and the current wave: the first wave with a task that is not `[x]`.
4. Cross-check with git, with at most two commands: `git branch --show-current` and `git log --oneline $(git merge-base HEAD main)..HEAD`. Flag a mismatch: a task marked `[~]` or `[x]` with no commit mentioning its id, or a commit with a task id still marked `[ ]`. On main/master, say the work is not on a feature branch.
5. List blocked tasks with their notes, and the number of Follow-ups.
6. End with the next step, one line:
   - blocked tasks: what the note needs from me,
   - all tasks `[~]` in a wave: `/flow:build <plan>` resumes at verify,
   - tasks `[ ]`: `/flow:build <plan>` continues with wave N,
   - everything `[x]`: run the plan's Smoke check if any, then `/flow:pr`.
