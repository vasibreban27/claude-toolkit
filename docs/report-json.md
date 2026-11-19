# Agent report footer: `REPORT_JSON`

Every flow agent ends its final message with one line `REPORT_JSON: {...}` (valid JSON, one line, nothing after it). The claude-desk app parses this line instead of scraping the text, and the `done-gate` hook (`plugins/flow/hooks/done-gate.js`) rejects a report whose footer does not match the schema below and sends it back once.

Version: the footer has no version field. A change to the keys below is a toolkit release note and a change in the app parser, like a plan format change (`docs/plan-format.md`).

## STOP codes
`stop` is `null` when the agent finished, otherwise one of these (the same code appears on the `STOP: <code>: <reason>` line):

| Code | Meaning | Gate |
|---|---|---|
| `blocked` | build, DB or tools broken, or tests keep failing | after one retry |
| `scope` | needs a source file outside `Owns` | yes |
| `decision` | contract mismatch, or a choice the plan does not cover | yes |
| `limit` | round limit, cost cap or time cap reached (raised by the orchestrator) | yes |
| `slow-tests` | the fast suite took over 60 s in `verify` (raised by the orchestrator, advisory: suggests splitting slow tests out) | no |

## Workers (`java-developer`, `python-developer`, `node-developer`, `frontend-developer`, `database-engineer`, `general-developer`)
Text: a line `Task: <id> – done | partial | blocked`, then a `STOP:` line when not done.
```
REPORT_JSON: {"task":"T3","status":"done","files":["src/a.ts"],"tests":"pass","stop":null}
REPORT_JSON: {"task":"T3","status":"blocked","files":[],"tests":"none","stop":"blocked"}
```
| Key | Type | Notes |
|---|---|---|
| `task` | string | equals the id on the `Task:` line (a task id `T3`, or a finding id `F2`/`S1` in a fix assignment) |
| `status` | `done` \| `partial` \| `blocked` | equals the status on the `Task:` line |
| `files` | string[] | files the worker changed |
| `tests` | `pass` \| `fail` \| `none` | result of the worker's own checks |
| `stop` | string \| null | STOP code; non-null exactly when `status` is not `done` |

## Reviewer and security auditor (`reviewer`, `security-auditor`)
Text: `Verdict: PASS | FAIL`, then the findings (`F<n>` for the reviewer, `S<n>` for the auditor).
```
REPORT_JSON: {"verdict":"FAIL","open":{"blocker":0,"major":1,"minor":2},"findings":["F1","F2","F3"],"stop":null}
```
| Key | Type | Notes |
|---|---|---|
| `verdict` | `PASS` \| `FAIL` | equals the `Verdict:` line; `PASS` requires `open.blocker` and `open.major` to be 0 |
| `open` | `{blocker, major, minor}` integers | findings still open |
| `findings` | string[] | ids of all findings in this report |
| `stop` | string \| null | `blocked` when the review could not run, else null |

## Test writer (`test-writer`)
```
REPORT_JSON: {"tests_added":3,"production_bugs":0,"stop":null}
```
| Key | Type | Notes |
|---|---|---|
| `tests_added` | integer | |
| `production_bugs` | integer | real bugs the new tests exposed |
| `stop` | string \| null | `blocked` or `decision` when it could not finish |

The examples above are checked against `done-gate.js` by `plugins/flow/hooks/test/shared.test.js`.
