# claude-toolkit

Personal Claude Code plugin marketplace.

```
/plugin marketplace add vasibreban27/claude-toolkit
/plugin install flow@claude-toolkit
```

## flow

Plan, build, verify and ship with agents. Everything is a skill: just describe what you want
("plan a cancel-order endpoint", "build docs/plans/foo.md", "review my changes"), or invoke
one explicitly as `/flow:<name>`.

| Skill | Purpose | Auto-triggers |
|---|---|---|
| `plan` | Brainstorm, pick an approach, write `docs/plans/<slug>.md` | yes |
| `build` | Run a plan wave by wave with the worker agents | yes |
| `verify` | Review, fill test gaps, fix findings (bounded loop) | yes |
| `review` | Read-only review, no fixes | yes |
| `debug` | Bug path: reproduce, smallest fix, regression test | yes |
| `status` | Where a plan stands: tasks per wave, blockers, next step (read-only) | yes |
| `spike` | Time-boxed research that ends in a decision note (`docs/notes/<slug>-spike.md`) with one-line decisions tasks can cite | yes |
| `triage` | Sort a plan's Follow-ups into fix now, later or drop, with a reason each (read-only; `--apply` rewrites the section) | yes |
| `closeout` | Collect unresolved items, skipped tests, open live checks and manual steps; draft the PR description (read-only) | yes |
| `standup` | Short daily summary (done, doing, blocked) from git history and plan status (read-only) | yes |
| `pr` | Commit, push, open a PR (refuses on main, needs passing tests) | no (explicit only) |

Agents: `java-developer`, `python-developer`, `node-developer`, `frontend-developer`, `database-engineer`, `general-developer` (workers),
`reviewer` (sonnet, read-only), `test-writer`, `security-auditor` (opus for auth/crypto/secrets/payments, sonnet otherwise; read-only, conditional).

Fast feedback (0.10.0): a project can declare `Test (fast)`, `Test (changed)` and `Test (slow)` commands in its `CLAUDE.md`. `verify` runs `Test (changed)` in `--light` and per-wave runs and `Test (fast)` in `--full` rounds, reports the test duration and raises `STOP: slow-tests` if the fast suite takes over 60 s; `build` runs `Test (slow)` once at Finish; the PR description says the slow suite runs in CI. Without these lines nothing changes. Workers run only their task's `Done when` command plus typecheck. Plans allow at most 5 acceptance criteria per task (checked by `plan-lint`).

Shared conventions (0.11.0): stack rules and the default package layout live in `plugins/flow/conventions/<stack>.md` (`java`, `python`, `node`, `frontend`, `database`, `general`), read by both the `plan` skill and the matching worker. The planner picks the layout from `CLAUDE.md`, then the project's existing structure, then that file; writes it into the plan's `### Layout` and chooses `Owns` paths inside it (the guard only lets a worker write in `Owns`, so the plan fixes the structure). For a new project it adds a `## Project layout` section to `CLAUDE.md` so later plans and chats keep the same structure.

Hooks (`plugins/flow/hooks/`):
- `guard.js` blocks secret-file access and unsafe git for you and all agents. It also auto-approves exactly known safe commands (read-only git, and the test/lint/typecheck commands written in your `CLAUDE.md`; no `&&`, `;`, `|` or redirects), so those stop prompting. `FLOW_ALLOWLIST=off` disables that. Its path lists are in `hooks/protected-paths.json`, shared with the app ([docs/protected-paths.md](docs/protected-paths.md)).
- `session-start.js` (startup, resume, compact) injects up to 8 lines about the unfinished plan: branch, wave, counts, blockers, next step. Silent when there is none (`FLOW_SESSION_CONTEXT=off`).
- `format.js` (after Write/Edit) formats only the edited file with the project's own Prettier (local install plus a Prettier config) or Ruff (`[tool.ruff]`); `FLOW_FORMAT=off` disables it.
- `notify.js` shows a desktop alert when the session needs you; opt-in with `FLOW_NOTIFY=1`.
- `done-gate.js` checks each agent's final report (`Task:` line, `REPORT_JSON:`, `STOP:`) and sends a malformed one back once.
- `timing.js` appends per-agent duration, turns and task id to `.flow/timing.jsonl` (self-ignoring folder; `FLOW_TIMING=off` disables it).

Shared with the claude-desk app (the app loads these instead of keeping copies): the worker prompts in `plugins/flow/prompts/` ([docs/prompts.md](docs/prompts.md)), the protected-path lists, and the `REPORT_JSON` schema ([docs/report-json.md](docs/report-json.md)).

Tools: `plugins/flow/bin/plan-lint.js <plan>` validates a plan against [docs/plan-format.md](docs/plan-format.md) (`flow-plan/1`).
Copy [docs/threat-model.template.md](docs/threat-model.template.md) to `docs/threat-model.md` in a project so the security auditor knows what is in scope.

See [GUIDE.md](GUIDE.md) for how it all works together.
