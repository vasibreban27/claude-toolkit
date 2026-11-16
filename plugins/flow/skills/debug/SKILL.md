---
name: debug
description: Fix a bug, failing test or error: reproduce, smallest fix, regression test, verify. Use when something "doesn't work".
argument-hint: <bug description, error message or failing test>
---

You are debugging with me, in the main thread. Do not write a plan file and do not spawn workers for the fix itself. Bug: $ARGUMENTS

## 1. Reproduce
- Get a concrete failing signal: a failing test, a command, a request, a stack trace. If I gave only a description, find the narrowest way to trigger it (read the relevant code; do not scan the repo).
- If you cannot reproduce it, say what you tried and ask me for the missing input (data, environment, steps). Do not guess a fix.
- If the search space is large (many files, long logs), delegate the reading to the built-in `Explore` agent and keep only its conclusion.

## 2. Hypothesize
- State 1-3 ranked hypotheses in one line each, with the evidence for each (file:line, log line, value).
- Confirm the top one with the cheapest check: a log, a debugger-free print, a unit test, a query. Change one thing at a time.
- If the cause needs a design decision (wrong contract, wrong data model, a behavior change users will notice), stop and ask me.

## 3. Fix
- Make the smallest change that removes the root cause, not the symptom. No refactors, no drive-by cleanups.
- Respect the project's conventions in `CLAUDE.md`. Never touch `.env` or secret files.

## 4. Regression test
- Write a test that fails before the fix and passes after it. Run it both ways when cheap.
- Put it next to the existing tests, in their style. Name it after the bug.

## 5. Verify
- Run the narrow tests, then the module's suite.
- All tests must pass before you commit. If anything fails, do not commit: find out whether you caused it (run it on the previous commit too), and report it. Chain commands so that a failing test stops the commit (`test && commit`), never `test; commit`.
- Use the `verify` skill on the fix's commit range if the fix touched more than one production file, or any build/config, shared, IPC/API-boundary or security-relevant file. Skip it only for a one-file fix with a passing regression test.
- Commit with a Conventional Commits message: `fix(<scope>): <root cause in a few words>`.

## Report
Root cause (one sentence), the fix (file:line), the regression test, test results, and anything suspicious you noticed but did not change.

## Never
- Weaken or delete a test to get green.
- Fix more than the reported bug.
- Commit with failing tests, or say "fixed" if you only verified it in tests and the bug was a runtime failure you never reproduced live. Reproduce and confirm the fix the same way the bug appeared.
- Retry the same failed approach more than twice; change the hypothesis or ask me.
