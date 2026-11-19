# How to work with flow

## The mental model

Three layers, each with one job:

| Layer | What it is | Runs where | Cost |
|---|---|---|---|
| **Skills** (`plan`, `build`, `verify`, `review`, `debug`, `status`, `spike`, `triage`, `closeout`, `standup`, `pr`) | Procedures. Claude loads one when your prompt matches its description, or you type `/flow:<name>`. | Your main conversation | Only the loaded skill's text |
| **Agents** (6 workers, `reviewer`, `test-writer`, `security-auditor`) | Specialists in their own clean context. They return one short report. | Isolated subagents | Their own tokens; your context only sees the report |
| **Hooks** (`hooks/*.js`) | Rules enforced by code, not by asking nicely: the guard, the report checker, timing, session context, formatting. | Around tool calls and agent start/stop, in main thread and subagents | Zero tokens (SessionStart adds up to 8 lines) |

Skills decide and orchestrate. Agents do the heavy reading and writing. Hooks make sure some things never happen.
Subagents cannot talk to you or start other subagents, so anything interactive (planning, debugging) is a skill in the main thread, and the loops are run by skills.

## The two paths

```
Feature:  plan ──► build ──► (per wave: workers ► verify) ──► pr
Bug:      debug ──► (verify if the fix is bigger than one file) ──► pr
Look:     review   (read-only, fixes nothing)
Unknown:  spike ──► decision note ──► plan (tasks cite D1, D2, ...)
Wrap up:  build ──► triage (Follow-ups) ──► closeout (PR text) ──► pr
Daily:    standup  (read-only summary from git and the plan)
```

- **`spike <question>`**: 15 tool calls or 20 minutes, then a note `docs/notes/<slug>-spike.md` with one-line decisions (D1, D2, ...), what changes if one is wrong, and the evidence. It writes no source.
- **`triage [plan] [--apply]`**: each Follow-up becomes fix now, later or drop with a short reason; `--apply` rewrites the section into those three groups and commits the plan file.
- **`closeout [plan]`**: lists what is still open (unresolved tasks, skipped or disabled tests found in the diff, live checks never run, manual steps) and drafts the PR description. It changes nothing; paste its text into `/flow:pr`.
- **`standup [since]`**: at most 10 lines: done, doing, blocked, next.

### Feature path, step by step

1. **Say what you want**: "plan a cancel-order endpoint". The `plan` skill (opus) reads `CLAUDE.md` and the relevant code, proposes 2-3 approaches and asks at most 3 questions in one round, each with a recommended answer (reply `accept all recommended` to take them all). It reads the repo once and writes `Read first:` per task, then runs `plan-lint` before showing you the plan.
2. **Review the plan file** `docs/plans/<slug>.md`: Goal (story + outcomes), Scope, Architecture (with the API contract), Risks, Test strategy, Tasks in waves. This is the only moment where your attention is cheap. Edit the file by hand if something is off.
3. **"Build docs/plans/<slug>.md"**. The `build` skill:
   - launches each wave's tasks in parallel, one worker per task (prompt = plan path + task id),
   - collects short reports (`Task: T3 – done | partial | blocked`),
   - runs `verify` on the wave's commits before starting the next wave,
   - ticks `Status:` in the plan: `[ ] todo` → `[~] built` → `[x] verified`, or `[!] blocked`,
   - stops only at **gates** (table in `skills/build/SKILL.md`): plan approval, a design decision, a source file outside `Owns`, anything irreversible, a task blocked after one retry, a cost or time cap. How often it also pauses between waves is the **autonomy** setting: `supervised` (every wave), `checkpoints` (default: after waves with a sensitive task), `autonomous` (gates only). Set it with an `Autonomy:` line in the plan, a `flow-autonomy: <value>` line in `CLAUDE.md`, or in the build prompt.
