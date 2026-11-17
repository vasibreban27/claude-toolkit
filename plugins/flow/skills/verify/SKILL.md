---
name: verify
description: Review changes, fill test gaps and fix findings in a bounded loop (reviewer, security-auditor, test-writer, workers), scaled to how sensitive the change is. Use to verify, harden or "review and fix"; for a read-only look use review.
argument-hint: <range, e.g. abc123..HEAD> <plan path> [--light|--full|--phase]
model: sonnet
---

Verify the changes in: $ARGUMENTS (if no range is given, use the current branch against its base: `git merge-base HEAD main`..HEAD, plus uncommitted changes).

You orchestrate; subagents do the work. Findings use the reviewer's ids (F1, F2, …) and the security auditor's ids (S1, S2, …). Gates, STOP codes and autonomy are defined in the `build` skill.

## Mode
Take it from the arguments. Without a flag, derive it: find the plan tasks whose ids appear in the commit messages of the range; `--full` if any has `Sensitive: yes`, `--light` if all have `Sensitive: no`. If the field is missing (older plan) or there is no plan, use the surface check in "Security" below and pick `--full` when it matches, otherwise `--light`.

| Mode | Runs |
|---|---|
| `--light` | Step 0 only (compile, lint, tests). No agents. Used for non-sensitive waves. |
| `--full` | Step 0, reviewer, security-auditor (see "Security"), test-writer only if asked (see "Tests"), up to 2 fix rounds. |
| `--phase` | Step 0 and the reviewer once over the whole range (the whole branch). No auditor (sensitive waves were audited already), no test-writer. Up to 2 fix rounds. |

## Step 0: cheap checks first (every mode)
Run the project's compile/lint/test commands (from `CLAUDE.md`, `package.json`, `pom.xml` or `pyproject.toml`). If they fail, route the failures to the matching worker (see the table below) and re-run until they pass, counting each attempt as a round. Do not call the reviewer on a broken build. `--light` ends here: report and return control.

## Loop (at most 2 rounds; blocker and major findings only)
Keep the HEAD sha at the start of each round.
1. **Reviewer**: run `git diff <range>` yourself and pass the diff text in the prompt, with the plan path and the open finding ids. If the diff is longer than about 1500 lines, pass `git diff --stat` and tell the reviewer to read the large files itself. In round 2 the range is `<round 1 start sha>..HEAD`, plus the open finding ids.
   **Security** (`--full` only, same step, in parallel): launch `security-auditor` if any task in the range is `Sensitive: yes`. When the plan has no `Sensitive` field, fall back to the surface check: skim `git diff --name-only <range>` and launch it only if the change touches authentication or authorization (security config, filters, guards, roles, tokens), request or input handling (controllers, DTO binding, validators, deserialization), query building (raw SQL/JPQL/Mongo filters, `@Query`, string-built queries), secrets or config (properties/yaml, credentials, keys), or file upload/download and path handling. If neither applies, say "security audit skipped: no sensitive surface".
   Auditor input: the range, the plan path, the open finding ids, and this rule verbatim: "Audit only lines added in this range (`git diff <range>`). Do not re-audit older code; read it only to understand a trust boundary." In round 2 the range starts at the sha where round 1 started. The auditor reads `docs/threat-model.md` itself.
   **Model**: the agent defaults to opus. Launch it with the `model` override `sonnet` when the only matches are lower-risk (config/properties, input validation or DTO binding, file path handling) and nothing touches authentication, authorization, crypto, token handling, secrets or payments; keep opus whenever one of those is touched. In round 2 re-run it only if a security finding is open or the fixes touched such files.
   If every launched agent returns `Verdict: PASS`, go to Finish.
2. **Tests** (round 1 only): launch `test-writer` once, only if a task in the range has `Tests: writer`, or a round-1 finding needs coverage that no existing test gives. Pass the range, the plan path and the findings to cover. Tasks already carry test requirements in their acceptance criteria; do not run it by default. It does not run in round 2: a worker fixing a finding adds the regression test as part of the fix.
3. **Fix** every open `blocker` and `major` finding (F and S ids), and every real bug that `test-writer` reported. Pick the fixer by the file the finding points to:

   | File | Fixed by |
   |---|---|
   | `.java` | `java-developer` |
   | `.py` | `python-developer` |
   | `.sql`, migrations, Mongo schema/index files | `database-engineer` |
   | Node/TypeScript outside the UI: Electron main process, preload, IPC, services, scripts | `node-developer` |
   | Angular or React files (`.ts`, `.tsx`, `.html`, `.scss` in the UI app / renderer) | `frontend-developer` |
   | anything else | you fix it in the main thread; do not spawn an agent |

   When delegating, pass the finding in full (id, file:line, problem, scenario, suggested fix, failing test output). Say explicitly: this is a fix assignment, the finding is the task, the files named in the finding are the files it owns (overriding the plan's `Owns`), use the finding id where a task id is expected, and add a regression test for the finding (unless one exists). Findings in different files go out in parallel; findings in the same file go to one worker together.
   **Minor findings are not fixed in the loop**: collect them (id, file, problem, one line each) and return them to the caller for `## Follow-ups`.
4. Run step 0 again, then round 2 (if round 1 had open findings). After round 2 the loop ends.

## Severity rubric (applies to reviewer and auditor)
- `blocker`: the change breaks the build, loses data, or has an exploit reproduced in the app's real context.
- `major`: wrong behavior against an acceptance criterion or the contract, or a security weakness with a concrete reproduction in the app's real context (inside `docs/threat-model.md` if it exists).
- `minor`: everything else, including hardening, style, and anything outside the threat model. Minor never blocks.
A `blocker` or `major` without a reproduction (input or steps and the wrong result) is downgraded to `minor`.

## Stop and ask me instead of looping if
an agent report has a `STOP:` line (its last line `REPORT_JSON:` carries the same data), a worker reports `partial` or `blocked` after one retry, a finding needs a design decision (`STOP: decision`), or a `blocker` or `major` finding is still open after round 2 (`STOP: limit`). Never start a third round on your own.

## Finish
Report: mode, rounds used, findings fixed (and by which worker), minor findings left (listed, for Follow-ups), tests added, unresolved items. If you were called by the `build` skill, return control to it.
