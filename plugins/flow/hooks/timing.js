#!/usr/bin/env node
// SubagentStart / SubagentStop hook: appends one line per finished flow agent to .flow/timing.jsonl
// {ts, session_id, agent_type, agent_id, task, duration_ms, turns}
// Neither event provides duration or turns, so: duration = stop time - start time saved at SubagentStart;
// turns = assistant entries in agent_transcript_path. Fails open. Disable with FLOW_TIMING=off.
// .flow/ gets its own .gitignore ("*"), so nothing here reaches a commit.
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { kind, check } = require("./done-gate.js");

function flowDir(input) {
  const base = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
  return path.join(base, ".flow");
}
function ensure(dir) {
  fs.mkdirSync(path.join(dir, "running"), { recursive: true });
  const gi = path.join(dir, ".gitignore");
  if (!fs.existsSync(gi)) fs.writeFileSync(gi, "*\n");
}
const safe = (s) => String(s).replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 80);

function countTurns(file) {
  if (!file) return null;
  try {
    let n = 0;
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      if (!line) continue;
      try {
        const o = JSON.parse(line);
        if (o.type === "assistant" || (o.message && o.message.role === "assistant")) n++;
      } catch (_) {}
    }
    return n;
  } catch (_) {
    return null;
  }
}

function taskId(message) {
  const m = /^Task: (\S+) /m.exec(String(message || ""));
  if (m) return m[1];
  const j = /REPORT_JSON:.*?"task"\s*:\s*"([^"]+)"/.exec(String(message || ""));
  return j ? j[1] : null;
}

function main() {
  if (process.env.FLOW_TIMING === "off") return;
  let input;
  try {
    input = JSON.parse(fs.readFileSync(0, "utf8"));
  } catch (_) {
    return;
  }
  if (!input || !input.agent_id || !kind(input.agent_type)) return;
  const dir = flowDir(input);
  const marker = path.join(dir, "running", safe(input.agent_id));

  if (input.hook_event_name === "SubagentStart") {
    ensure(dir);
    fs.writeFileSync(marker, String(Date.now()));
    return;
  }
  if (input.hook_event_name !== "SubagentStop") return;
  // The done gate is about to send this agent back: it will stop again, log then.
  if (input.stop_hook_active !== true && process.env.FLOW_DONE_GATE !== "off" && check(input.agent_type, input.last_assistant_message).length) return;
  let start = null;
  try {
    start = Number(fs.readFileSync(marker, "utf8"));
    fs.rmSync(marker, { force: true });
  } catch (_) {}
  ensure(dir);
  const row = {
    ts: new Date().toISOString(),
    session_id: input.session_id || null,
    agent_type: input.agent_type,
    agent_id: input.agent_id,
    task: taskId(input.last_assistant_message),
    duration_ms: start ? Date.now() - start : null,
    turns: countTurns(input.agent_transcript_path),
  };
  fs.appendFileSync(path.join(dir, "timing.jsonl"), JSON.stringify(row) + "\n");
}

try {
  main();
} catch (e) {
  try {
    process.stderr.write("flow timing: " + e.message + "\n");
  } catch (_) {}
}
process.exit(0);
