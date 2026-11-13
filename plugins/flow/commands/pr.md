---
description: Commit, push and open a pull request for the current branch
argument-hint: [base branch]
---

1. Make sure the work is on a feature branch (not main) and tests pass.
2. Commit with a clear message, push, and open a PR with `gh pr create` (base: ${ARGUMENTS:-main}).
3. Summarize what changed and why in the PR description, then show me the URL.
