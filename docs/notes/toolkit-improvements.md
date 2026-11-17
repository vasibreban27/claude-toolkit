# claude-toolkit (`flow`) improvements: speed and autonomy

Written 2026-11-17 (copied from claude-desk). Work in `plugins/flow`, starting from 0.7.0.

## Goal
The toolkit and claude-desk must beat the Claude Code terminal on time, tokens and usage. A prompt should get the job done without the user intervening each time; the user is asked only at steps that matter.

## Evidence
Phase 3 of claude-desk, `build` on 2026-11-17: 2h07 in total (plan committed 08:17, last wave verified 10:24).

| Wave | Total | Workers building | Verify and fix rounds |
|---|---|---|---|
| 1 | 12 min | ~10 | ~2 |
| 2 | 45 min | ~4 | ~41 |
| 3 | 43 min | ~7 | ~36 |
| 4-6 | 27 min | ~15 | ~12 |

- Waves 2 and 3 were 88 of 127 minutes; about 77 were security-audit and fix commits.
- Phase 2 shows the same pattern (audit rounds S10 to S74, increasingly exotic).
- Checks are not the bottleneck: tests 86 s, typecheck 8 s, lint 8 s.
- The planner asked several question rounds the user had to answer or delegate.

## Releases
- **0.8.0 "speed and autonomy"**: items 1 to 5, plus the done-gate and telemetry hooks from item 9.
- **0.9.0**: items 6 and 7, plus hooks: PreToolUse allow-list, SessionStart.
- **Later**: item 8.

## 1. Tiered verify
- `Sensitive: yes|no` per task. `verify` launches the security-auditor only when a task in the range is `yes` (surface heuristics as fallback when the field is missing).
- Non-sensitive waves: step 0 only (typecheck, lint, tests). Reviewer once per phase on the whole range, or on waves with `Sensitive: yes`.
- test-writer only when a task says `Tests: writer` or a finding needs coverage.
- 2 rounds, blocker and major only. Minor findings go to `## Follow-ups`. Open after round 2: stop and ask.
- Auditor input: range, commit last audited through, delta-only rule.
- Per-project `docs/threat-model.md`; a finding outside it is `minor`. `blocker` and `major` need a reproduction in the real context.
- Reviewer accepts the diff in the prompt instead of running git.
- Planners never write "auditor returns PASS" as acceptance; write "no blocker or major findings after at most 2 fix rounds".

## 2. Decision gates and autonomy
| Ask the user | Decide automatically |
|---|---|
| Plan approval | Minor findings (to Follow-ups) |
| Design decision no default covers | Test or doc files outside `Owns` |
| Source file changed outside `Owns` | Wave transitions |
| Anything irreversible (push, merge, delete) | Fix rounds within the round limit |
| Task blocked after its retry budget | Status and plan commits |
| Cost or time cap reached | |

- `autonomy: supervised | checkpoints | autonomous`.
- STOP taxonomy: `STOP: blocked`, `scope`, `decision`, `limit`, with gates marked.
- Out-of-scope test/doc files are accepted and listed in Follow-ups; only source files stop the wave.

## 3. Planner: defaults instead of questions
- Every question has a recommended answer; one round of at most 3; "Accept all recommended" is one reply.
- Explore once, write `Read first:` per task.
- Spike tasks first for design-changing unknowns, with what changes if negative.
- At most 8 tasks per plan, at most 3 source files per task, `Size: S|M|L`, split any `L`.
- Contracts first when tasks share types.

## 4. Versioned plan format
- First line `Format: flow-plan/1`; bump on any change.
- New task fields: `Size`, `Sensitive`, `Read first`, `Done when`, optional `Model`, `Tests`.
- `plan-lint` (Node script): fields, unique ids, deps in earlier waves, no `Owns` overlap in a wave, size rules. `plan` runs it before presenting.
- Real plan as test fixture; list the claude-desk parser changes (`src/main/pipeline/planParser.ts`).

## 5. Model and limits per role
- `model: sonnet` on `build` and `verify`; `plan` keeps opus.
- `Model:` per task: default sonnet, haiku for mechanical work.
- `maxTurns` on every worker (verify against docs); effort setting if supported.
- Timing log `.flow/timing.jsonl`.

## 6. New skills (0.9.0)
`spike`, `triage`, `closeout`, `standup`.

## 7. Avoid duplication with the app (0.9.0)
Worker task prompt template in the toolkit; shared protected-path list for guard; document the `REPORT_JSON` schema.

## 8. Later
Overlap next wave with verify; dependency-driven scheduling.

## 9. Hooks
Check event and field names against the current docs first.
1. **SubagentStop done gate** (0.8.0): check `Task: Tn – done` line, `REPORT_JSON:` line, `STOP:` line when not done; send back once; honor `stop_hook_active`; no model call.
2. **SubagentStart/Stop telemetry** (0.8.0): append agent type, task id, duration to `.flow/timing.jsonl`.
3. **PreToolUse allow-list** (0.9.0): exact-match safe commands (read-only git, test/lint/typecheck from `CLAUDE.md`); no `&&`, `;`, `|`, redirects; guard tests.
4. **SessionStart** `startup|resume|compact` (0.9.0): 5-10 lines (branch, plan, wave, next step).
- Nice to have: Notification alert; PostToolUse formatter on the edited file only.
- Skip: UserPromptSubmit; Stop hook forcing build to continue; `Owns` enforcement by hook.
- Rules: keep fast and matchers narrow; fail open except the guard; a test corpus per hook; check whether plugin hooks run in the app's SDK sessions (telemetry would duplicate the app's usage tracking).

## Verify policy for Phase 4a (usable now)
Waves 1 and 4: step 0 only. Wave 2: full verify, 2 rounds, reviewer plus auditor, no test-writer, delta-only. Wave 3: step 0 plus reviewer, 1 round. Stop and ask if a worker is blocked or a finding is open after round 2.
