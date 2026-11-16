---
name: pr
description: Commit, push and open a PR with gh. Pushes, so explicit invocation only.
argument-hint: <base branch>
disable-model-invocation: true
---

1. **Branch**: run `git branch --show-current`. If it is `main`, `master` or empty (detached HEAD), stop and tell me; do not create or switch branches on your own. Ask me for a branch name, then `git switch -c <name>`.
2. **Tree**: run `git status --short`. Commit leftovers with a Conventional Commits message, staging by explicit path. If something looks unrelated to this work, ask me first.
3. **Tests**: run the project's full test command (from `CLAUDE.md`, `package.json`, `pom.xml` or `pyproject.toml`). If any test fails, stop and show me the output. Never push with failing tests.
4. **Verified?**: if a plan in `docs/plans/` applies, check that its tasks are all `[x] verified`. If not, say which are not and ask whether to go on.
5. **Push and PR**: `git push -u origin <branch>` (never force), then `gh pr create` with base `$ARGUMENTS` (or `main` if empty).
6. **Description**: from the plan if one exists (goal, what changed, how it was tested, the plan's `## Follow-ups`), otherwise from the commits. Show me the URL.
