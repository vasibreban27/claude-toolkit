---
name: pr
description: Commit, push and open a PR with gh. Pushes, so explicit invocation only.
argument-hint: <base branch>
disable-model-invocation: true
---

1. Make sure the work is on a feature branch (not main or master), the tree is clean or intentionally committed, and tests pass.
2. Commit anything left with a clear Conventional Commits message.
3. Push and open a PR with `gh pr create` (base: $ARGUMENTS, or `main` if empty).
4. Write the PR description from the plan in `docs/plans/` if one exists (goal, what changed, how it was tested), otherwise from the commits. Show me the URL.
