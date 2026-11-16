# How to work with flow

## The mental model

Three layers, each with one job:

| Layer | What it is | Runs where | Cost |
|---|---|---|---|
| **Skills** (`plan`, `build`, `verify`, `review`, `debug`, `pr`) | Procedures. Claude loads one when your prompt matches its description, or you type `/flow:<name>`. | Your main conversation | Only the loaded skill's text |
| **Agents** (4 workers, `reviewer`, `test-writer`, `security-auditor`) | Specialists in their own clean context. They return one short report. | Isolated subagents | Their own tokens; your context only sees the report |
| **Hooks** (`hooks/guard.js`) | Rules enforced by code, not by asking nicely. | Before every tool call, in main thread and subagents | Zero tokens |

Skills decide and orchestrate. Agents do the heavy reading and writing. Hooks make sure some things never happen.
Subagents cannot talk to you or start other subagents, so anything interactive (planning, debugging) is a skill in the main thread, and the loops are run by skills.

## The two paths

```
Feature:  plan ──► build ──► (per wave: workers ► verify) ──► pr
Bug:      debug ──► (verify if the fix is bigger than one file) ──► pr
Look:     review   (read-only, fixes nothing)
```

### Feature path, step by step

1. **Say what you want**: "plan a cancel-order endpoint". The `plan` skill (opus) reads `CLAUDE.md` and the relevant code, asks at most 3 questions at a time, proposes 2-3 approaches, and waits for your pick.
2. **Review the plan file** `docs/plans/<slug>.md`: Goal (story + outcomes), Scope, Architecture (with the API contract), Risks, Test strategy, Tasks in waves. This is the only moment where your attention is cheap. Edit the file by hand if something is off.
3. **"Build docs/plans/<slug>.md"**. The `build` skill:
   - launches each wave's tasks in parallel, one worker per task (prompt = plan path + task id),
   - collects short reports (`Task: T3 – done | partial | blocked`),
   - runs `verify` on the wave's commits before starting the next wave,
   - ticks `Status:` in the plan: `[ ] todo` → `[~] built` → `[x] verified`, or `[!] blocked`.
4. **`verify`** (per wave): compile/lint/tests first; then `reviewer` (always) and `security-auditor` (only if the diff touches auth, input handling, query building, secrets or uploads) in parallel; `test-writer` fills gaps once (round 1 only); the matching worker fixes each finding and adds its regression test; re-review only what changed. Max 3 rounds, then it asks you.
5. **"Open a PR"** → `/flow:pr`. This one is explicit-only, because it pushes.

### Stopping and resuming
The plan file is the memory. Close the session whenever; later say "continue building docs/plans/<slug>.md". `build` skips `[x]` tasks, verifies waves that are all `[~]`, and re-dispatches `[ ]`/`[!]` tasks.

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
| When security runs | `skills/verify/SKILL.md` (the Security paragraph) |
| A skill must not auto-trigger | add `disable-model-invocation: true` to its frontmatter |
| Cheaper/faster agents | `model:` in the agent's frontmatter (`sonnet`, `haiku`, `opus`) |
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

Escape hatches, for the rare case you really want it: set `FLOW_ALLOW_NOISE=1` or `FLOW_ALLOW_PROTECTED=1` before starting Claude (or in the `env` block of your settings). The secret-file rules have no escape hatch on purpose.

Bare words such as "credentials" or "secrets" in a search or commit message are fine, and so are source files like `secrets/store.ts`; only data/config files (`secrets.json`, `credentials.yml`, `secrets/db.txt`) are blocked.

Tests: `node --test plugins/flow/hooks/guard.test.js`. Add a case to the table there with every rule you add.

Agent reports end with a one-line `REPORT_JSON: {...}` footer, and a `STOP: <code>: <reason>` line when the agent cannot finish, so the app can parse them. Agents have a `maxTurns` cap in their frontmatter (Claude Code returns the output marked partial when it is hit).

Add a rule: add a line in `guard.js` with a regex and a `block("reason")`. Test it by piping a sample, e.g.
`echo '{"tool_name":"Bash","tool_input":{"command":"cat .env"}}' | node plugins/flow/hooks/guard.js; echo $?` → prints the reason and `2`.
If the script itself crashes it allows the call, so a bug never locks you out.

Limits to know: hooks match text patterns, so they stop the common accidental paths, not a determined workaround. They also stop *you* in this repo if you ask Claude to read `.env`; that is intentional. Hook rules for formatting (e.g. run Prettier/Spotless after edits) are the next candidate: they cost no tokens, but need your formatter commands, so add them per project.

## After updating the plugin
```
/plugin marketplace update claude-toolkit
/plugin install flow@claude-toolkit      # or update it
/reload-plugins                          # new skills, agents and hooks load
```
Bump `version` in `plugins/flow/.claude-plugin/plugin.json` on every change, otherwise installed copies may not update.
