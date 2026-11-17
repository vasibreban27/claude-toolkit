---
name: standup
description: Short daily-meeting summary (done, doing, blocked) from git history and plan status. Use when asked for a standup, daily update or "what did I do".
argument-hint: <since, default: last working day, e.g. "2 days ago" or "monday">
model: haiku
---

Read-only. Write a standup from the repository only. Period: $ARGUMENTS (if empty: since the start of the last working day; on Monday that is Friday).

## Sources (at most four commands)
1. `git log --no-merges --since="<period>" --author="$(git config user.name)" --pretty="%h %ad %s" --date=short` for the current repo (add `--branches` to include other local branches).
2. `git branch --show-current` and `git status --short` (uncommitted work counts as "doing").
3. The newest unfinished plan in `docs/plans/`: read only the `### T<n>` headings with their `Status:` lines and `## Follow-ups` count.
4. If `.flow/timing.jsonl` exists, ignore it; this is not a time report.

## Format (exactly this, at most 10 lines, plain words, no commit hashes)
```
Standup <date> (<branch>)
Done: <1-3 bullets: outcomes, not commit messages; group related commits>
Doing: <1-2 bullets: uncommitted changes, the current wave and tasks not yet verified>
Blocked: <none | what, and who or what unblocks it (blocked plan tasks, failing tests, waiting decisions)>
Next: <one line: the next plan step or the next obvious task>
```
Rules: describe results ("cancel endpoint with owner check is in, tests pass"), not activity ("worked on"); use task ids only when they help ("T3 verified"); never invent work that is not in the history; if there are no commits in the period, write `Done: nothing committed since <date>` and still report Doing and Blocked. Do not push, commit or edit anything.
