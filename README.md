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
| `pr` | Commit, push, open a PR | no (explicit only) |

Agents: `java-developer`, `python-developer`, `node-developer`, `frontend-developer`, `database-engineer` (workers),
`reviewer` (sonnet, read-only), `test-writer`, `security-auditor` (opus for auth/crypto/secrets/payments, sonnet otherwise; read-only, conditional).

Hooks (`plugins/flow/hooks/`) block secret-file access and unsafe git for you and all agents.

See [GUIDE.md](GUIDE.md) for how it all works together.
