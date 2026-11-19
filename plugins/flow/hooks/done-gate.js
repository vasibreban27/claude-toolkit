#!/usr/bin/env node
// SubagentStop hook: checks the final report of a flow agent and sends it back once if the format is wrong.
// No model call. Fails open: any internal error, unknown agent type, empty message or stop_hook_active=true -> exit 0.
// Report formats are defined in the agents' own files and in skills/build/SKILL.md (STOP codes).
"use strict";

const WORKERS = ["java-developer", "python-developer", "node-developer", "frontend-developer", "database-engineer", "general-developer"];
const REVIEWERS = ["reviewer", "security-auditor"];
const STOP_CODES = ["blocked", "scope", "decision", "limit"];
const AGENT_RE = /^(?:flow:)?([a-z-]+)$/;

function kind(agentType) {
  const m = AGENT_RE.exec(String(agentType || ""));
  if (!m) return null;
  if (WORKERS.includes(m[1])) return "worker";
  if (REVIEWERS.includes(m[1])) return "reviewer";
  if (m[1] === "test-writer") return "test-writer";
  return null;
}

function lastLine(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  return lines.length ? lines[lines.length - 1] : "";
}

function parseFooter(text, problems) {
  const last = lastLine(text);
  if (!last.startsWith("REPORT_JSON:")) {
    problems.push("the last line must be `REPORT_JSON: {...}` with nothing after it");
    return null;
  }
  try {
    const o = JSON.parse(last.slice("REPORT_JSON:".length).trim());
    if (o && typeof o === "object" && !Array.isArray(o)) return o;
  } catch (_) {}
  problems.push("the `REPORT_JSON:` line is not a valid one-line JSON object");
  return null;
}

function checkStop(text, json, needed, problems) {
  const m = /^STOP: ([a-z-]+): .+$/m.exec(text);
  if (needed && !m) problems.push("a `STOP: <code>: <reason>` line is required when the task is not done (code from: " + STOP_CODES.join(", ") + ")");
  if (m && !STOP_CODES.includes(m[1])) problems.push("STOP code `" + m[1] + "` is not one of: " + STOP_CODES.join(", "));
  if (json) {
    if (!("stop" in json)) problems.push("REPORT_JSON must contain a `stop` key (the STOP code or null)");
    else if (needed && m && json.stop !== m[1]) problems.push("REPORT_JSON `stop` must equal the STOP line's code `" + m[1] + "`");
    else if (!needed && !m && json.stop !== null) problems.push("REPORT_JSON `stop` must be null when there is no STOP line");
  }
}

// Returns a list of problems (empty = report is fine).
function check(agentType, message) {
  const k = kind(agentType);
  const text = String(message || "");
  if (!k || !text.trim()) return [];
  const problems = [];
  const json = parseFooter(text, problems);

  if (k === "worker") {
    const t = /^Task: (\S+) [–-] (done|partial|blocked)\s*$/m.exec(text);
    if (!t) problems.push("missing the line `Task: <id> – done | partial | blocked`");
    if (json) {
      if (typeof json.task !== "string") problems.push("REPORT_JSON must contain `task`");
      else if (t && json.task !== t[1]) problems.push("REPORT_JSON `task` must equal the id on the Task line (`" + t[1] + "`)");
      if (!["done", "partial", "blocked"].includes(json.status)) problems.push("REPORT_JSON `status` must be done, partial or blocked");
      else if (t && json.status !== t[2]) problems.push("REPORT_JSON `status` must equal the status on the Task line (`" + t[2] + "`)");
    }
    checkStop(text, json, !!t && t[2] !== "done", problems);
  } else if (k === "reviewer") {
    const v = /^Verdict: (PASS|FAIL)\b/m.exec(text);
    if (!v) problems.push("missing the line `Verdict: PASS | FAIL`");
    if (json) {
      if (!["PASS", "FAIL"].includes(json.verdict)) problems.push("REPORT_JSON `verdict` must be PASS or FAIL");
      else if (v && json.verdict !== v[1]) problems.push("REPORT_JSON `verdict` must equal the Verdict line (`" + v[1] + "`)");
      const o = json.open;
      if (!o || typeof o !== "object" || ["blocker", "major", "minor"].some((x) => !Number.isInteger(o[x]))) problems.push("REPORT_JSON `open` must be {blocker, major, minor} integers");
      else if (json.verdict === "PASS" && (o.blocker > 0 || o.major > 0)) problems.push("verdict PASS contradicts open blocker or major findings");
      if (!Array.isArray(json.findings)) problems.push("REPORT_JSON `findings` must be an array of ids");
    }
    const stopLine = /^STOP: /m.test(text);
    checkStop(text, json, stopLine, problems);
  } else {
    if (json) {
      if (!Number.isInteger(json.tests_added) || !Number.isInteger(json.production_bugs)) problems.push("REPORT_JSON must contain integer `tests_added` and `production_bugs`");
    }
    checkStop(text, json, /^STOP: /m.test(text), problems);
  }
  return problems;
}

function main() {
  if (process.env.FLOW_DONE_GATE === "off") return;
  let input;
  try {
    input = JSON.parse(require("node:fs").readFileSync(0, "utf8"));
  } catch (_) {
    return;
  }
  if (!input || input.stop_hook_active === true) return; // block at most once
  const problems = check(input.agent_type, input.last_assistant_message);
  if (!problems.length) return;
  const reason =
    "Your final report does not match the required format:\n- " +
    problems.join("\n- ") +
    "\nSend only the corrected final report now, in exactly the format from your instructions. Do not redo the work.";
  process.stdout.write(JSON.stringify({ decision: "block", reason }));
}

module.exports = { check, kind, STOP_CODES };

if (require.main === module) {
  try {
    main();
  } catch (e) {
    try {
      process.stderr.write("flow done-gate: " + e.message + "\n");
    } catch (_) {}
  }
  process.exitCode = 0; // not process.exit(): lets the stdout write finish on every platform
}
