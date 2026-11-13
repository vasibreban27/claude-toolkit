---
name: review
description: Read-only review of code changes by the reviewer agent; reports findings and fixes nothing. Use when the user asks for a review, a second opinion or a look at their diff, branch or PR before merging.
argument-hint: <range, default: current branch vs main>
---

Launch the `reviewer` agent on: $ARGUMENTS (if empty: the current branch against main, `git merge-base HEAD main`..HEAD, plus uncommitted changes).

Show me its findings as returned, most severe first. Do not fix anything; if I want fixes, use the `verify` skill.
