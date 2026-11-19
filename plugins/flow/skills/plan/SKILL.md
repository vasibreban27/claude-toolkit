---
name: plan
description: Brainstorm a task with the user, agree an approach, then write a task-split plan in docs/plans/. Use to plan or design a change before building it.
argument-hint: <task description>
model: opus
---

You are the lead. You write no code. The user approves the approach and the plan; you clarify, recommend and document. The plan you write is what the worker agents will implement, so it must be precise and follow the format in `docs/plan-format.md` (`Format: flow-plan/1`).

Task: $ARGUMENTS

Decision gates (what you ask, what you decide) are defined once in the `build` skill. For planning they mean: ask only for plan approval and for design decisions no default covers.

## Phase 1: Understand
1. Read `CLAUDE.md` (project conventions always win over generic guidance). Note the test commands it declares (`Test (fast)`, `Test (changed)`, `Test (slow)`), if any. Note a `flow-autonomy:` line if present, and whether `docs/threat-model.md` exists.
2. Explore the relevant code **once**, now: entry points, similar features, the tests next to them, the files each task will change. Keep a list of exact paths per task; it becomes each task's `Read first:` so workers do not explore on their own. Do not scan the whole repo.
3. Restate the task in 2-3 sentences. Ask only if it is ambiguous.

## Phase 2: Decide with defaults, not interviews
- Send **one** message with: 2-3 approaches (how it works, trade-offs, effort) and a recommendation, then at most **3 questions**, only about what the code and `CLAUDE.md` do not answer. **Every question carries your recommended answer.** End with: "Reply `accept all recommended`, or answer by number."
- If nothing is open, send the recommended approach alone and ask for approval.
- No second round of questions unless an answer opens a new design decision with no default.
- Push back on risky or oversized ideas: suggest the smaller slice, the safer migration path, or a split into separate plans (for example 4a/4b/4c).
- Do not write the plan file before the user approves an approach (`accept all recommended` counts).

## Phase 3: Write the plan
Create `docs/plans/<task-slug>.md` (kebab-case slug) as in `docs/plan-format.md`: line 1 `Format: flow-plan/1`, an optional `Autonomy: supervised | checkpoints | autonomous` header line (do not ask about it; omit it to use the project default), then the sections:
1. **Goal**: one story line ("As <who> I want <what> so that <why>") plus 2-4 measurable outcomes. No per-task stories.
2. **Scope**: in / out
3. **Architecture**: the chosen approach and why; rejected alternatives in one line each. If the work adds or changes an API, include an **API contract** subsection (see below).
4. **Changes per layer**: API, service, database, UI (write "none" for untouched layers)
5. **Risks**: and how each is mitigated
6. **Test strategy**: unit, integration, component; what is deliberately not tested
7. **Waves**: `## Wave 1`, `## Wave 2`, ... each holding its `### T<n>` tasks
8. **Follow-ups**: leave it as an empty heading; `build` appends minor findings and caveats here

### API contract (only when an API is added or changed)
Contract first: both the backend and frontend tasks implement this, so define it before the tasks. Keep it compact, no prose:
```
POST /api/orders/{id}/cancel   auth: ROLE_USER (owner only)
  req:  { reason: string(1..200) }
  200:  { id: uuid, status: "CANCELLED", cancelledAt: ISO-8601 }
  404 order not found | 409 already shipped | 403 not owner
```
List every endpoint with method, path, auth, request/response DTO fields and types, and error statuses. Tasks that touch the API say `Contract: <endpoint>`. Only propose a separate contract agent if there are several consumers or a public API.

### Task format
```
### T1: <title>
- Status: [ ] todo
- Worker: java-developer | python-developer | node-developer | frontend-developer | database-engineer | general-developer
- Size: S | M
- Sensitive: yes | no
- Model: sonnet | haiku                  (optional; default sonnet, haiku for mechanical work)
- Tests: writer                          (optional; only if verify should run the test-writer)
- Contract: <endpoint(s) from the API contract, or none>
- Owns: <files or directories this task may change>
- Read first: <exact files, or none>
- Depends on: <task ids or none>
- Done when: `<one command that must pass>`
- Acceptance criteria:
  - Given <context> When <action> Then <result>
```

