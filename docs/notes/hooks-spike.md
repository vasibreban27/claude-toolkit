# Hooks spike (2026-11-17)

Source: Claude Code docs (hooks reference, sub-agents, skills, plugin components, Agent SDK plugins), read by a research subagent. Items marked "unverified" must be confirmed with a real run.

## Facts used by the 0.8.0 hooks
- Events: `SubagentStart`, `SubagentStop`. Both match on agent type. A plugin agent's type may be plugin-scoped (`flow:java-developer`), so hooks match `^(flow:)?name$` and re-check the type in the script.
- Common stdin: `session_id`, `transcript_path` (parent session), `cwd`, `hook_event_name`, `permission_mode`.
- `SubagentStart` adds `agent_id`, `agent_type`. Nothing else.
- `SubagentStop` adds `stop_hook_active`, `agent_id`, `agent_type`, `agent_transcript_path`, `last_assistant_message`.
- **Neither event gives duration or turn count.** Derive: duration = stop time minus the start time recorded by the `SubagentStart` hook for the same `agent_id`; turns = count of assistant entries in `agent_transcript_path`.
- Block and send back: stdout `{"decision":"block","reason":"..."}` (exit 0), or exit 2 with the reason on stderr. The reason becomes the subagent's next instruction. `stop_hook_active` is true when a stop hook already continued the agent; check it and block at most once. Claude Code also caps consecutive stop-hook continuations at 8.
- Caveat: a subagent that reports through a handback tool may have its report outside `last_assistant_message`. The done gate therefore fails open when that field is empty.
- Internal agents also fire `SubagentStop` with an empty or unrelated `agent_type`; hooks must ignore types that are not flow workers.

## Facts for 0.9.0
- `SessionStart` matchers: `startup`, `resume`, `clear`, `compact`, `fork`. Output `{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"..."}}`. Cannot block.
- `PreToolUse` allow: `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","permissionDecisionReason":"..."}}`. Deny and ask rules are still evaluated, and exit 2 blocks even when the JSON says allow. Several hooks: deny beats ask beats allow.
- `Notification` input: `message`, `title`, `notification_type`. Cannot block.
- `PostToolUse` input: `tool_name`, `tool_input`, `tool_response`, optional `duration_ms`.

## Frontmatter
- Agents support `maxTurns`, `effort` (`low`..`max`), `model`, `tools`, `disallowedTools`, `isolation`, `color`. Unknown fields are ignored silently.
- Plugin agents ignore `permissionMode`, `hooks`, `mcpServers`.
- Skills support `model`, `effort`, `allowed-tools`, `argument-hint`, `context: fork`. No `maxTurns` for skills.
- Decision: workers keep `maxTurns`; effort is set per role in a later release once timing data exists.

## Unverified
- Whether plugin `hooks/hooks.json` loads in Agent SDK sessions (`options.plugins`). Test it from claude-desk by checking whether `.flow/timing.jsonl` appears. If the hooks run there, the app's own usage tracking and `timing.js` record the same thing. `timing.js` is on by default (the toolkit needs to measure itself) and is switched off with `FLOW_TIMING=off`; the app can set that variable for its SDK sessions if it prefers its own tracking.
