---
name: verify
description: Review code changes, fill test gaps and fix the problems found, in a bounded loop using the reviewer, test-writer and worker agents. Use when the user asks to verify, check, harden or "review and fix" their changes. For a read-only review with no fixes, use the review skill instead.
argument-hint: <range, e.g. abc123..HEAD> <plan path>
---

Verify the changes in: $ARGUMENTS (if no range is given, use the current branch against its base: `git merge-base HEAD main`..HEAD, plus uncommitted changes).

You orchestrate; subagents do the work. Findings use the reviewer's ids (F1, F2, …) and the security auditor's ids (S1, S2, …).

## Step 0: cheap checks first
Run the project's compile/lint/test commands (from `CLAUDE.md`, `package.json`, `pom.xml` or `pyproject.toml`). If they fail, route the failures to the matching worker (see the table below) and re-run until they pass. Do not call the reviewer on a broken build.

## Loop (at most 3 rounds)
1. Launch `reviewer` with: the range (round 1) or only the files changed in the last round (rounds 2-3), the plan path, and the open finding ids.
   **Security (conditional, same step, in parallel)**: check `git diff --name-only <range>` and skim the diff. Launch `security-auditor` with the same inputs only if the change touches authentication or authorization (security config, filters, guards, roles, tokens), request/input handling (controllers, DTO binding, validators, deserialization), query building (raw SQL/JPQL/Mongo filters, `@Query`, string-built queries), secrets or config (properties/yaml, credentials, keys), or file upload/download and path handling. If nothing matches, do not launch it and say "security audit skipped: no sensitive surface". In rounds 2-3 re-run it only if a security finding is open or the fixes touched such files.
   If every launched agent returns `Verdict: PASS`, go to Finish.
2. Round 1 only: launch `test-writer` with the range, the plan path and the findings to cover. Rounds 2-3: launch it only if fixes added new behavior, and give it only the new findings.
3. Fix every open `blocker` and `major` finding (reviewer `F` ids and security `S` ids), and every real bug that `test-writer` reported. Pick the fixer by the file the finding points to:

   | File | Fixed by |
   |---|---|
   | `.java` | `java-developer` |
   | `.py` | `python-developer` |
   | `.sql`, migrations, Mongo schema/index files | `database-engineer` |
   | Angular or React files (`.ts`, `.tsx`, `.html`, `.scss` in the UI app) | `frontend-developer` |
   | anything else | you fix it in the main thread; do not spawn an agent |

   When delegating, pass the finding in full (id, file:line, problem, scenario, suggested fix, failing test output). Say explicitly: this is a fix assignment, the finding is the task, the files named in the finding are the files it owns (overriding the plan's `Owns`), use the finding id where a task id is expected. Findings in different files go out in parallel; findings in the same file go to one worker together. Minor findings: fix only if trivial, otherwise list them in the final report.
4. Run step 0 again, then the next round.

## Stop and ask me instead of looping if
the same finding is still open after two rounds, a worker reports `partial` or `blocked`, a finding needs a design decision, or 3 rounds pass without PASS.

## Finish
Report: rounds used, findings fixed (and by which worker), minor findings left, tests added, unresolved items. If you were called by the `build` skill, return control to it.