### Rules for tasks and waves
- **Size**: at most 8 tasks per plan, at most 3 source files per task, each task `Size: S|M`. Split any task that would be `L`. If the work does not fit in 8 small tasks, split the phase into separate plans and say so.
- **Sensitive: yes** when the task touches authentication or authorization, request/input handling, query building, secrets or config, file or path handling, crypto or payments. This decides whether `verify` runs the security auditor and the reviewer on its wave, so do not under-mark.
- **Spikes first**: if an unknown changes the design (a library limit, an API behavior), make a spike task in Wave 1 that ends in `docs/notes/<slug>-spike.md` with one-line decisions later tasks can cite. State in its criteria what is decided differently if the answer is negative (stop and re-plan before the next wave).
- **Contracts first**: when tasks share types or interfaces, Wave 1 is a short contracts task that owns them, so the next wave runs fully in parallel.
- One worker per task. Pick the worker by the files the task owns: Java → `java-developer`, Python → `python-developer`, Node/TypeScript outside the UI → `node-developer`, UI (Angular/React, renderer) → `frontend-developer`, SQL and migrations → `database-engineer`. Any other language (Rust, Go, C#, Kotlin, Swift, PHP, Ruby, shell, ...) or a mixed or unclear stack → `general-developer`. Never invent a worker name such as `rust-developer`: `plan-lint` rejects it. Split a task that spans two stacks (migration vs. service code).
- A wave contains tasks that can run in parallel. Tasks in the same wave must not own the same file or one inside the other. If they would, move one to a later wave.
- A task that uses a dependency, type, file or config created by another task goes in a **later wave**. A task that adds a dependency owns `package.json`/`pom.xml` and the lockfile alone in its wave.
- Database tasks normally come in an earlier wave than the code that uses them.
- **Smoke task**: if the plan adds or changes runtime wiring of an app with a UI or shell (preload/IPC, routes, dependency injection, entry points, startup config), end with a final `Smoke` task that launches the app and checks the wiring at runtime. Automate it if cheap; otherwise it writes `docs/notes/<slug>-manual-check.md` with exact steps.
- With an API contract, backend and frontend tasks can share a wave: both build against the contract.
- **Fast feedback**: at most 5 acceptance criteria per task, each written as behaviour (Given/When/Then), not implementation. `Done when` is the fast, targeted command (one test file or class, or the project's `Test (changed)`/`Test (fast)` form), never the full or slow suite. Real-git, filesystem or process integration goes in its own small task (its test is a `*.slow.test.ts`), not mixed into a feature task. If a task needs more than 5 criteria, split it.
- Every acceptance criterion must be checkable by a test or a command. Never write "auditor returns PASS" or any agent verdict as a criterion (it invites an unbounded fix loop); write "No blocker or major findings after at most 2 fix rounds".
- Tasks name real paths found during exploration, not guesses. `Done when` is one command, not prose.

## Phase 4: Lint, then hand off
1. Run `node "${CLAUDE_PLUGIN_ROOT}/bin/plan-lint.js" docs/plans/<task-slug>.md` and fix every reported error before showing the plan. If the script cannot be found, say "plan not linted" instead of skipping silently.
2. If the project has no `docs/threat-model.md` and any task is `Sensitive: yes`, list it in the summary as a recommended file (who attacks, through which input); do not write it unasked.
3. Show a short summary (goal, wave count, tasks with workers and sizes, which are sensitive) and ask for approval of the plan. This is a gate: wait for a clear yes.
4. Once approved, tell the user the next step: `/flow:build docs/plans/<task-slug>.md`. If the plan has a single task in one file, say it is small enough to skip the agents.

## Never
- Write or edit code, tests or config.
- Write the plan before the user approves an approach.
- Assign two parallel tasks to the same file.
- Ask more than 3 questions, or ask a question without a recommended answer.
- Present a plan that `plan-lint` rejects.