4. **`verify`** (per wave, scaled by the plan's `Sensitive:` field): a non-sensitive wave gets compile/lint/tests only. A sensitive wave also gets the `reviewer` and, in parallel, the `security-auditor` (delta-only, reads `docs/threat-model.md`). `test-writer` runs only for tasks marked `Tests: writer` or a finding that needs coverage. The matching worker fixes each blocker and major finding and adds its regression test. Max 2 rounds, then it asks you; minor findings go to the plan's Follow-ups. After the last wave, one reviewer pass over the whole branch covers any wave that skipped it.
5. **"Open a PR"** → `/flow:pr`. This one is explicit-only, because it pushes. It stops on main/master, runs the full tests first and warns if plan tasks are not verified.

### Stopping and resuming
The plan file is the memory. Say "status" (or `/flow:status`) to see which tasks are done, built, blocked or todo and what the next step is.
Before each wave `build` refuses to launch tasks whose `Owns` overlap, and after it checks that no worker changed files outside its `Owns`. Close the session whenever; later say "continue building docs/plans/<slug>.md". `build` skips `[x]` tasks, verifies waves that are all `[~]`, and re-dispatches `[ ]`/`[!]` tasks.

### Bug path
"Users get a 500 when the cart is empty" → `debug`: reproduce → ranked hypotheses → smallest fix → regression test → verify only if the fix was bigger than one file. No plan file, no workers.

## Seeing what happens
- Subagent work shows as collapsed tool calls; expand one to read its report. Each report is a fixed format, so you can skim: status, files, tests, notes.
- `git log` is the audit trail: workers commit per task (`feat(orders): … (T3)`), `test-writer` commits tests, `build` commits plan status.
- If a skill does not trigger from a sentence, type `/flow:<name>`, then add that sentence's wording to the skill's `description` so it triggers next time.

## Tuning knobs (where to change what)
| You want | Edit |
|---|---|
| Different stack guidance | `agents/<worker>.md` (the "what commonly goes wrong" section) |
| Stricter or looser reviews | `agents/reviewer.md` (checks, severity rules) |
| When security runs | `Sensitive:` per task in the plan; fallback surface check in `skills/verify/SKILL.md` (the Security paragraph) |
| What the auditor treats as in scope | `docs/threat-model.md` in the project (template: `docs/threat-model.template.md`) |
| When build pauses | `Autonomy:` in the plan, `flow-autonomy:` in `CLAUDE.md`, or the gate table in `skills/build/SKILL.md` |
| The plan format | `docs/plan-format.md` + `plugins/flow/bin/plan-lint.js`; changing it means bumping `flow-plan/N` and the claude-desk parser |
| A skill must not auto-trigger | add `disable-model-invocation: true` to its frontmatter |
| Cheaper/faster agents | `model:` in the agent's frontmatter (`sonnet`, `haiku`, `opus`) |
| Test speed | `Test (fast)`, `Test (changed)`, `Test (slow)` lines in your project's `CLAUDE.md`; worker test rules in `agents/<worker>.md` ("Test rules"); slow tests go in `*.slow.test.ts` |
| Project conventions | your project's `CLAUDE.md`; every agent reads it first and it beats the agent files |

## Hooks: rules that always apply

`hooks/guard.js` runs before every `Read/Edit/Write/Grep/Glob/Bash/PowerShell` call, for you and for every subagent. A block returns the reason to the agent so it can adapt.

| Rule | Blocked |
|---|---|
| No secrets | `.env`, `.env.*` (not `.example/.sample/.template`), `*.pem/*.key/*.p12/*.jks`, SSH private keys, `credentials*`, `secrets*`, `application-prod.*` |
| No env dumps | `printenv`, bare `env`/`set` |
| Safe git | force push, any push that lands on `main`/`master` (`origin main`, `HEAD:main`, `HEAD:refs/heads/main`, a bare `git push` while on main), `--no-verify`, recursive delete of `/`, `~`, `.`, `*` |
| Subagents | never `git push`, `merge`, `checkout`/`switch` (only the `pr` skill or you publish); stage and commit by explicit path only (`git add -- files`, `git commit -m msg -- files`; no `add -A`/`.`, no `commit -a`), because workers share one checkout |
| Protected paths (writes) | lockfiles (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `poetry.lock`, `uv.lock`, …) → use the package manager; generated code (`generated/`, `generated-sources/`, `__generated__/`, `*.generated.*`) → change the source and regenerate; **applied migrations** (Flyway/Liquibase/`migrations/` files that already exist on `main`) → add a new migration. Migrations created on your feature branch stay editable, and Flyway `R__` repeatable ones too. |
| Noise directories (reads) | Read/Grep/Glob inside `node_modules`, `.git`, `.venv`, `venv`, `__pycache__`, `.angular`, `.next`, `.gradle`, `.idea`; `target`, `dist`, `build`, `out`, `coverage` when they are a top-level or module folder (a Java package named `build` is fine); `*.min.js/css`, `*.map`. Saves tokens. |

**Allow-list (fewer prompts).** After every rule above has passed, the guard answers "allow" for a command that is exactly known safe, so Claude Code does not ask. Two kinds qualify: read-only git (`status`, `diff`, `log`, `show`, `rev-parse`, `merge-base`, `ls-files`, `blame`, plain `branch`/`tag`/`remote -v`/`stash list`; no global options such as `-c` or `-C`, no `--output`, `--no-index`, `--ext-diff`, no secret path behind a revision like `HEAD:.env`), and the test, lint and typecheck commands written in your project's `CLAUDE.md`, matched exactly (no extra arguments, only runners such as `npm`, `npx`, `mvn`, `gradlew`, `pytest`, `cargo`, `go`, `dotnet`, `make`, and never `install`/`ci`/`publish`/`dev`). The whole command must be plain words and paths: any `&&`, `;`, `|`, `&`, redirect, quote, `$(...)`, backtick, glob or newline means no match, so `npm test && curl evil` still prompts. Your own deny and ask rules still apply on top. Trust note: `npm test` runs the repo's own scripts, so this assumes you already trust the repo. Turn it off with `FLOW_ALLOWLIST=off`.

**Other hooks.** `session-start.js` (startup, resume, compact) injects up to 8 lines about the unfinished plan in `docs/plans/`, so a compacted build keeps its place; it prints nothing when no plan is open. `format.js` runs after Write/Edit/MultiEdit and formats only that file, only if the project has its own Prettier (installed locally, with a config; never `.md` or `docs/plans/`) or a `[tool.ruff]` section; it adds a Node start plus the formatter to every edit, so turn it off with `FLOW_FORMAT=off` if edits feel slow. `notify.js` is a desktop alert for permission prompts, idle and questions, off unless `FLOW_NOTIFY=1`. All three fail open.

Escape hatches, for the rare case you really want it: set `FLOW_ALLOW_NOISE=1` or `FLOW_ALLOW_PROTECTED=1` before starting Claude (or in the `env` block of your settings). The secret-file rules have no escape hatch on purpose.

Bare words such as "credentials" or "secrets" in a search or commit message are fine, and so are source files like `secrets/store.ts`; only data/config files (`secrets.json`, `credentials.yml`, `secrets/db.txt`) are blocked.

Tests: `node --test plugins/flow/hooks/test/*.test.js plugins/flow/bin/*.test.js`. Add a case to the table there with every rule you add.

Agent reports end with a one-line `REPORT_JSON: {...}` footer, and a `STOP: <code>: <reason>` line when the agent cannot finish, so the app can parse them. STOP codes are `blocked`, `scope`, `decision` and `limit` (see `skills/build/SKILL.md`); `done-gate.js` checks the report format when an agent stops and sends a malformed report back once (it never loops: it honors `stop_hook_active`). `timing.js` logs agent time to `.flow/timing.jsonl`. Both hooks fail open, unlike `guard.js`; set `FLOW_DONE_GATE=off` or `FLOW_TIMING=off` to disable them. Agents have a `maxTurns` cap in their frontmatter (Claude Code returns the output marked partial when it is hit).

Add a rule: add a line in `guard.js` with a regex and a `block("reason")`. Test it by piping a sample, e.g.
`echo '{"tool_name":"Bash","tool_input":{"command":"cat .env"}}' | node plugins/flow/hooks/guard.js; echo $?` → prints the reason and `2`.
If the script itself crashes it allows the call, so a bug never locks you out.

Limits to know: hooks match text patterns, so they stop the common accidental paths, not a determined workaround. They also stop *you* in this repo if you ask Claude to read `.env`; that is intentional. The formatter hook does not cover Java (Spotless works per project, not per file).

## After updating the plugin
```
/plugin marketplace update claude-toolkit
/plugin install flow@claude-toolkit      # or update it
/reload-plugins                          # new skills, agents and hooks load
```
Bump `version` in `plugins/flow/.claude-plugin/plugin.json` on every change, otherwise installed copies may not update.
