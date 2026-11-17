# Threat model (copy to `docs/threat-model.md` in your project)

Read by the `security-auditor`. A finding outside this scope is `minor` and never blocks a wave. Keep it to one page.

## What the app is
<One or two lines: for example "local desktop app, runs as the logged-in user, no server".>

## Who attacks, and how (in scope)
- <for example: a hostile repository the user clones and opens (paths, symlinks, config files in the repo)>
- <for example: untrusted content rendered in the UI (markdown, HTML from tool output)>
- <for example: another local user on a shared machine>

## Trust boundaries
- <where untrusted input enters: IPC channels, HTTP endpoints, files read from disk, environment>

## Out of scope (reported as `minor` at most)
- <for example: an attacker who already has code execution as the user>
- <for example: exotic OS path quirks with no route from the in-scope inputs>
- <for example: denial of service by the local user against themselves>

## Rules for findings
- `blocker` and `major` need a reproduction: the exact input or steps in the app's real context, and the impact.
- Hardening advice without a reproduction is `minor`.
