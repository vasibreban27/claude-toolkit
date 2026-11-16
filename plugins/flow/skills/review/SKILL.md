---
name: review
description: Read-only review of a diff, branch or PR by the reviewer agent; fixes nothing.
argument-hint: <range, default: current branch vs main>
---

Launch the `reviewer` agent on: $ARGUMENTS (if empty: the current branch against main, `git merge-base HEAD main`..HEAD, plus uncommitted changes).

Show me its findings as returned, most severe first. Do not fix anything; if I want fixes, use the `verify` skill.
