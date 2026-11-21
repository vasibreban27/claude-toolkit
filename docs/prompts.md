# Shared worker prompts

The prompts that start a worker live in the toolkit, in `plugins/flow/prompts/`, so the `build` and `verify` skills and the claude-desk app send identical text. The app loads these files (it must not keep its own copy or redefine them; `CLAUDE.md` forbids redefining toolkit agents and skills).

| File | Used by | Placeholders |
|---|---|---|
| `worker-task.md` | `build`, one per plan task | `{{task_id}}`, `{{plan_path}}` |
| `worker-fix.md` | `verify`, one per finding (or group of findings in one file) | `{{finding_id}}`, `{{finding}}`, `{{plan_path}}` |

## Rules
- Placeholders are exactly `{{name}}` with lowercase letters and underscores. Replace every occurrence with a plain string, with no escaping and no other templating. A placeholder that is not in the table above is a bug (`hooks/test/shared.test.js` checks this).
- The file is the whole prompt. Nothing is prepended or appended by the caller; the worker agent's own file (`plugins/flow/agents/<worker>.md`) supplies the process and the report format, and points the worker at its stack rules and layout in `plugins/flow/conventions/<stack>.md` (via `${CLAUDE_PLUGIN_ROOT}`, substituted when the agent loads).
- The app resolves the files relative to the installed plugin root (`${CLAUDE_PLUGIN_ROOT}/prompts/`) or, in this repo, `plugins/flow/prompts/`.
- A change to a template or its placeholders is a toolkit change: bump the plugin version and tell the app.
