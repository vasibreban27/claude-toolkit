# Plan format: `flow-plan/1`

The contract between the `plan` skill, `build`, `verify`, `status`, `plan-lint` and the claude-desk parser (`src/main/pipeline/planParser.ts`). Any change to this file bumps the version in line 1 of every plan, `FORMAT` in `plugins/flow/bin/plan-lint.js`, and the app parser together. Validate with:

```
node plugins/flow/bin/plan-lint.js docs/plans/<slug>.md
```

A complete example is `plugins/flow/bin/fixtures/valid-plan.md` (also the lint test fixture).

## Layout
```
Format: flow-plan/1
Autonomy: supervised | checkpoints | autonomous      (optional header field)

# <title>
## Goal
## Scope
## Architecture            (with an "### API contract" subsection when an API changes)
## Changes per layer
## Risks
## Test strategy
## Wave 1
### T1: <title>
...
## Wave 2
...
## Follow-ups
```
- Line 1 is exactly `Format: flow-plan/1`. Header fields sit between it and the first heading.
- Waves are `## Wave <n>` headings, numbered 1, 2, 3 in order. Tasks are `### T<n>: <title>` headings inside a wave. Lint requires `## Goal`, `## Follow-ups` and at least one wave.

## Task fields
Each is one line `- Name: value`, except `Acceptance criteria`.

| Field | Required | Value |
|---|---|---|
| `Status` | yes | `[ ] todo`, `[~] built`, `[x] verified`, `[!] blocked: <note>`; only `build` edits it |
| `Worker` | yes | `java-developer`, `python-developer`, `node-developer`, `frontend-developer`, `database-engineer` |
| `Size` | yes | `S` or `M`; `L` is rejected (split the task) |
| `Sensitive` | yes | `yes` or `no`; `yes` when the task touches authn/authz, input handling, query building, secrets or config, file or path handling, crypto or payments |
| `Model` | no | `haiku`, `sonnet` or `opus`; default `sonnet`; `haiku` for mechanical work |
| `Tests` | no | `writer` to have `verify` run the test-writer for this task |
| `Contract` | yes | endpoint(s) from the API contract, or `none` |
| `Owns` | yes | comma-separated files or directories (directories end in `/`) |
| `Read first` | yes | comma-separated exact files the worker reads before starting, or `none` |
| `Depends on` | yes | task ids, comma-separated, or `none` |
| `Done when` | yes | one command in backticks that must pass |
| `Acceptance criteria` | yes | the line `- Acceptance criteria:` followed by indented `  - ` bullets |

## Rules checked by `plan-lint`
- At most 8 tasks per plan, at most 3 source files in `Owns` per task (directories, `*.md` files and test paths are not counted).
- Task ids are unique. A dependency must exist and sit in a strictly earlier wave.
- No two tasks in one wave own the same path, or a path inside another's.
- Acceptance criteria never use an agent verdict ("auditor returns PASS"); use "No blocker or major findings after at most 2 fix rounds".
- At most 5 acceptance criteria per task (bullets), each written as behaviour.
- No unknown task fields, no duplicate fields.

## Changes the claude-desk parser needs for `flow-plan/1`
1. Read and require line 1 `Format: flow-plan/1`; reject any other value.
2. Parse the optional `Autonomy:` header field.
3. Parse waves from `## Wave <n>` headings and tasks from `### T<n>: <title>` blocks.
4. Add task fields `Size`, `Sensitive`, `Read first`, `Done when`, optional `Model`, optional `Tests`, with the value sets above.
5. Update the parser fixture test from `plugins/flow/bin/fixtures/valid-plan.md` and keep rejecting unknown or missing fields.
6. Surface the report STOP codes (see `skills/build/SKILL.md`) in the "needs you" queue.
